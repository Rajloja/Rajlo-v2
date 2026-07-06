import { NextRequest, NextResponse } from "next/server";
import { logAdminAction, requireAdmin } from "@/lib/admin-auth";

/**
 * GET  /api/admin/users
 * POST /api/admin/users     (invite a new user)
 *
 * GET supports search + filter:
 *   ?role=rider|driver|admin        (default = all)
 *   ?status=active|deactivated|deleted (only meaningful for drivers /
 *                                       soft-deleted users)
 *   ?q=<search>                     (matches name / email / external_id)
 *   ?limit=50 (max 200) ?offset=0
 *
 * DELETED USERS: retained (anonymised) in the profiles table for the
 * audit / safety / finance trail — see /api/admin/users/[id] DELETE.
 * They are HIDDEN from the default list so day-to-day admin work isn't
 * cluttered by them; pass ?status=deleted to see them explicitly.
 *
 * The list merges three data sources:
 *   - profiles (full_name, role)
 *   - auth.users (email, last_sign_in_at, banned_until)
 *   - drivers   (external_id, plate, activated, deactivated_at)  — only if role=driver
 *
 * POST creates an auth user via the admin API + a profiles row. Used
 * by the "Invite admin" flow on /admin/users.
 */

type UserListRow = {
  id: string;
  fullName: string;
  email: string | null;
  role: "rider" | "driver" | "admin";
  phone: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  // Driver-only enrichments (null for riders/admins)
  driverExternalId: string | null;
  driverPlate: string | null;
  driverActivated: boolean | null;
  driverOnboardingStatus: string | null;
  deactivatedAt: string | null;
  banned: boolean;
  // Set when the user self-deleted their account (anonymised, but
  // their rides/wallet/audit trail is retained for the admin).
  deletedAt: string | null;
  // Activity counts — best-effort, kept light (1 query each, batched)
  ridesCount: number;
};

