import { useEffect, useRef, useState } from "react";
import { FiFile, FiImage, FiPaperclip, FiX } from "react-icons/fi";
import { attachmentObjectUrl } from "../../api/whatsappBroadcasts";
import { formatBytes } from "./format";

/**
 * Pick / preview / remove the image or file that rides along with a broadcast.
 *
 * Same two-phase behaviour as the scheduler's picker — the file uploads the moment
 * it is chosen, so the form only ever holds the small metadata object the backend
 * returned and a slow upload never delays the send. Kept as its own component
 * rather than shared because it points at the broadcast attachment endpoints,
 * which are a separate collection from the scheduler's.
 *
 * Image thumbnails come from two places on purpose: a just-picked file previews
 * from the local `File` (instant, free), while an attachment loaded from an
 * existing broadcast has to be fetched, because the bytes endpoint needs the
 * bearer token an <img src> cannot send. Both are tagged with the attachment id
 * they belong to, which is what stops a stale thumbnail flashing under a newly
 * picked file.
 */
export default function BroadcastAttachmentPicker({ attachment, busy, uploading, onPick, onRemove }) {
  const inputRef = useRef(null);
  const [localPreview, setLocalPreview] = useState(null); // { id, url } | null
  const [remotePreview, setRemotePreview] = useState(null); // { id, url } | null

  const attachmentId = attachment?.attachmentId || null;
  const isImage = attachment?.kind === "image";

  const localUrl = localPreview?.id === attachmentId ? localPreview.url : null;
  const remoteUrl = remotePreview?.id === attachmentId ? remotePreview.url : null;
  const preview = localUrl || remoteUrl;

  const needsRemote = Boolean(isImage && attachmentId && !preview);

  useEffect(() => {
    if (!needsRemote) return undefined;
    let alive = true;
    attachmentObjectUrl(attachmentId)
      .then((url) => {
        if (!alive) {
          URL.revokeObjectURL(url);
          return;
        }
        setRemotePreview((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return { id: attachmentId, url };
        });
      })
      .catch(() => {
        /* A missing thumbnail is cosmetic — the chip still names the file. */
      });
    return () => {
      alive = false;
    };
  }, [needsRemote, attachmentId]);

  // Release whatever is still held on unmount. Read through a ref so the cleanup
  // doesn't re-run (and revoke a live URL) on every change.
  const heldUrls = useRef({ local: null, remote: null });
  useEffect(() => {
    heldUrls.current = {
      local: localPreview?.url || null,
      remote: remotePreview?.url || null,
    };
  }, [localPreview, remotePreview]);
  useEffect(
    () => () => {
      const { local, remote } = heldUrls.current;
      if (local) URL.revokeObjectURL(local);
      if (remote) URL.revokeObjectURL(remote);
    },
    []
  );

  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    // Clear straight away so re-picking the same file still fires change.
    e.target.value = "";
    if (!file) return;

    const url = file.type?.startsWith("image/") ? URL.createObjectURL(file) : null;
    const saved = await onPick(file);
    if (!saved?.attachmentId) {
      if (url) URL.revokeObjectURL(url);
      return;
    }
    setLocalPreview((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return url ? { id: saved.attachmentId, url } : null;
    });
  };

  return (
    <div className="mws-field">
      <span className="mws-label">
        Attachment
        <span className="mws-charcount">optional</span>
      </span>

      <input
        ref={inputRef}
        type="file"
        className="mws-file-input"
        onChange={handleChange}
        disabled={busy || uploading}
      />

      {attachment ? (
        <div className="mws-attachment">
          {preview ? (
            <img className="mws-attachment-thumb" src={preview} alt="" />
          ) : (
            <span className="mws-attachment-thumb mws-attachment-thumb--icon" aria-hidden="true">
              {isImage ? <FiImage /> : <FiFile />}
            </span>
          )}

          <span className="mws-attachment-meta">
            <span className="mws-attachment-name" title={attachment.filename}>
              {attachment.filename}
            </span>
            <span className="mws-attachment-sub">
              {isImage ? "Image" : "File"}
              {attachment.size ? ` · ${formatBytes(attachment.size)}` : ""}
            </span>
          </span>

          <div className="mws-attachment-actions">
            <button
              type="button"
              className="mws-btn mws-btn--ghost"
              onClick={() => inputRef.current?.click()}
              disabled={busy || uploading}
            >
              <FiPaperclip aria-hidden="true" />
              {uploading ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              className="mws-icon-btn mws-icon-btn--danger"
              onClick={onRemove}
              disabled={busy || uploading}
              title="Remove attachment"
              aria-label="Remove attachment"
            >
              <FiX />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="mws-btn mws-btn--ghost mws-attachment-add"
          onClick={() => inputRef.current?.click()}
          disabled={busy || uploading}
        >
          <FiPaperclip aria-hidden="true" />
          {uploading ? "Uploading…" : "Attach a PDF, image or file"}
        </button>
      )}

      <p className="mws-note">
        {attachment
          ? "Everyone receives this same file, with the message text as its caption."
          : "Images are sent as photos; a PDF or anything else is sent as a document."}
      </p>
    </div>
  );
}
