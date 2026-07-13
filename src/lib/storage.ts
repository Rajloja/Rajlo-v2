import { createSupabaseBrowserClient } from "./supabase-browser";
import { compressImage, DOCUMENT_COMPRESS } from "./compress-image";

const BUCKET = "driver-documents";

/** One year, in seconds. Safe as an immutable cache lifetime because
 *  every uploaded file lands at a unique timestamped path — the
 *  content at a given URL never changes, so there's nothing to
 *  invalidate. A short cache just means every viewer re-downloads the
 *  same bytes repeatedly, which is pure wasted Supabase egress. */
const IMMUTABLE_CACHE_SECONDS = "31536000";

/**
 * Uploads a single driver document directly from the browser to Supabase
 * Storage. Files are stored under `<user_id>/<doc_key>-<timestamp>.<ext>`
 * so RLS can scope them per-driver (see storage-migration.sql).
 *
 * Image documents are compressed first (see compress-image.ts) — a raw
 * 4 MB phone photo becomes ~300–500 KB while staying legible for the
 * admin verification review. PDF uploads pass through untouched.
 */
export async function uploadDriverDocument({
  userId,
  docKey,
  file,
}: {
  userId: string;
  docKey: string;
  file: File;
}): Promise<{ path: string } | { error: string }> {
  const supabase = createSupabaseBrowserClient();
  const compressed = await compressImage(file, DOCUMENT_COMPRESS);
  const ext = compressed.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${userId}/${docKey}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
    cacheControl: IMMUTABLE_CACHE_SECONDS,
    upsert: false,
    contentType: compressed.type || undefined,
  });

  if (error) return { error: error.message };
  return { path };
}

/**
 * Removes a previously-uploaded file. Used when the driver picks a different
 * file to replace one already uploaded.
 */
export async function removeDriverDocument(path: string) {
  const supabase = createSupabaseBrowserClient();
  await supabase.storage.from(BUCKET).remove([path]);
}

/**
 * Employer-portal variant of uploadDriverDocument. Files land in the
 * `employer-drafts/<employer_user_id>/<session_uuid>/<docKey>` subtree
 * of the same `driver-documents` bucket. The employer-scoped RLS
 * policies (see supabase/employers-migration.sql) let an authenticated
 * employer INSERT / SELECT / DELETE within their own subtree only.
 *
 * On employer submit, the server moves these files into the newly-
 * created driver's own folder using service_role — see
 * /api/employer/drivers/submit/route.ts. Orphaned drafts (employer
 * bailed on the wizard) are pruned by a periodic sweep; for now
 * they're small and rare so we leave them until an actual purge is
 * needed.
 */
export async function uploadEmployerDraftDocument({
  employerUserId,
  sessionId,
  docKey,
  file,
}: {
  employerUserId: string;
  sessionId: string;
  docKey: string;
  file: File;
}): Promise<{ path: string } | { error: string }> {
  const supabase = createSupabaseBrowserClient();
  const compressed = await compressImage(file, DOCUMENT_COMPRESS);
  const ext = compressed.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `employer-drafts/${employerUserId}/${sessionId}/${docKey}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, compressed, {
    cacheControl: IMMUTABLE_CACHE_SECONDS,
    upsert: false,
    contentType: compressed.type || undefined,
  });

  if (error) return { error: error.message };
  return { path };
}

/**
 * Returns a short-lived signed URL for previewing/downloading a file. Used
 * server-side from admin verification routes. `expiresIn` is in seconds.
 */
export async function createDriverDocumentSignedUrl(
  path: string,
  expiresIn = 60 * 5,
): Promise<string | null> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresIn);
  return data?.signedUrl ?? null;
}
