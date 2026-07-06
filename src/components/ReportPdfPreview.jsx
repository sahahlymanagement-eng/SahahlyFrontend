import { useEffect, useState } from "react";
import { FiEye, FiFileText } from "react-icons/fi";
import api from "../api/api";

export default function ReportPdfPreview({ fetchConfig, title = "PDF preview" }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!fetchConfig?.url) {
      setPdfUrl(null);
      return undefined;
    }

    let active = true;
    let objectUrl = null;
    setLoading(true);
    setError(null);

    api
      .get(fetchConfig.url, {
        params: fetchConfig.params,
        responseType: "blob",
      })
      .then((res) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(
          new Blob([res.data], { type: "application/pdf" })
        );
        setPdfUrl(objectUrl);
      })
      .catch(() => {
        if (!active) return;
        setError("Could not load PDF preview");
        setPdfUrl(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [fetchConfig?.url, JSON.stringify(fetchConfig?.params || {})]);

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
          {error && <p className="mpr-pdf-preview-status mpr-pdf-preview-status--error">{error}</p>}
          {pdfUrl && !loading && (
            <>
              <p className="mpr-pdf-preview-note">
                <FiEye size={13} /> Review the exact PDF below before sending.
              </p>
              <iframe
                title={title}
                src={pdfUrl}
                className="mpr-pdf-preview-frame"
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}
