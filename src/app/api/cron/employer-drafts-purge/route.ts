import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

/**
 * GET /api/cron/employer-drafts-purge
 *
 * Daily cron that deletes files under
 *   driver-documents/employer-drafts/<employer_user_id>/<session_uuid>/
 * that are older than 24 hours. These files are created when an
 * employer's onboarding wizard uploads a doc BEFORE final submission.
 * On submit the /api/employer/drivers/submit route copies each file to
 * the newly-created driver's own folder and removes the source. Any
 * file left behind — because the employer closed the wizard, the
 * session storage was cleared, the browser tab crashed — becomes an
 * orphan.
 *
 * We keep the window generous (24 h) so an employer who steps away
 * for a break and comes back later doesn't lose their uploaded docs.
 * Beyond that the files are unreachable — the wizard's session_uuid
 * lives only in the tab's sessionStorage and can't be recovered.
 *
 * Auth: same CRON_SECRET pattern as the other Rajlo crons.
 * Schedule: 03:00 Jamaica local (08:00 UTC) daily — off-peak so an
 * unusually large storage.list result doesn't hurt anything.
 * See vercel.json.
 */

const CUTOFF_MS = 24 * 60 * 60 * 1000; // 24h
const BUCKET = "driver-documents";
const DRAFTS_ROOT = "employer-drafts";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "service_role_missing" },
      { status: 500 },
    );
  }

  const cutoff = Date.now() - CUTOFF_MS;
  let purgedFiles = 0;
  let scannedEmployers = 0;

  // Two-level recursive walk: list employer folders, then each
  // employer's session folders. We do NOT use `search` since the
  // Storage list API's `created_at` metadata gives us the age check
  // per-file; walking the tree is O(employers × sessions × files-
  // per-session) and the numbers are small in practice.
  const { data: employerFolders } = await supabase.storage
    .from(BUCKET)
    .list(DRAFTS_ROOT, { limit: 1000, sortBy: { column: "name", order: "asc" } });

  for (const employerFolder of employerFolders ?? []) {
    if (!employerFolder.name) continue;
    scannedEmployers += 1;
    const employerPath = `${DRAFTS_ROOT}/${employerFolder.name}`;
    const { data: sessionFolders } = await supabase.storage
      .from(BUCKET)
      .list(employerPath, { limit: 1000 });

    for (const sessionFolder of sessionFolders ?? []) {
      if (!sessionFolder.name) continue;
      const sessionPath = `${employerPath}/${sessionFolder.name}`;
      const { data: files } = await supabase.storage
        .from(BUCKET)
        .list(sessionPath, { limit: 1000 });

      const stale: string[] = [];
      for (const f of files ?? []) {
        if (!f.name) continue;
        // Storage's list() returns `created_at` on the object metadata.
        const createdAt = f.created_at ? Date.parse(f.created_at) : NaN;
        if (Number.isFinite(createdAt) && createdAt < cutoff) {
          stale.push(`${sessionPath}/${f.name}`);
        }
      }

      if (stale.length > 0) {
        const { error } = await supabase.storage.from(BUCKET).remove(stale);
        if (!error) purgedFiles += stale.length;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    scannedEmployers,
    purgedFiles,
    cutoffAgeHours: CUTOFF_MS / 3_600_000,
  });
}
