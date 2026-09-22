import { useCallback, useEffect, useRef } from "react";
import { FiX, FiDownload } from "react-icons/fi";
import AnnotatedPdfPreview from "./AnnotatedPdfPreview";
import usePhoneLayout from "../hooks/usePhoneLayout";
import useMobileDialog from "../hooks/useMobileDialog";
import "./SubmissionMobile.css";

export default function MobileDocumentViewer({ url, title = "Submission", onClose, loading, error, onRetry, onDownload }) {
  const phone = usePhoneLayout();
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const stableClose = useCallback(() => closeRef.current?.(), []);
  useMobileDialog(ref, phone, stableClose);
  if (!phone) return null;
  return <div ref={ref} className="msv-mobile-document" role="dialog" aria-modal="true" aria-label={title}>
    <header><div><span>DOCUMENT VIEWER</span><h2>{title}</h2></div><button type="button" onClick={onClose} aria-label="Close viewer"><FiX size={22} /></button></header>
    <div className="msv-mobile-document-content">
      {loading ? <div className="pdf-preview-status" role="status">Loading document…</div> : error ? <div className="pdf-preview-status" role="alert"><p>{error}</p>{onRetry && <button type="button" onClick={onRetry}>Try again</button>}</div> : url ? <AnnotatedPdfPreview url={url} /> : <div className="pdf-preview-status">No document available.</div>}
    </div>
    <footer><span>Zoom to read. Swipe to explore.</span>{onDownload && <button type="button" onClick={onDownload}><FiDownload /> Download</button>}</footer>
  </div>;
}
