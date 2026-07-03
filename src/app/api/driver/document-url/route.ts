import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";

/**
 * GET /api/driver/document-url?docKey=...
 *
 * Returns a short-lived signed URL so a driver can preview/download an
 * uploaded document of THEIR OWN — the image/PDF the admin approved.
 *
 * Security model (why we take a `docKey`, not a raw storage `path`):
 *   - The caller is identified from their session, and the file path is
 *     resolved server-side from `driver_documents` for THIS driver + doc.
 *     A driver can therefore never request another driver's file by
 *     guessing a path — they can only name one of their own doc keys.
 *   - We only sign APPROVED documents. Rejected / pending / missing docs
 *     aren't served here (the driver resubmits those from the renew flow).
 *
 * The signing itself uses the service_role client to bypass storage RLS,
 * exactly like the admin `/api/admin/document-url` endpoint.
 */
export async function GET(request: NextRequest) {
  const docKey = request.nextUrl.searchParams.get("docKey");
  if (!docKey) {
    return NextResponse.json({ error: "docKey required" }, { status: 400 });
  }

  // Identify the signed-in driver.
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getSupabaseServerClient();
  if (!admin) {
    return NextResponse.json({ error: "storage unavailable" }, { status: 500 });
  }

  // Resolve the caller's driver row.
  const { data: driver } = await admin
    .from("drivers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!driver) {
    return NextResponse.json({ error: "Driver record not found" }, { status: 404 });
  }

  // Resolve the document — scoped to this driver + the named doc key.
  const { data: doc } = await admin
    .from("driver_documents")
    .select("status, file_path, file_name")
    .eq("driver_id", driver.id)
    .eq("doc_key", docKey)
    .maybeSingle();

  if (!doc || !doc.file_path) {
    return NextResponse.json({ error: "No document on file" }, { status: 404 });
  }
  // Only approved documents are previewable here.
  if (doc.status !== "approved") {
    return NextResponse.json(
      { error: "This document isn't approved" },
      { status: 403 },
    );
  }

  const { data, error } = await admin.storage
    .from("driver-documents")
    .createSignedUrl(doc.file_path, 60 * 5);

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: data.signedUrl, fileName: doc.file_name ?? null });
}
