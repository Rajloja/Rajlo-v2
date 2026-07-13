import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import {
  sendDriverMatchedEmail,
  sendDriverRideAcceptedEmail,
} from "@/lib/email-templates";
import { notifyRider } from "@/lib/notify";
import { resolveDriverEmail } from "@/lib/driver-email-resolver";
import {
  checkDriverOperationEligibility,
  eligibilityErrorPayload,
} from "@/lib/driver-eligibility";

/**
 * POST /api/driver/rides/[id]/accept
 *
 * An activated driver claims a `requested` ride. Atomic via a conditional
 * update (`status='requested' AND driver_id IS NULL`) so two drivers can't
 * both succeed in a race — whichever update touches 0 rows loses cleanly.
 */

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  // 1. Caller must be an activated, non-deactivated, currently-ONLINE
  // driver. `is_online` is the crucial addition here — before it, a
  // driver could go online, receive the push for a hail, toggle
  // themselves offline BEFORE tapping Accept, and still successfully
  // claim the ride via a stale push notification tap. The rider would
  // then get a driver who no longer intended to drive. The check runs
  // at the accept moment (not just at push-time) so state changes
  // during the offer's ~30s validity window are respected.
  const { data: driver } = await supabase
    .from("drivers")
    .select("id, external_id, activated, deactivated_at, is_online")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!driver) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!driver.activated || driver.deactivated_at) {
    return NextResponse.json(
      { error: "Your driver account isn't currently active" },
      { status: 403 },
    );
  }
  if (!driver.is_online) {
    return NextResponse.json(
      {
        error: "not_online",
        message:
          "You went offline before this trip was claimed. Go online again to accept new rides.",
      },
      { status: 409 },
    );
  }

  // 1a. Real-time operating-eligibility gate. The `activated` check
  // above only reads the row flag — a driver whose TA badge, licence,
  // COF, insurance or red-plate reg has expired since the last cron
  // sweep could still slip past. This helper joins the required-doc
  // list against expires_on TODAY and — critically — auto-suspends
  // the driver row if any doc has lapsed. Belt-and-braces with the
  // same check on the online-toggle endpoint: a driver could have
  // been safely online at 23:59 with a doc expiring at 00:00, and
  // the accept-time check catches that even if the online-toggle
  // check never re-fired.
  //
  // Rider safety per the "trust-critical" memory note — this MUST
  // execute before we ever mutate ride.driver_id.
  const eligibility = await checkDriverOperationEligibility(supabase, {
    driverId: driver.id,
  });
  if (!eligibility.eligible) {
    return NextResponse.json(eligibilityErrorPayload(eligibility), {
      status: 403,
    });
  }

  // 2. Look up the ride to find out if it's part of a carpool group.
  // Carpool rides have to be accepted together — the driver is
  // committing to TWO riders, not one. Also pull `expires_at` so
  // we can reject claims past the timeout window before we even
  // attempt the conditional update.
  const { data: target } = await supabase
    .from("rides")
    .select("id, carpool_group_id, expires_at")
    .eq("id", id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "Ride not found" }, { status: 404 });
  }
  if (
    target.expires_at &&
    new Date(target.expires_at).getTime() <= Date.now()
  ) {
    return NextResponse.json(
      { error: "This request has expired and is no longer available." },
      { status: 410 },
    );
  }

  // 3. Atomic claim. For solo rides we update the single row. For
  // carpool rides we update every row in the group with the same
  // conditions (`status='requested' AND driver_id IS NULL`), and roll
  // back if any update touched zero rows — that means another driver
  // raced us to one of the group's rides.
  const acceptedAt = new Date().toISOString();
  let claimedIds: string[];
  let claimedRiderIds: string[];

  if (target.carpool_group_id) {
    // Group-claim: scope by group_id and the same atomic conditions.
    // We load the group's expected size first so we can verify the
    // update affected ALL of them.
    const { data: groupRides } = await supabase
      .from("rides")
      .select("id")
      .eq("carpool_group_id", target.carpool_group_id);
    const expectedCount = groupRides?.length ?? 0;

    const { data: claimed, error: claimError } = await supabase
      .from("rides")
      .update({
        driver_id: driver.id,
        status: "accepted",
        accepted_at: acceptedAt,
      })
      .eq("carpool_group_id", target.carpool_group_id)
      .eq("status", "requested")
      .is("driver_id", null)
      .select("id, rider_id");

    if (claimError) {
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }
    if (!claimed || claimed.length === 0) {
      return NextResponse.json(
        { error: "This carpool was just accepted by another driver." },
        { status: 409 },
      );
    }
    if (claimed.length !== expectedCount) {
      // Partial claim — another driver beat us to one of the group's
      // rides. Revert what we just claimed so we don't leave the group
      // half-assigned.
      await supabase
        .from("rides")
        .update({ driver_id: null, status: "requested", accepted_at: null })
        .in(
          "id",
          claimed.map((c) => c.id),
        );
      return NextResponse.json(
        { error: "Couldn't claim the whole carpool — another driver got part of it." },
        { status: 409 },
      );
    }

    // Update the group row to reflect the assigned driver.
    await supabase
      .from("carpool_groups")
      .update({ driver_id: driver.id, status: "dispatched" })
      .eq("id", target.carpool_group_id);

    claimedIds = claimed.map((c) => c.id);
    claimedRiderIds = claimed.map((c) => c.rider_id);
  } else {
    // Solo claim — original behaviour.
    const { data: claimed, error: claimError } = await supabase
      .from("rides")
      .update({
        driver_id: driver.id,
        status: "accepted",
        accepted_at: acceptedAt,
      })
      .eq("id", id)
      .eq("status", "requested")
      .is("driver_id", null)
      .select("id, rider_id")
      .maybeSingle();

    if (claimError) {
      return NextResponse.json({ error: claimError.message }, { status: 500 });
    }
    if (!claimed) {
      return NextResponse.json(
        { error: "This ride was just accepted by another driver." },
        { status: 409 },
      );
    }
    claimedIds = [claimed.id];
    claimedRiderIds = [claimed.rider_id];
  }

  // 4. Audit events — one row per ride so the per-ride event log
  // stays a complete narrative for each rider's view.
  await supabase.from("ride_events").insert(
    claimedIds.map((rideId) => ({
      ride_id: rideId,
      event: "accepted",
      actor_role: "driver",
      actor_id: driver.external_id,
      metadata: {
        driverInternalId: driver.id,
        carpoolGroupId: target.carpool_group_id,
        groupSize: claimedIds.length,
      },
    })),
  );

  // 5. Best-effort "driver matched" email to each affected rider. We
  // pull the full ride record + driver profile so we can include
  // pickup/dropoff names, plate, vehicle, and ETA in the email.
  void (async () => {
    try {
      const [{ data: rideRows }, { data: driverFull }] = await Promise.all([
        supabase
          .from("rides")
          .select(
            "id, rider_id, pickup_name, dropoff_name, seats, estimated_fare_jmd, estimated_eta_minutes",
          )
          .in("id", claimedIds),
        supabase
          .from("drivers")
          .select(
            "first_name, last_name, email, user_id, plate_number, vehicle_make, vehicle_model, vehicle_year, vehicle_color",
          )
          .eq("id", driver.id)
          .maybeSingle(),
      ]);

      if (!rideRows || !driverFull) return;

      const driverName =
        [driverFull.first_name, driverFull.last_name].filter(Boolean).join(" ") ||
        "Your driver";

      const vehicle = [
        driverFull.vehicle_year ? String(driverFull.vehicle_year) : null,
        driverFull.vehicle_color,
        driverFull.vehicle_make,
        driverFull.vehicle_model,
      ]
        .filter(Boolean)
        .join(" ") || null;

      // Rider emails live in auth.users — pull via admin API. Names
      // live in public.profiles.full_name.
      const riderIds = Array.from(new Set(rideRows.map((r) => r.rider_id)));
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", riderIds);
      const profileMap = new Map(profiles?.map((p) => [p.id, p]) ?? []);

      // Driver-side confirmation email — one per accepted ride. Uses
      // the resolver so OAuth signups w/o drivers.email still receive.
      const driverEmail = await resolveDriverEmail(supabase, driverFull);
      if (driverEmail) {
        await Promise.all(
          rideRows.map(async (row) => {
            const profile = profileMap.get(row.rider_id);
            await sendDriverRideAcceptedEmail(driverEmail, {
              driverName,
              rideId: row.id,
              riderFirstName:
                profile?.full_name?.split(" ")[0] ?? null,
              pickup: row.pickup_name,
              dropoff: row.dropoff_name,
              fareJMD: row.estimated_fare_jmd,
              seats: row.seats,
            }).catch(() => null);
          }),
        );
      }

      const userLookups = await Promise.all(
        riderIds.map((id) =>
          supabase.auth.admin.getUserById(id).then((r) => ({
            id,
            email: r.data.user?.email ?? null,
          })),
        ),
      );
      const emailMap = new Map(userLookups.map((u) => [u.id, u.email]));

      await Promise.all(
        rideRows.flatMap((row) => {
          const email = emailMap.get(row.rider_id);
          const fullName = profileMap.get(row.rider_id)?.full_name ?? null;
          const tasks: Array<Promise<unknown>> = [
            // In-app inbox + web push to the rider's devices.
            // Body is packed into a single line because web push (no
            // BigTextStyle) shows ~80 chars on the lock screen. Order
            // chosen so the most useful info ("what car am I looking
            // for") wins if the body gets truncated:
            //   "{Year Color Make Model} · plate {plate} · ETA {N} min"
            // Full driver card lives one tap away on /rider/live-trip.
            notifyRider(supabase, {
              riderId: row.rider_id,
              kind: "trip",
              title: `${driverName.split(" ")[0]} is on the way`,
              body: [
                vehicle,
                driverFull.plate_number
                  ? `plate ${driverFull.plate_number}`
                  : null,
                row.estimated_eta_minutes != null
                  ? `ETA ~${row.estimated_eta_minutes} min`
                  : null,
              ]
                .filter(Boolean)
                .join(" · "),
              href: `/rider/live-trip?id=${row.id}`,
              cta: "View trip details",
              pushTag: `ride-${row.id}-status`,
            }),
          ];
          if (email) {
            tasks.push(
              sendDriverMatchedEmail(email, {
                riderFirstName: fullName,
                rideId: row.id,
                driverName,
                vehicle,
                plate: driverFull.plate_number,
                etaMinutes: row.estimated_eta_minutes,
                pickup: row.pickup_name,
                dropoff: row.dropoff_name,
              }).catch(() => null),
            );
          }
          return tasks;
        }),
      );
    } catch {
      /* email is best-effort */
    }
  })();

  return NextResponse.json({
    ok: true,
    rideId: claimedIds[0],
    rideIds: claimedIds,
    riderIds: claimedRiderIds,
    carpool: target.carpool_group_id
      ? { groupId: target.carpool_group_id, size: claimedIds.length }
      : null,
  });
}
