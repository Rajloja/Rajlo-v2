"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { createDriverDocumentSignedUrl } from "@/lib/storage";

/**
 * State for a single uploaded document.
 *  - while uploading:   { name, size, uploading: true }
 *  - on success:        { name, size, path }       <- path is the storage key
 *  - on failure:        { name, size, error }
 *  - when no file picked: undefined
 *
 * `approved` is set when restoring an admin-approved doc on resubmission —
 * the original File is gone (we only kept the storage path), so the UI
 * renders an "Approved" badge instead of a misleading "0 KB" line.
 */
export type UploadedFile = {
  name: string;
  size: number;
  path?: string;
  uploading?: boolean;
  error?: string;
  approved?: boolean;
};

export type FileState = Record<string, UploadedFile | undefined>;

export type FileUploadField = {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  /** Render as a large circular avatar preview instead of the standard
   *  row layout. Used by the identity-selfie step so the driver can SEE
   *  how their selfie will look (as it would appear in their profile
   *  avatar) before submitting. Only meaningful for images — PDF picks
   *  fall back to a generic placeholder. */
  previewAsAvatar?: boolean;
};

export function FileUpload({
  field,
  files,
  onPick,
  onRemove,
}: {
  field: FileUploadField;
  files: FileState;
  onPick: (id: string, file: File) => void;
  onRemove: (id: string) => void;
}) {
  const file = files[field.id];
  const [dragOver, setDragOver] = useState(false);

  // Preview URL for avatar mode. Two sources reconciled:
  //   1. Local blob URL from the just-picked File — instant, works
  //      before/during upload.
  //   2. Supabase signed URL from the storage path — fallback for
  //      draft-restore case (user returns to onboarding, path was
  //      persisted to localStorage but the original File is gone).
  // Local blob URL wins when present — it's already a full-quality
  // in-memory image and avoids a network round-trip.
  const [localBlobUrl, setLocalBlobUrl] = useState<string | null>(null);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const previewUrl =
    field.previewAsAvatar ? (localBlobUrl ?? signedUrl) : null;

  // Wraps onPick with an eager blob-URL preview so the driver sees the
  // shot immediately — the upload spinner overlays it while the file
  // makes its way to storage.
  const pick = (f: File) => {
    if (field.previewAsAvatar && f.type.startsWith("image/")) {
      // Revoke any previous blob URL before creating a new one — leaked
      // object URLs pin the underlying blob in memory forever.
      setLocalBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(f);
      });
      // Any stale signed URL from a prior file is now wrong — clear it
      // so the new blob URL is the definitive preview until the upload
      // resolves and a fresh signed URL is fetched (or not needed).
      setSignedUrl(null);
    }
    onPick(field.id, f);
  };

  // Fetch a signed URL when the parent restored a persisted file (path
  // set, no local File). Skipped for non-avatar fields since we never
  // render the preview there. Also skipped when we already have a
  // local blob URL — that's the definitive live preview.
  useEffect(() => {
    if (!field.previewAsAvatar) return;
    if (localBlobUrl) return;
    if (!file?.path) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    createDriverDocumentSignedUrl(file.path).then((url) => {
      if (!cancelled) setSignedUrl(url ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [field.previewAsAvatar, file?.path, localBlobUrl]);

  // Revoke local blob URL on unmount / replacement — otherwise the
  // blob stays pinned in memory for the browser session.
  useEffect(() => {
    return () => {
      if (localBlobUrl) URL.revokeObjectURL(localBlobUrl);
    };
  }, [localBlobUrl]);

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) pick(dropped);
  };

  const stateClass = file?.error
    ? "border-rajlo-red bg-primary-soft/60"
    : file?.uploading
      ? "border-rajlo-red/40 bg-primary-soft/40"
      : file?.path
        ? "border-emerald-300 bg-emerald-50/60"
        : dragOver
          ? "scale-[1.01] border-rajlo-red bg-primary-soft"
          : "border-line bg-surface-soft hover:border-rajlo-red/30 hover:bg-primary-soft/30";

  const iconBg = file?.error
    ? "bg-rajlo-red text-white"
    : file?.uploading
      ? "bg-rajlo-red/15 text-rajlo-red"
      : file?.path
        ? "bg-emerald-500 text-white"
        : "bg-white text-muted group-hover:text-rajlo-red";

  const iconName: IconName = file?.error
    ? "alert-triangle"
    : file?.uploading
      ? "upload"
      : file?.path
        ? "check-circle"
        : "upload";

  // Wraps parent's onRemove to also revoke the blob URL — otherwise the
  // preview would linger visually until the next full re-render.
  const remove = () => {
    if (localBlobUrl) {
      URL.revokeObjectURL(localBlobUrl);
      setLocalBlobUrl(null);
    }
    setSignedUrl(null);
    onRemove(field.id);
  };

  // ═══════════════════ Avatar mode ═══════════════════
  // Used by the selfie step. Big circular preview so the driver sees
  // exactly how the photo will render as their profile avatar. The rest
  // of the states (error / uploading / uploaded / empty) map to overlays
  // and badges on the same circle instead of the row-style layout.
  if (field.previewAsAvatar) {
    return (
      <div>
        <p className="mb-1.5 text-sm font-semibold">
          {field.label}
          {field.required && <span className="ml-0.5 text-rajlo-red">*</span>}
        </p>
        {field.hint && <p className="mb-3 text-xs text-muted">{field.hint}</p>}
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`group flex cursor-pointer flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-4 py-5 transition-all ${stateClass}`}
        >
          {/* Circular avatar preview. Same 128px size across breakpoints
              so the driver's sense of "how big will my avatar be" is
              consistent from desktop to mobile. */}
          <div className="relative">
            <div
              className={`grid h-32 w-32 place-items-center overflow-hidden rounded-full border-2 transition-colors ${
                file?.error
                  ? "border-rajlo-red bg-primary-soft/60"
                  : file?.path
                    ? "border-emerald-400 bg-emerald-50"
                    : file?.uploading
                      ? "border-rajlo-red/40 bg-primary-soft/40"
                      : "border-line bg-white group-hover:border-rajlo-red/40"
              }`}
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Selfie preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <Icon
                  name={file?.error ? "alert-triangle" : "user"}
                  className={`h-12 w-12 ${
                    file?.error ? "text-rajlo-red" : "text-muted"
                  }`}
                />
              )}
            </div>

            {/* Status badge — bottom-right of the circle. Green check
                when uploaded, spinning ring when uploading, red alert
                on error, camera icon when empty. */}
            <span
              className={`absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full border-2 border-white shadow-md transition-colors ${
                file?.error
                  ? "bg-rajlo-red text-white"
                  : file?.path
                    ? "bg-emerald-500 text-white"
                    : file?.uploading
                      ? "bg-white text-rajlo-red"
                      : "bg-rajlo-red text-white"
              }`}
            >
              {file?.uploading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-[2px] border-current border-t-transparent" />
              ) : file?.path ? (
                <Icon name="check-circle" className="h-4 w-4" />
              ) : file?.error ? (
                <Icon name="alert-triangle" className="h-4 w-4" />
              ) : (
                <Icon name="upload" className="h-4 w-4" />
              )}
            </span>
          </div>

          <div className="w-full max-w-xs text-center">
            {file?.error ? (
              <>
                <p className="text-sm font-semibold text-rajlo-red">
                  Upload failed
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {file.error} · click to retry
                </p>
              </>
            ) : file?.uploading ? (
              <>
                <p className="truncate text-sm font-semibold text-foreground">
                  {file.name}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-rajlo-red/15">
                    <div className="rajlo-pending-bar h-full w-1/3 rounded-full bg-rajlo-red" />
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-rajlo-red">
                    Uploading
                  </span>
                </div>
              </>
            ) : file?.path ? (
              <>
                <p className="text-sm font-semibold text-emerald-700">
                  {file.approved ? "Approved by admin" : "Looking good"}
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {file.approved
                    ? "Already verified · tap to replace"
                    : "Tap the circle to retake"}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">Take or upload photo</p>
                <p className="mt-0.5 text-xs text-muted">
                  Face forward, plain background · JPG or PNG
                </p>
              </>
            )}
          </div>

          {file?.path && !file.uploading && !file.approved && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                remove();
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-muted transition-colors hover:border-rajlo-red/40 hover:text-rajlo-red"
            >
              <Icon name="x" className="h-3.5 w-3.5" />
              Remove
            </button>
          )}

          <input
            type="file"
            // `capture="user"` hints to mobile browsers to open the
            // FRONT camera (the selfie camera) when the driver taps
            // the field. Desktop browsers ignore the attribute and
            // just show the file picker.
            accept="image/jpeg,image/png"
            capture="user"
            className="hidden"
            disabled={file?.uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) pick(f);
            }}
          />
        </label>
      </div>
    );
  }

  // ═══════════════════ Standard row mode ═══════════════════
  // Two input surfaces — one hints "camera" (opens the rear camera
  // straight to snap a doc on mobile; ignored on desktop), the other
  // is a plain file picker for browsing the device. Field-agent
  // employers snap driver docs on the spot; drivers who already have
  // digital copies browse.
  //
  // The row itself is NOT clickable anymore — clicks are scoped to
  // the two icon buttons on the right. Drag-and-drop still hits the
  // outer container so an existing "drop a PDF here" flow works.
  const showActions = !file?.uploading && !file?.approved;
  const showRemove = file?.path && !file.uploading && !file.approved;

  return (
    <div>
      <p className="mb-1.5 text-sm font-semibold">
        {field.label}
        {field.required && <span className="ml-0.5 text-rajlo-red">*</span>}
      </p>
      {field.hint && <p className="mb-2 text-xs text-muted">{field.hint}</p>}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`group relative flex items-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed px-4 py-3.5 transition-all sm:gap-4 sm:px-5 sm:py-4 ${stateClass}`}
      >
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-colors sm:h-11 sm:w-11 ${iconBg}`}
        >
          {file?.uploading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-[2px] border-current border-t-transparent sm:h-5 sm:w-5 sm:border-[2.5px]" />
          ) : (
            <Icon name={iconName} className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          {file?.error ? (
            <>
              <p className="truncate text-sm font-semibold text-rajlo-red">Upload failed</p>
              <p className="truncate text-xs text-muted">{file.error} · tap camera or attach to retry</p>
            </>
          ) : file?.uploading ? (
            <>
              <p className="truncate text-sm font-semibold text-foreground">{file.name}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-rajlo-red/15">
                  <div className="rajlo-pending-bar h-full w-1/3 rounded-full bg-rajlo-red" />
                </div>
                <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-rajlo-red">
                  Uploading
                </span>
              </div>
            </>
          ) : file?.path ? (
            <>
              <div className="flex items-center gap-2 overflow-hidden">
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{file.name}</p>
                {file.approved && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                    <Icon name="check-circle" className="h-2.5 w-2.5" />
                    Approved
                  </span>
                )}
              </div>
              <p className="truncate text-xs font-medium text-emerald-700">
                {file.approved
                  ? "Already verified by admin"
                  : `Uploaded · ${(file.size / 1024).toFixed(0)} KB`}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">Snap or upload document</p>
              <p className="text-xs text-muted">PDF, JPG or PNG up to 10MB</p>
            </>
          )}
        </div>

        {/* Action buttons — Camera (snap) + Attach (browse) + Remove.
            Each label wraps its own hidden input so clicking the icon
            triggers ITS input (native <label>/<input> binding), keeping
            the two surfaces independent. `capture="environment"` on the
            camera one hints mobile browsers to open the rear camera
            directly; desktop just falls back to the standard file
            picker (attribute is ignored). */}
        {showActions && (
          <div className="flex shrink-0 items-center gap-1.5">
            <label
              aria-label="Take photo"
              title="Take photo"
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg bg-white text-muted ring-1 ring-line transition-colors hover:text-rajlo-red hover:ring-rajlo-red/40 sm:h-10 sm:w-10"
            >
              <Icon name="camera" className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pick(f);
                  // Reset so picking the same file twice still fires onChange.
                  e.target.value = "";
                }}
              />
            </label>
            <label
              aria-label="Attach file"
              title="Attach file"
              className="grid h-9 w-9 cursor-pointer place-items-center rounded-lg bg-white text-muted ring-1 ring-line transition-colors hover:text-rajlo-red hover:ring-rajlo-red/40 sm:h-10 sm:w-10"
            >
              <Icon name="paperclip" className="h-4 w-4 sm:h-[18px] sm:w-[18px]" />
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) pick(f);
                  e.target.value = "";
                }}
              />
            </label>
            {showRemove && (
              <button
                type="button"
                onClick={remove}
                aria-label="Remove file"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-white hover:text-rajlo-red sm:h-10 sm:w-10"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
