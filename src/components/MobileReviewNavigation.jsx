import { useCallback, useEffect, useRef, useState } from "react";
import { FiCheck, FiFileText, FiBookOpen, FiEdit3, FiMoreHorizontal, FiX } from "react-icons/fi";
import usePhoneLayout from "../hooks/usePhoneLayout";
import useMobileDialog from "../hooks/useMobileDialog";
import "./SubmissionMobile.css";

export default function MobileReviewNavigation({ onSave, saving, saveDisabled, hasChanges, hasReview = true, hasScheme = true, onClose }) {
  const phone = usePhoneLayout();
  const [view, setView] = useState(hasReview ? "review" : "paper");
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const stableClose = useCallback(() => closeRef.current?.(), []);

  useEffect(() => {
    if (!phone) return undefined;
    const modal = ref.current?.closest(".msv-review-workspace");
    if (!modal) return undefined;
    modal.dataset.mobileView = view;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Submission review");
    const showPaper = (event) => {
      if (event.target.closest("[data-mobile-open-paper]")) setView("paper");
    };
    modal.addEventListener("click", showPaper);
    return () => {
      delete modal.dataset.mobileView;
      modal.removeAttribute("role");
      modal.removeAttribute("aria-modal");
      modal.removeAttribute("aria-label");
      modal.removeEventListener("click", showPaper);
    };
  }, [phone, view]);
  useMobileDialog(ref, phone, stableClose);
  if (!phone) return null;

  const views = [
    ...(hasReview ? [["review", "Review", FiEdit3]] : []),
    ["paper", "Paper", FiFileText],
    ...(hasScheme ? [["scheme", "Mark scheme", FiBookOpen]] : []),
    ["actions", "Actions", FiMoreHorizontal],
  ];
  return (
    <div ref={ref} className="msv-mobile-review">
      <div className="msv-mobile-review-save">
        <span role="status">{saving ? "Saving changes…" : hasChanges ? "Unsaved changes" : "Review submission"}</span>
        {onSave && <button type="button" className="msv-mobile-save" onClick={onSave} disabled={saving || saveDisabled}><FiCheck /> {saving ? "Saving…" : "Save changes"}</button>}
        <button type="button" className="msv-mobile-close" onClick={onClose} aria-label="Close viewer"><FiX size={20} /></button>
      </div>
      <nav aria-label="Submission review sections" className="msv-mobile-review-tabs">
        {views.map(([id, label, icon]) => {
          const SectionIcon = icon;
          return <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)}><SectionIcon aria-hidden="true" size={18} /><span>{label}</span></button>;
        })}
      </nav>
    </div>
  );
}
