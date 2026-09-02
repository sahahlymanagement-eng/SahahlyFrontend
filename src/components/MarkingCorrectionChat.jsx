import { useCallback, useEffect, useRef, useState } from "react";
import { FiSend, FiCheck, FiMessageCircle } from "react-icons/fi";
import api from "../api/api";
import { toast } from "react-toastify";
import { applyCorrectionPatch } from "../utils/markingFormData";
import { getApiErrorMessage } from "../utils/markingFormData";

const CATEGORY_LABELS = {
  wrong_marks: "Wrong marks",
  misread_answer: "Misread answer",
  sign_error: "Sign error",
  method_marks: "Method marks",
  mcq_error: "MCQ error",
  summary_issue: "Summary issue",
  missing_credit: "Missing credit",
  over_penalized: "Over-penalized",
  other: "Other",
};

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Post-grade correction chat in the Results modal.
 * Messages are persisted for pattern analysis.
 */
export default function MarkingCorrectionChat({
  assignmentId,
  submissionId,
  studentId,
  studentName,
  gradingPartnerSlug = null,
  currentResult,
  onApplyPatch,
}) {
  const [messages, setMessages] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [pendingCorrection, setPendingCorrection] = useState(null);
  const scrollRef = useRef(null);

  const loadHistory = useCallback(async () => {
    if (!assignmentId || !submissionId) return;
    setLoadingHistory(true);
    try {
      const res = await api.get(`/marking-correction/${assignmentId}/${submissionId}`);
      setMessages(res.data?.messages || []);
    } catch (err) {
      console.error("Failed to load correction chat", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [assignmentId, submissionId]);

  useEffect(() => {
    setMessages([]);
    setPendingCorrection(null);
    setDraft("");
    loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pendingCorrection, sending]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setPendingCorrection(null);
    try {
      const res = await api.post("/marking-correction/chat", {
        assignmentId,
        submissionId,
        studentId,
        studentName,
        gradingPartnerSlug,
        message: text,
        currentResult: {
          ...currentResult,
          questions: currentResult?.questions || [],
        },
      });

      setDraft("");
      setMessages((prev) => [
        ...prev,
        res.data.userMessage,
        res.data.assistantMessage,
      ]);
      setPendingCorrection({
        messageId: res.data.assistantMessage?._id,
        correction: res.data.correction,
      });
    } catch (err) {
      toast.error(await getApiErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const handleApply = async () => {
    if (!pendingCorrection?.correction) return;
    const { changes, summary } = pendingCorrection.correction;
    const patched = applyCorrectionPatch(currentResult?.questions || [], {
      changes,
      summary,
    });

    // A change naming a question that is not in the result used to no-op in
    // silence while the summary was still rewritten — leaving a summary that
    // claimed a new total next to marks that never moved. Say so instead.
    if (patched.unmatched.length) {
      toast.warning(
        `Couldn't match ${patched.unmatched.length === 1 ? "question" : "questions"} ` +
          `${patched.unmatched.join(", ")} to this result — ` +
          `${patched.matched ? "the other changes were applied." : "nothing was changed."}`
      );
    }

    onApplyPatch({
      questions: patched.questions,
      // Only take the AI's summary when something actually changed; otherwise it
      // would state a total the marks do not support.
      summary: patched.matched ? patched.summary : null,
    });

    if (pendingCorrection.messageId) {
      try {
        await api.patch(
          `/marking-correction/messages/${pendingCorrection.messageId}/applied`
        );
        setMessages((prev) =>
          prev.map((m) =>
            m._id === pendingCorrection.messageId
              ? { ...m, patchApplied: true, patchAppliedAt: new Date().toISOString() }
              : m
          )
        );
      } catch {
        // patch still applied in UI
      }
    }

    toast.success("AI suggestion applied — review and Confirm Edits to save.");
    setPendingCorrection(null);
  };

  const changeCount = pendingCorrection?.correction?.changes?.length || 0;
  const hasSummaryUpdate = Boolean(pendingCorrection?.correction?.summary);

  return (
    <div className="mcc-panel">
      <div className="mcc-header">
        <FiMessageCircle size={14} />
        <span>Correction Chat</span>
        <span className="mcc-header-hint">Tell the AI what it got wrong</span>
      </div>

      <div className="mcc-messages" ref={scrollRef}>
        {loadingHistory && (
          <div className="mcc-empty">Loading chat…</div>
        )}
        {!loadingHistory && messages.length === 0 && (
          <div className="mcc-empty">
            Example: &quot;Q1a should be 1/1 — the expansion 7(2x+7)=14x+49 is correct.&quot;
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg._id}
            className={`mcc-bubble mcc-bubble--${msg.role}`}
          >
            <div className="mcc-bubble-meta">
              <span>{msg.role === "user" ? "You" : "AI"}</span>
              <span>{formatTime(msg.createdAt)}</span>
              {msg.problemCategory && (
                <span className="mcc-category">
                  {CATEGORY_LABELS[msg.problemCategory] || msg.problemCategory}
                </span>
              )}
              {msg.patchApplied && (
                <span className="mcc-applied">Applied</span>
              )}
            </div>
            <div className="mcc-bubble-text">{msg.content}</div>
            {msg.role === "assistant" &&
              msg.proposedPatch?.changes?.length > 0 && (
                <div className="mcc-changes-preview">
                  Suggested:{" "}
                  {msg.proposedPatch.changes
                    .map((c) => `Q${c.questionNumber} → ${c.marksAwarded} marks`)
                    .join(", ")}
                </div>
              )}
          </div>
        ))}

        {sending && (
          <div className="mcc-bubble mcc-bubble--assistant mcc-bubble--typing">
            Reviewing your feedback…
          </div>
        )}
      </div>

      {pendingCorrection && (changeCount > 0 || hasSummaryUpdate) && (
        <div className="mcc-suggestion">
          <div className="mcc-suggestion-text">
            {changeCount > 0
              ? `${changeCount} question${changeCount === 1 ? "" : "s"} to update`
              : "Summary update suggested"}
            {hasSummaryUpdate ? " · summary" : ""}
          </div>
          <button type="button" className="mcc-apply-btn" onClick={handleApply}>
            <FiCheck size={13} />
            Apply suggestion
          </button>
        </div>
      )}

      <div className="mcc-input-row">
        <textarea
          className="mcc-input"
          rows={2}
          placeholder="Describe the marking mistake…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          disabled={sending}
        />
        <button
          type="button"
          className="mcc-send-btn"
          onClick={handleSend}
          disabled={sending || !draft.trim()}
          title="Send"
        >
          <FiSend size={14} />
        </button>
      </div>
    </div>
  );
}