export async function GET(request: NextRequest) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const { searchParams } = request.nextUrl;
  const role = searchParams.get("role") ?? "all";
  const status = searchParams.get("status") ?? "all";
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    200,
    Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50),
  );
  const offset = Math.max(0, parseInt(searchParams.get("offset") ?? "0", 10) || 0);

  // 1. Pull profiles (server-side filter on role + name search)
  let profileQuery = supabase
    .from("profiles")
    .select("id, full_name, phone, role, created_at, deleted_at", {
      count: "exact",
    });

  if (role !== "all") profileQuery = profileQuery.eq("role", role);
  if (q) profileQuery = profileQuery.ilike("full_name", `%${q}%`);

  profileQuery = profileQuery
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data: profileRows, count: profileCount, error: profileError } =
    await profileQuery;

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  type ProfileRow = {
    id: string;
    full_name: string | null;
    phone: string | null;
    role: "rider" | "driver" | "admin";
    created_at: string;
    deleted_at: string | null;
  };
  const profiles = (profileRows ?? []) as ProfileRow[];
  const ids = profiles.map((p) => p.id);

  // 2. Hydrate auth.users (email, sign-in metadata, banned state).
  //    listUsers is pageable but we only need a per-id lookup, and
  //    Supabase doesn't expose bulk-by-id, so we paginate up to 1000.
  const authUsersById = new Map<
    string,
    { email: string | null; last_sign_in_at: string | null; banned: boolean }
  >();
  try {
    const { data: authData } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    (authData?.users ?? []).forEach((u) => {
      const banned =
        Boolean(u.banned_until) &&
        new Date(u.banned_until!).getTime() > Date.now();
      authUsersById.set(u.id, {
        email: u.email ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        banned,
      });
    });
  } catch (e) {
    // Log only the message — full error object can include connection
    // strings + cookies in the underlying fetch trace.
    console.error(
      "auth.admin.listUsers failed:",
      e instanceof Error ? e.message : "unknown error",
    );
  }

  // 3. Hydrate drivers (only if any of the page rows are drivers)
  const driversById = new Map<
    string,
    {
      external_id: string;
      plate_number: string | null;
      activated: boolean;
      onboarding_status: string;
      deactivated_at: string | null;
    }
  >();
  if (ids.length > 0) {
    const { data: driverRows } = await supabase
      .from("drivers")
      .select(
        "user_id, external_id, plate_number, activated, onboarding_status, deactivated_at",
      )
      .in("user_id", ids);
    ((driverRows ?? []) as Array<{
      user_id: string;
      external_id: string;
      plate_number: string | null;
      activated: boolean;
      onboarding_status: string;
      deactivated_at: string | null;
    }>).forEach((d) =>
      driversById.set(d.user_id, {
        external_id: d.external_id,
        plate_number: d.plate_number,
        activated: d.activated,
        onboarding_status: d.onboarding_status,
        deactivated_at: d.deactivated_at,
      }),
    );
  }

  // 4. Per-user ride count — single grouped query.
  //    For riders: rides where rider_id = user.id
  //    For drivers: rides where driver_id = drivers.id
  const ridesByUser = new Map<string, number>();
  if (ids.length > 0) {
    const { data: riderRides } = await supabase
      .from("rides")
      .select("rider_id")
      .in("rider_id", ids);
    ((riderRides ?? []) as { rider_id: string }[]).forEach((r) =>
      ridesByUser.set(r.rider_id, (ridesByUser.get(r.rider_id) ?? 0) + 1),
    );

    const driverIds = Array.from(driversById.values()).map((d) => d.external_id);
    if (driverIds.length > 0) {
      const driverRowIds = Array.from(driversById.entries());
      const driverRowIdMap = new Map(
        driverRowIds.map(([userId, d]) => [d.external_id, userId]),
      );
      // Map driver row IDs back to user IDs for the count
      const driverInternalIds = driverRowIds
        .map(([, d]) => d.external_id)
        .filter(Boolean);
      if (driverInternalIds.length > 0) {
        const { data: drvIdRows } = await supabase
          .from("drivers")
          .select("id, external_id")
          .in("external_id", driverInternalIds);
        const idsByExternal = new Map(
          ((drvIdRows ?? []) as { id: string; external_id: string }[]).map(
            (d) => [d.external_id, d.id],
          ),
        );
        const internalDriverIds = driverInternalIds
          .map((ext) => idsByExternal.get(ext))
          .filter(Boolean) as string[];
        if (internalDriverIds.length > 0) {
          const { data: drvRides } = await supabase
            .from("rides")
            .select("driver_id")
            .in("driver_id", internalDriverIds);
          ((drvRides ?? []) as { driver_id: string }[]).forEach((r) => {
            const ext = drvIdRows?.find((d) => d.id === r.driver_id)
              ?.external_id;
            if (!ext) return;
            const userId = driverRowIdMap.get(ext);
            if (!userId) return;
            ridesByUser.set(userId, (ridesByUser.get(userId) ?? 0) + 1);
          });
        }
      }
    }
  }

  let users: UserListRow[] = profiles.map((p) => {
    const auth = authUsersById.get(p.id);
    const driver = driversById.get(p.id);
    return {
      id: p.id,
      fullName: p.full_name ?? "Unnamed user",
      email: auth?.email ?? null,
      role: p.role,
      phone: p.phone,
      createdAt: p.created_at,
      lastSignInAt: auth?.last_sign_in_at ?? null,
      driverExternalId: driver?.external_id ?? null,
      driverPlate: driver?.plate_number ?? null,
      driverActivated: driver?.activated ?? null,
      driverOnboardingStatus: driver?.onboarding_status ?? null,
      deactivatedAt: driver?.deactivated_at ?? null,
      banned: auth?.banned ?? false,
      // Set when the user self-deleted. Lets the admin list badge a
      // "Deleted" account distinctly from one an admin merely banned.
      deletedAt: p.deleted_at,
      ridesCount: ridesByUser.get(p.id) ?? 0,
    };
  });

  // Apply status filter post-hoc (cheap; small page).
  if (status === "deleted") {
    // Explicit "show me the audit-trail retention" mode.
    users = users.filter((u) => u.deletedAt !== null);
  } else {
    // Every other status filter (all / active / deactivated) hides
    // soft-deleted users. They live in the DB for the audit trail —
    // but they don't belong in the day-to-day admin list.
    users = users.filter((u) => u.deletedAt === null);

    if (status === "active") {
      users = users.filter((u) => {
        if (u.role !== "driver") return true;
        return u.driverActivated === true && !u.deactivatedAt && !u.banned;
      });
    } else if (status === "deactivated") {
      users = users.filter(
        (u) => u.banned || (u.role === "driver" && u.deactivatedAt),
      );
    }
  }

  // Apply email/external-id search post-hoc since we couldn't ILIKE
  // across joined tables in one query.
  if (q) {
    const needle = q.toLowerCase();
    users = users.filter(
      (u) =>
        u.fullName.toLowerCase().includes(needle) ||
        (u.email ?? "").toLowerCase().includes(needle) ||
        (u.driverExternalId ?? "").toLowerCase().includes(needle) ||
        (u.driverPlate ?? "").toLowerCase().includes(needle),
    );
  }

  return NextResponse.json({
    users,
    total: profileCount ?? users.length,
    limit,
    offset,
  });
}

/**
 * POST /api/admin/users — invite a user (creates auth + profile).
 *
 * Body: { email, fullName, role, phone? }
 *
 * Currently used to invite admins or back-office riders. Drivers are
 * onboarded through the public `/auth/driver/login` → onboarding flow.
 */
export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { actor, supabase } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    fullName?: unknown;
    role?: unknown;
    phone?: unknown;
  };
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const fullName =
    typeof body.fullName === "string" ? body.fullName.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (!email || !fullName || !role) {
    return NextResponse.json(
      { error: "email, fullName and role are required" },
      { status: 400 },
    );
  }
  if (!["rider", "admin"].includes(role)) {
    return NextResponse.json(
      {
        error:
          "role must be 'rider' or 'admin' — drivers must self-register via the onboarding flow",
      },
      { status: 400 },
    );
  }

  // Send a magic-link invite. The user signs in, lands on the appropriate
  // portal, and the profile row is created here so they show up on the
  // admin list immediately.
  const { data: invited, error: inviteError } =
    await supabase.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
    });

  if (inviteError || !invited?.user) {
    return NextResponse.json(
      { error: inviteError?.message ?? "Couldn't invite user" },
      { status: 500 },
    );
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: invited.user.id,
      full_name: fullName,
      phone: phone || null,
      role,
    },
    { onConflict: "id" },
  );

  if (profileError) {
    console.error("profile upsert after invite failed:", profileError.message);
  }

  await logAdminAction(supabase, actor, {
    targetType: role === "admin" ? "admin" : "rider",
    targetId: invited.user.id,
    targetLabel: `${fullName} (${email})`,
    action: "invite",
    summary: `${actor.label} invited ${fullName} as ${role}`,
    metadata: { email, role },
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: invited.user.id,
      email,
      fullName,
      role,
    },
  });
}
