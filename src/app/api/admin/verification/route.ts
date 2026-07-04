import { NextRequest, NextResponse } from "next/server";
import { requiredTADocuments } from "@/lib/mock-data";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { createSupabaseAuthServerClient } from "@/lib/supabase-auth-server";

const MOCK_FALLBACK_DOCS = requiredTADocuments.map((doc) => ({
  id: doc.id,
  label: doc.label,
  description: doc.description,
  status: doc.status === "approved" ? "approved" : doc.status === "pending" ? "pending" : "resubmit",
  note: doc.note ?? "",
  fileName: null as string | null,
  filePath: null as string | null,
  previouslyApproved: false,
  expiresOn: null as string | null,
  renewalPeriodDays: doc.renewalPeriodDays,
}));

export async function GET(request: NextRequest) {
  // Admin-only
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
    .single();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const driverIdParam = request.nextUrl.searchParams.get("driverId");
  const supabase = getSupabaseServerClient();

  // No Supabase configured — return template/mock for offline dev only.
  if (!supabase) {
    return NextResponse.json({
      source: "mock",
      driverId: driverIdParam ?? "DRV-DEMO",
      driverName: "Demo Driver",
      docs: MOCK_FALLBACK_DOCS,
      auditTrail: [
        "2026-03-24 09:12 | Application submitted",
        "2026-03-24 09:28 | Auto checks completed (TRN/NIS format valid)",
      ],
    });
  }

  // Resolve which driver to load:
  //   - explicit ?driverId=DRV-XYZ → look up by external_id
  //   - otherwise → most recent pending submission
  let driverQuery = supabase
    .from("drivers")
    .select(
      "id, external_id, first_name, last_name, phone, email, trn, nis, licence_number, licence_expiry, plate_number, vehicle_make, vehicle_model, vehicle_year, franchise_expiry, onboarding_status, activated, admin_note, created_at, submitted_at",
    );

  if (driverIdParam) {
    driverQuery = driverQuery.eq("external_id", driverIdParam);
  } else {
    driverQuery = driverQuery
      .eq("onboarding_status", "pending_review")
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(1);
  }

  const { data: driver } = await driverQuery.maybeSingle();

  if (!driver) {
    return NextResponse.json({
      source: "supabase",
      empty: true,
      message: driverIdParam
        ? `No driver found with id "${driverIdParam}".`
        : "No pending verifications right now.",
      docs: [],
      auditTrail: [],
    });
  }

  // Only include docs that are still in the canonical required list — guards
  // against legacy rows left over from earlier doc-set changes (e.g. TRN/NIS
  // used to be in driver_documents but are now plain form fields).
  const validDocKeys = new Set(requiredTADocuments.map((d) => d.id));

  const { data: docs } = await supabase
    .from("driver_documents")
    .select(
      "doc_key,label,description,status,note,file_name,file_path,previously_approved,expires_on,renewal_period_days",
    )
    .eq("driver_id", driver.id)
    .in("doc_key", Array.from(validDocKeys))
    .order("doc_key", { ascending: true });

  const { data: audit } = await supabase
    .from("driver_audit_logs")
    .select("event,created_at")
    .eq("driver_id", driver.id)
    .order("created_at", { ascending: false })
    .limit(40);

  return NextResponse.json({
    source: "supabase",
    driverId: driver.external_id,
    driverName:
      [driver.first_name, driver.last_name].filter(Boolean).join(" ") || "Unnamed driver",
    plateNumber: driver.plate_number,
    onboardingStatus: driver.onboarding_status,
    activated: driver.activated,
    submittedAt: driver.submitted_at ?? driver.created_at,
    adminNote: driver.admin_note,
    contact: {
      email: driver.email,
      phone: driver.phone,
    },
    identity: {
      trn: driver.trn,
      nis: driver.nis,
      licenceNumber: driver.licence_number,
    },
    vehicle: {
      plateNumber: driver.plate_number,
      make: driver.vehicle_make,
      model: driver.vehicle_model,
      year: driver.vehicle_year,
    },
    docs:
      docs?.map((doc) => {
        // Always trust the per-row renewal period. Fall back to the
        // template constant for legacy rows where the column was nullable.
        const meta = requiredTADocuments.find((r) => r.id === doc.doc_key);
        const renewalPeriodDays =
          (doc.renewal_period_days ?? meta?.renewalPeriodDays ?? 0) as number;

        // Two expiry sources reconciled here:
        //   1. `driver_documents.expires_on` — set on renewal / resubmit
        //      flows where the driver enters a new expiry per-doc.
        //   2. `drivers.licence_expiry` / `drivers.franchise_expiry` —
        //      the onboarding form only asks the driver for these two
        //      expiries, and stores them on the drivers row (NOT on
        //      driver_documents). Without this fallback, licence and
        //      franchise docs would look expiry-less to admin even
        //      though the driver entered dates during onboarding.
        //
        //   Per-doc row wins if set (it's the newer/renewed value);
        //   the drivers-table field is a fallback for the initial
        //   onboarding-supplied expiry.
        let expiresOn = (doc.expires_on ?? null) as string | null;
        if (!expiresOn) {
          if (
            doc.doc_key === "drivers_licence_front" ||
            doc.doc_key === "drivers_licence_back"
          ) {
            expiresOn = (driver.licence_expiry ?? null) as string | null;
          } else if (doc.doc_key === "franchise_cert") {
            expiresOn = (driver.franchise_expiry ?? null) as string | null;
          }
        }

        return {
          id: doc.doc_key,
          label: doc.label,
          description: doc.description,
          status:
            doc.status === "approved" || doc.status === "pending" || doc.status === "rejected"
              ? doc.status
              : "resubmit",
          note: doc.note ?? "",
          fileName: doc.file_name ?? null,
          filePath: doc.file_path ?? null,
          previouslyApproved: doc.previously_approved === true,
          expiresOn,
          renewalPeriodDays,
        };
      }) ?? [],
    auditTrail:
      audit?.map((row) => {
        const timestamp = (row.created_at ?? "").replace("T", " ").slice(0, 16);
        return `${timestamp} | ${row.event}`;
      }) ?? [],
  });
}
