import { useEffect, useState } from "react";
import { FiEye, FiFileText } from "react-icons/fi";
import api from "../api/api";

/**
 * PDF iframe preview — same UX as monthly parent reports.
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
  const [expanded, setExpanded] = useState(defaultExpanded);

  const method = String(fetchConfig?.method || "get").toLowerCase();
  const depsKey = JSON.stringify({
    url: fetchConfig?.url || null,
    method,
    params: fetchConfig?.params || {},
    data: fetchConfig?.data || null,
  });

  useEffect(() => {
    if (!fetchConfig?.url) {
      setPdfUrl(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    let active = true;
    let objectUrl = null;
    setLoading(true);
    setError(null);
    setPdfUrl(null);

    const request =
      method === "post"
        ? api.post(fetchConfig.url, fetchConfig.data || {}, {
            responseType: "blob",
            timeout: 120_000,
          })
        : api.get(fetchConfig.url, {
            params: fetchConfig.params,
            responseType: "blob",
            timeout: 120_000,
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
        setError(message);
        setPdfUrl(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  if (!fetchConfig?.url) return null;

  return (
    <div className="mpr-pdf-preview">
      <button
        type="button"
        className="mpr-pdf-preview-toggle"
        onClick={() => setExpanded((v) => !v)}
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
