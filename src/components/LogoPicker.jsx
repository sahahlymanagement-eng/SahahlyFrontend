import { useEffect, useRef, useState } from "react";
import { FiImage, FiTrash2, FiUploadCloud } from "react-icons/fi";
import { toast } from "react-toastify";
import {
  deleteReportLogo,
  logoErr,
  reportLogoObjectUrl,
  uploadReportLogo,
} from "../api/reportLogos";
import "./LogoPicker.css";

const ACCEPT = "image/png,image/jpeg,image/webp";
const MAX_BYTES = 2 * 1024 * 1024;

/**
 * Pick / preview / remove the logo drawn beside Sahahly's in report PDFs.
 *
 * Runs in two modes, because the two places it is used differ in whether the
 * owner exists yet:
 *
 *   ownerKey set   — "immediate". The file uploads the moment it is chosen, and
 *                    Remove deletes server-side. Used when editing a teacher and
 *                    for partners, whose slugs always exist.
 *   ownerKey null  — "deferred". There is nothing to attach the bytes to until
 *                    the account is created, so the `File` is handed up to the
 *                    parent (`onPendingChange`) and uploaded after the account
 *                    exists. The parent owns `pendingFile`, so clearing the form
 *                    clears the preview.
 *
 * `readOnly` drops it to preview-only — the picker still shows what is stored,
 * but offers no upload or remove. Reads are open to any signed-in account while
 * writes are not, so this is what an account without write rights should see
 * rather than buttons that fail at the API.
 *
 * The stored preview is fetched as a blob rather than used as a bare <img src>,
 * because the bytes endpoint needs the bearer token an <img> tag cannot send.
 */
export default function LogoPicker({
  ownerType,
  ownerKey = null,
  hasLogo,
  pendingFile = null,
  onPendingChange,
  onChange,
  label = "Logo",
  hint = "Shown next to the Sahahly logo on this teacher's reports.",
  disabled = false,
  readOnly = false,
}) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  // Bumped after an upload/delete to force the stored preview to refetch.
  const [reloadTick, setReloadTick] = useState(0);

  const deferred = !ownerKey;

  /*
   * Both previews are object URLs tagged with what they were made for, and read
   * back only while that tag still matches. Deriving them this way — rather than
   * clearing them from an effect when the input changes — is what stops a stale
   * thumbnail flashing under a newly picked file, and keeps the effects free of
   * the synchronous setState that would cost a second render on every pick.
   */

  // Local preview for a file that has not been uploaded yet.
  const [pending, setPending] = useState({ file: null, url: null });
  if (pending.file !== pendingFile) {
    if (pending.url) URL.revokeObjectURL(pending.url);
    setPending({
      file: pendingFile,
      url: pendingFile ? URL.createObjectURL(pendingFile) : null,
    });
  }
  const pendingUrl = pending.file === pendingFile ? pending.url : null;

  // Release the local URL when the picker goes away. Read through a ref so the
  // unmount cleanup does not re-run (and revoke a live URL) on every change.
  const heldPending = useRef(null);
  useEffect(() => {
    heldPending.current = pending.url;
  }, [pending.url]);
  useEffect(
    () => () => {
      if (heldPending.current) URL.revokeObjectURL(heldPending.current);
    },
    []
  );

  // Stored logo. `hasLogo === false` is a definite "there is none", so skip the
  // request; undefined means we do not know and a 404 is the cheap way to find out.
  const remoteKey =
    deferred || hasLogo === false ? null : `${ownerType}:${ownerKey}:${reloadTick}`;
  const [remote, setRemote] = useState({ key: null, url: null });

  useEffect(() => {
    if (!remoteKey) return undefined;
    let alive = true;
    let held = null;
    reportLogoObjectUrl(ownerType, ownerKey)
      .then((url) => {
        if (!alive) {
          URL.revokeObjectURL(url);
          return;
        }
        held = url;
        setRemote({ key: remoteKey, url });
      })
      .catch(() => {
        // No logo set, or it could not be read — the empty state covers both.
      });
    return () => {
      alive = false;
      if (held) URL.revokeObjectURL(held);
    };
  }, [remoteKey, ownerType, ownerKey]);

  const remoteUrl = remote.key === remoteKey ? remote.url : null;

  const preview = pendingUrl || remoteUrl;
  const hasSomething = Boolean(preview);

  /** Reject the obvious cases here so a bad pick costs no round trip. */
  const validate = (file) => {
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type || "")) {
      toast.error("Logo must be a PNG, JPEG or WebP image");
      return false;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Logo is too large (max 2 MB)");
      return false;
    }
    return true;
  };

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    // Clear straight away so re-picking the same file still fires change.
    e.target.value = "";
    if (!file || !validate(file)) return;

    if (deferred) {
      onPendingChange?.(file);
      return;
    }

    try {
      setBusy(true);
      await uploadReportLogo(ownerType, ownerKey, file);
      setReloadTick((n) => n + 1);
      toast.success("Logo saved");
      onChange?.();
    } catch (err) {
      toast.error(logoErr(err, "Failed to upload logo"));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (deferred) {
      onPendingChange?.(null);
      return;
    }
    try {
      setBusy(true);
      await deleteReportLogo(ownerType, ownerKey);
      // Bumping the tick changes remoteKey, so the derived preview clears on its own.
      setReloadTick((n) => n + 1);
      toast.success("Logo removed");
      onChange?.();
    } catch (err) {
      toast.error(logoErr(err, "Failed to remove logo"));
    } finally {
      setBusy(false);
    }
  };

  const locked = disabled || busy;

  return (
    <div className="lp-field">
      <span className="lp-label">
        {label}
        <span className="lp-optional">optional</span>
      </span>

      {!readOnly && (
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="lp-file-input"
          onChange={handleChange}
          disabled={locked}
        />
      )}

      <div className="lp-row">
        <div className={`lp-thumb ${hasSomething ? "" : "lp-thumb--empty"}`}>
          {hasSomething ? (
            <img src={preview} alt="" className="lp-thumb-img" />
          ) : (
            <FiImage size={20} aria-hidden="true" />
          )}
        </div>

        {!readOnly && (
          <div className="lp-actions">
            <button
              type="button"
              className="lp-btn"
              onClick={() => inputRef.current?.click()}
              disabled={locked}
            >
              <FiUploadCloud size={14} aria-hidden="true" />
              <span>{busy ? "Saving…" : hasSomething ? "Replace" : "Upload logo"}</span>
            </button>

            {hasSomething && (
              <button
                type="button"
                className="lp-btn lp-btn--danger"
                onClick={handleRemove}
                disabled={locked}
                title="Remove logo"
              >
                <FiTrash2 size={14} aria-hidden="true" />
                <span>Remove</span>
              </button>
            )}
          </div>
        )}

        {readOnly && !hasSomething && (
          <span className="lp-readonly-note">No logo set</span>
        )}
      </div>

      <p className="lp-hint">
        {deferred && pendingFile
          ? "Will be uploaded once the account is created."
          : hint}
      </p>
    </div>
  );
}
