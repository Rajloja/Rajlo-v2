import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/incidents/my-trips
 *
 * Returns the caller's recent trips so the incident report form can
 * offer a "which trip?" dropdown instead of a free-text id field.
 *
 * Covers both private rides and route-taxi hails. For a rider that's
 * everything keyed to their user id; for a driver it's the private
 * rides assigned to their `drivers` row.
 */

type Trip = { id: string; label: string };

/** "May 15 · Half Way Tree → New Kingston" */
function tripLabel(
  at: string | null,
  pickup: string | null,
  dropoff: string | null,
): string {
  const date = at
    ? new Date(at).toLocaleDateString("en-JM", {
        // Pin to Jamaica — server-rendered, so absent this the string
        // would fall back to the server's local timezone (Vercel = UTC
        // or EDT depending on runtime region), shifting the date by 4-5
        // hours around midnight and mis-labelling late-evening trips.
        timeZone: "America/Jamaica",
        month: "short",
        day: "numeric",
      })
    : "—";
  const from = pickup?.trim() || "Pickup";
  const to = dropoff?.trim() || "Drop-off";
  return `${date} · ${from} → ${to}`;
}

export async function GET() {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: profile } = await auth
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = (profile as { role?: string } | null)?.role ?? "rider";

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ trips: [] });
  }

  const trips: { id: string; label: string; at: string | null }[] = [];

  if (role === "driver") {
    // Private rides assigned to this driver's drivers-row id.
    const { data: driver } = await supabase
      .from("drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (driver?.id) {
      const { data: rides } = await supabase
        .from("rides")
        .select("id, pickup_name, dropoff_name, requested_at")
        .eq("driver_id", driver.id)
        .order("requested_at", { ascending: false })
        .limit(40);
      for (const r of rides ?? []) {
        trips.push({
          id: r.id as string,
          at: r.requested_at as string | null,
          label: tripLabel(
            r.requested_at as string | null,
            r.pickup_name as string | null,
            r.dropoff_name as string | null,
          ),
        });
      }
    }
  } else {
    // Rider: private rides + route-taxi hails keyed to the user id.
    const [{ data: rides }, { data: hails }] = await Promise.all([
      supabase
        .from("rides")
        .select("id, pickup_name, dropoff_name, requested_at")
        .eq("rider_id", user.id)
        .order("requested_at", { ascending: false })
        .limit(40),
      supabase
        .from("route_hails")
        .select("id, pickup_name, dropoff_name, requested_at")
        .eq("rider_id", user.id)
        .order("requested_at", { ascending: false })
        .limit(40),
    ]);
    for (const r of rides ?? []) {
      trips.push({
        id: r.id as string,
        at: r.requested_at as string | null,
        label: tripLabel(
          r.requested_at as string | null,
          r.pickup_name as string | null,
          r.dropoff_name as string | null,
        ),
      });
    }
    for (const h of hails ?? []) {
      trips.push({
        id: h.id as string,
        at: h.requested_at as string | null,
        label: `${tripLabel(
          h.requested_at as string | null,
          h.pickup_name as string | null,
          h.dropoff_name as string | null,
        )} (Route Taxi)`,
      });
    }
  }

  // Newest first across both trip types.
  trips.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));

  const result: Trip[] = trips
    .slice(0, 40)
    .map(({ id, label }) => ({ id, label }));
  return NextResponse.json({ trips: result });
}
