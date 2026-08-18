import { useEffect, useRef, useState } from "react";
import { FiEye, FiFileText } from "react-icons/fi";
import api from "../api/api";

// A report PDF is built on demand — the server reads the whole classroom's month
// to draw one. 120s used to sit just under what a slow class actually takes, so
// the request died a second before the PDF was ready and the user saw only the
// error. Long is better than lost.
const PREVIEW_TIMEOUT_MS = 300_000;

/**
 * PDF iframe preview — same UX as monthly parent reports.
 *
 * Loads LAZILY: nothing is requested until the card is expanded. The monthly
 * grid mounts one of these per student, and having them all fetch on mount meant
 * eight simultaneous report builds — the slowest way to get the first one.
 *
 * fetchConfig:
 *   { url, method?: "get"|"post", params?, data? }
 */
export default function ReportPdfPreview({
  fetchConfig,
  title = "PDF preview",
  frameClassName = "",
  defaultExpanded = true,
}) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // null means "follow the caller", so clicking a student in the grid opens that
  // card. Once the user works the toggle themselves their choice sticks, and the
  // caller stops overriding it. Derived rather than synced in an effect — an
  // effect here would re-render every card on every focus change.
  const [userExpanded, setUserExpanded] = useState(null);
  const expanded = userExpanded ?? defaultExpanded;

  // What we already hold a PDF for, so collapsing and re-expanding a card does
  // not pay for the same build twice.
  const loadedKeyRef = useRef(null);
  // Held in a ref, not revoked by the fetch effect's cleanup: that cleanup now
  // also runs on collapse, and revoking there would leave the iframe pointing at
  // a dead blob the moment the card is reopened.
  const objectUrlRef = useRef(null);

  const method = String(fetchConfig?.method || "get").toLowerCase();
  const depsKey = JSON.stringify({
    url: fetchConfig?.url || null,
    method,
    params: fetchConfig?.params || {},
    data: fetchConfig?.data || null,
  });

  useEffect(() => {
    if (!fetchConfig?.url) {
      loadedKeyRef.current = null;
      setPdfUrl(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    // Collapsed: cost nothing, and keep whatever is already loaded.
    if (!expanded) return undefined;
    if (loadedKeyRef.current === depsKey) return undefined;

    let active = true;
    let objectUrl = null;
    setLoading(true);
    setError(null);
    setPdfUrl(null);

    const request =
      method === "post"
        ? api.post(fetchConfig.url, fetchConfig.data || {}, {
            responseType: "blob",
            timeout: PREVIEW_TIMEOUT_MS,
          })
        : api.get(fetchConfig.url, {
            params: fetchConfig.params,
            responseType: "blob",
            timeout: PREVIEW_TIMEOUT_MS,
          });

    request
      .then((res) => {
        if (!active) return;
        const contentType = String(res.headers?.["content-type"] || "");
        if (contentType.includes("application/json")) {
          throw new Error("Server returned JSON instead of a PDF");
        }
        objectUrl = URL.createObjectURL(
          new Blob([res.data], { type: "application/pdf" })
        );
        objectUrlRef.current = objectUrl;
        loadedKeyRef.current = depsKey;
        setPdfUrl(objectUrl);
      })
      .catch(async (err) => {
        if (!active) return;
        let message = "Could not load PDF preview";
        const data = err.response?.data;
        if (data instanceof Blob) {
          try {
            const parsed = JSON.parse(await data.text());
            if (parsed?.message) message = parsed.message;
          } catch {
            // keep default
          }
        } else if (data?.message) {
          message = data.message;
        } else if (err.message) {
          message = err.message;
        }
        // A failed build must not count as loaded, or re-expanding shows a stale
        // error forever instead of retrying.
        loadedKeyRef.current = null;
        setError(message);
        setPdfUrl(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, expanded]);

  // Release the blob when the card moves to a different student/month, and on
  // unmount — the two points at which the loaded PDF stops being the right one.
  useEffect(
    () => () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    },
    [depsKey]
  );

  if (!fetchConfig?.url) return null;

  return (
    <div className="mpr-pdf-preview">
      <button
        type="button"
        className="mpr-pdf-preview-toggle"
        onClick={() => setUserExpanded(!expanded)}
      >
        <FiFileText size={14} />
        <span>{title}</span>
        <small>{expanded ? "Hide" : "Show"}</small>
      </button>

      {expanded && (
        <div className="mpr-pdf-preview-body">
          {loading && <p className="mpr-pdf-preview-status">Generating PDF preview…</p>}
          {error && (
            <p className="mpr-pdf-preview-status mpr-pdf-preview-status--error">{error}</p>
          )}
          {pdfUrl && !loading && (
            <>
              <p className="mpr-pdf-preview-note">
                <FiEye size={13} /> Review the exact PDF below before sending.
              </p>
              <iframe
                title={title}
                src={`${pdfUrl}#toolbar=1&navpanes=0`}
                className={`mpr-pdf-preview-frame ${frameClassName}`.trim()}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
