import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

/**
 * Admin CRUD for the contact-form recipient roster.
 *
 *   GET    /api/admin/contact-recipients
 *          → { recipients: { id, email, active, note, createdAt }[] }
 *
 *   POST   /api/admin/contact-recipients
 *          body: { email: string, note?: string, active?: boolean }
 *          → { ok: true, recipient }
 *
 *   PATCH  /api/admin/contact-recipients
 *          body: { id: string, active?: boolean, note?: string }
 *          → { ok: true }
 *
 *   DELETE /api/admin/contact-recipients
 *          body: { id: string }
 *          → { ok: true }
 *
 * The endpoint is admin-gated via requireAdmin(); the underlying
 * service-role client also bypasses RLS so the queries always succeed
 * for an authenticated admin even before the RLS policies are in
 * place on a given environment.
 */

type RecipientRow = {
  id: string;
  email: string;
  active: boolean;
  note: string | null;
  created_at: string;
};

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export async function GET() {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const { data, error } = await supabase
    .from("contact_recipients")
    .select("id, email, active, note, created_at")
    .order("created_at", { ascending: true })
    .returns<RecipientRow[]>();
  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to load recipients" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    recipients: (data ?? []).map((r) => ({
      id: r.id,
      email: r.email,
      active: r.active,
      note: r.note,
      createdAt: r.created_at,
    })),
  });
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase, actor } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    email?: unknown;
    note?: unknown;
    active?: unknown;
  };

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { error: "A valid email address is required." },
      { status: 400 },
    );
  }
  const note =
    typeof body.note === "string" ? body.note.trim().slice(0, 200) : null;
  const active = typeof body.active === "boolean" ? body.active : true;

  const { data, error } = await supabase
    .from("contact_recipients")
    .insert({ email, note, active, created_by: actor.userId })
    .select("id, email, active, note, created_at")
    .single<RecipientRow>();

  if (error) {
    // Surface the duplicate-key case as a friendly 409 rather than a
    // generic 500. Postgres unique-violation code is "23505".
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return NextResponse.json(
        { error: "That email is already on the recipient list." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: error.message ?? "Failed to add recipient." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    recipient: {
      id: data.id,
      email: data.email,
      active: data.active,
      note: data.note,
      createdAt: data.created_at,
    },
  });
}

export async function PATCH(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const body = (await request.json().catch(() => ({}))) as {
    id?: unknown;
    active?: unknown;
    note?: unknown;
  };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json(
      { error: "Missing recipient id." },
      { status: 400 },
    );
  }
  const patch: { active?: boolean; note?: string | null } = {};
  if (typeof body.active === "boolean") patch.active = body.active;
  if (typeof body.note === "string")
    patch.note = body.note.trim().slice(0, 200) || null;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json(
      { error: "Nothing to update." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("contact_recipients")
    .update(patch)
    .eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to update recipient." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const gate = await requireAdmin();
  if (gate.error) return gate.error;
  const { supabase } = gate;

  const body = (await request.json().catch(() => ({}))) as { id?: unknown };
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json(
      { error: "Missing recipient id." },
      { status: 400 },
    );
  }
  const { error } = await supabase
    .from("contact_recipients")
    .delete()
    .eq("id", id);
  if (error) {
    return NextResponse.json(
      { error: error.message ?? "Failed to remove recipient." },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
