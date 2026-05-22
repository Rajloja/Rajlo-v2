import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";
import { getBalanceWithLock } from "@/lib/wallet-holds";

/**
 * POST /api/rider/qr/preview
 *
 * Body: { code: string }
 *
 * Resolves a QR pay code to a charge preview the rider sees BEFORE
 * confirming: amount, driver name, vehicle, plate, current wallet
 * balance, whether it's enough, and how long until the charge expires.
 *
 * No state changes here — purely a read.
 *
 * Returns 404 for unknown codes, 410 for expired/cancelled, 409 if
 * already paid (so the rider knows they're not double-charging).
 */

type PreviewBody = { code?: unknown };

export async function POST(request: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as PreviewBody;
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code || code.length !== 8) {
    return NextResponse.json(
      { error: "Enter the 8-character code from the driver's screen." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Service role not configured" },
      { status: 500 },
    );
  }

  const { data: charge } = await supabase
    .from("qr_charges")
    .select(
      "id, code, amount_jmd, description, status, expires_at, driver_id, driver_user_id",
    )
    .eq("code", code)
    .maybeSingle();

  if (!charge) {
    return NextResponse.json(
      { error: "code_not_found", message: "That code doesn't match any active charge." },
      { status: 404 },
    );
  }

  // Defence in depth: a rider can't pay themselves (would let a driver
  // charge their own wallet from another device).
  if (charge.driver_user_id === user.id) {
    return NextResponse.json(
      { error: "self_pay", message: "You can't pay your own QR charge." },
      { status: 400 },
    );
  }

  const expired =
    charge.status === "expired" ||
    (charge.status === "pending" && new Date(charge.expires_at) < new Date());

  if (charge.status === "cancelled" || expired) {
    return NextResponse.json(
      {
        error: "no_longer_valid",
        message:
          charge.status === "cancelled"
            ? "The driver cancelled this charge."
            : "This charge expired — ask the driver to generate a new code.",
      },
      { status: 410 },
    );
  }
  if (charge.status === "confirmed") {
    return NextResponse.json(
      {
        error: "already_paid",
        message: "This charge was already paid.",
      },
      { status: 409 },
    );
  }

  // Driver display name + vehicle for the confirm screen header.
  const { data: driver } = await supabase
    .from("drivers")
    .select(
      "first_name, last_name, plate_number, vehicle_make, vehicle_model, vehicle_color",
    )
    .eq("id", charge.driver_id)
    .maybeSingle();

  // Spendable balance — raw minus any active hold (e.g. an in-flight
  // multi-leg journey). The "sufficient" gate must respect the lock
  // so paying a QR Pay charge can't drain money already reserved for
  // a trip the rider is mid-journey on.
  const { availableJmd, balanceJmd, lockedJmd } = await getBalanceWithLock(
    supabase,
    user.id,
  );
  const sufficient = availableJmd >= (charge.amount_jmd as number);

  return NextResponse.json({
    charge: {
      id: charge.id,
      code: charge.code,
      amountJmd: charge.amount_jmd,
      description: charge.description,
      expiresAt: charge.expires_at,
      driver: {
        firstName: driver?.first_name ?? null,
        lastName: driver?.last_name ?? null,
        plateNumber: driver?.plate_number ?? null,
        vehicleMake: driver?.vehicle_make ?? null,
        vehicleModel: driver?.vehicle_model ?? null,
        vehicleColor: driver?.vehicle_color ?? null,
      },
    },
    wallet: {
      balanceJmd,
      availableJmd,
      lockedJmd,
      sufficient,
      shortfallJmd: sufficient
        ? 0
        : (charge.amount_jmd as number) - availableJmd,
    },
  });
}
