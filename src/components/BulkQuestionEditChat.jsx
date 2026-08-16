import { useCallback, useEffect, useRef, useState } from "react";
import {
  FiSend,
  FiLayers,
  FiChevronDown,
  FiChevronUp,
  FiCheck,
  FiAlertTriangle,
} from "react-icons/fi";
import api from "../api/api";
import { toast } from "react-toastify";
import { getApiErrorMessage } from "../utils/markingFormData";
import "./BulkQuestionEditChat.css";

/**
 * Assignment-wide edit chat, alongside the per-paper Correction Chat in the
 * Results modal.
 *
 * The difference in one line: MarkingCorrectionChat fixes THIS paper's marking,
 * this fixes the same structural thing on EVERY paper — "Q3 is out of 4, not 3".
 * The AI here only translates the sentence into operations; the backend applies
 * them, so the exact effect is shown before anything is written.
 *
 * Collapsed by default. It edits papers other than the one on screen, so it must
 * not read as part of this paper's marking.
 */

/** Papers listed individually in the preview before it collapses to a count. */
const PREVIEW_ROW_LIMIT = 8;

function formatTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describeChange(change) {
  if (change.field === "question") {
    return change.to == null
      ? `Q${change.questionNumber} removed`
      : `Q${change.questionNumber} ${change.to}`;
  }
  const from = change.from == null || change.from === "" ? "—" : change.from;
  const to = change.to == null || change.to === "" ? "—" : change.to;
  return `Q${change.questionNumber} ${change.field}: ${from} → ${to}`;
}

export default function BulkQuestionEditChat({
  source = "classroom",
  provider = null,
  assignmentId,
  assignmentName,
  onApplied,
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const scrollRef = useRef(null);

  const scope = {
    source,
    provider: source === "partner" ? provider : null,
    assignmentId: assignmentId != null ? String(assignmentId) : "",
  };

  const loadHistory = useCallback(async () => {
    if (!assignmentId) return;
    setLoadingHistory(true);
    try {
      const res = await api.get("/bulk-question-edit/history", {
        params: {
          source,
          provider: source === "partner" ? provider : undefined,
          assignmentId: String(assignmentId),
        },
      });
      setMessages(res.data?.messages || []);
    } catch (err) {
      console.error("Failed to load bulk edit chat", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [assignmentId, source, provider]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pending, sending]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setSending(true);
    setPending(null);
    setConfirming(false);
    try {
      const res = await api.post("/bulk-question-edit/chat", {
        ...scope,
        assignmentName: assignmentName || null,
        message: text,
      });

      setDraft("");
      setMessages((prev) => [...prev, res.data.userMessage, res.data.assistantMessage]);
      setPending({
        messageId: res.data.assistantMessage?._id,
        operations: res.data.operations || [],
        descriptions: res.data.descriptions || [],
        preview: res.data.preview || null,
        skipped: res.data.skipped || [],
        editablePapers: res.data.editablePapers || 0,
      });
    } catch (err) {
      toast.error(await getApiErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const handleApply = async () => {
    if (!pending?.messageId || applying) return;
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setApplying(true);
    try {
      const res = await api.post("/bulk-question-edit/apply", {
        ...scope,
        messageId: pending.messageId,
      });

      const { applied = [], failed = [], stillPending } = res.data || {};
      setMessages((prev) =>
        prev.map((m) =>
          m._id === pending.messageId
            ? { ...m, applied: true, appliedAt: new Date().toISOString(), appliedSummary: res.data.appliedSummary }
            : m
        )
      );
      setPending(null);
      setConfirming(false);

      if (failed.length) {
        toast.warning(
          `Updated ${applied.length} paper${applied.length === 1 ? "" : "s"}, but ${failed.length} failed — see ${failed
            .slice(0, 3)
            .map((f) => f.studentName || f.submissionId)
            .join(", ")}.`
        );
      } else if (stillPending) {
        // The verify pass found papers the edit should have changed and did not.
        toast.warning(
          `Updated ${applied.length} paper${applied.length === 1 ? "" : "s"}, but ${stillPending} still do not match. Send the instruction again.`
        );
      } else {
        toast.success(
          `Updated ${applied.length} paper${applied.length === 1 ? "" : "s"} in this assignment.`
        );
      }

      onApplied?.(res.data);
    } catch (err) {
      toast.error(await getApiErrorMessage(err));
    } finally {
      setApplying(false);
    }
  };

  const preview = pending?.preview;
  const affected = preview?.affectedPapers || 0;
  const rows = preview?.rows || [];
  const warnings = preview?.warnings || [];

  return (
    <div className="bqe-panel">
      <button
        type="button"
        className="bqe-header"
        onClick={() => {
          // History is fetched on expand, not on mount: this renders inside
          // every result the marker opens, and most of them never expand it.
          // Closing drops any un-applied suggestion — it described the papers as
          // they were when it was generated, and marking carries on meanwhile.
          if (open) {
            setPending(null);
            setConfirming(false);
          } else {
            loadHistory();
          }
          setOpen(!open);
        }}
        aria-expanded={open}
      >
        <FiLayers size={14} />
        <span>Edit all papers</span>
        <span className="bqe-header-hint">
          One change, every paper in this assignment
        </span>
        {open ? <FiChevronUp size={14} /> : <FiChevronDown size={14} />}
      </button>

      {open && (
        <>
          <div className="bqe-messages" ref={scrollRef}>
            {loadingHistory && <div className="bqe-empty">Loading…</div>}
            {!loadingHistory && messages.length === 0 && (
              <div className="bqe-empty">
                Examples: &quot;Question 3 should be out of 4, not 3&quot; · &quot;Rename
                question 3 to 4&quot; · &quot;Delete Q7 from every paper — it was off the
                syllabus&quot; · &quot;Add Q8, out of 5, on page 3&quot; · &quot;Everyone who got 0
                on Q5 should get 1&quot;
                <br />
                Papers already returned or published are never touched.
              </div>
            )}

            {messages.map((msg) => (
              <div key={msg._id} className={`bqe-bubble bqe-bubble--${msg.role}`}>
                <div className="bqe-bubble-meta">
                  <span>{msg.role === "user" ? msg.personName || "You" : "AI"}</span>
                  <span>{formatTime(msg.createdAt)}</span>
                  {msg.applied && (
                    <span className="bqe-applied">
                      Applied to {msg.appliedSummary?.applied ?? 0} papers
                    </span>
                  )}
                </div>
                <div className="bqe-bubble-text">{msg.content}</div>
                {msg.role === "assistant" && msg.preview?.descriptions?.length > 0 && (
                  <div className="bqe-op-list">
                    {msg.preview.descriptions.map((d, i) => (
                      <div key={i}>• {d}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {sending && (
              <div className="bqe-bubble bqe-bubble--assistant bqe-bubble--typing">
                Working out what that changes…
              </div>
            )}
          </div>

          {pending && (
            <div className="bqe-preview">
              {pending.descriptions.length > 0 ? (
                <>
                  <div className="bqe-preview-title">
                    {affected === 0
                      ? "Nothing to change — the papers already match."
                      : `${affected} paper${affected === 1 ? "" : "s"} will change`}
                  </div>
                  <div className="bqe-op-list">
                    {pending.descriptions.map((d, i) => (
                      <div key={i}>• {d}</div>
                    ))}
                  </div>

                  {rows.slice(0, PREVIEW_ROW_LIMIT).map((row) => (
                    <div key={row.submissionId} className="bqe-row">
                      <span className="bqe-row-name">
                        {row.studentName || `#${row.submissionId}`}
                      </span>
                      <span className="bqe-row-changes">
                        {row.changes.map(describeChange).join(" · ")}
                      </span>
                      <span className="bqe-row-total">
                        {row.totals.awardedBefore}/{row.totals.maxBefore} →{" "}
                        {row.totals.awardedAfter}/{row.totals.maxAfter}
                      </span>
                    </div>
                  ))}
                  {rows.length > PREVIEW_ROW_LIMIT && (
                    <div className="bqe-row bqe-row--more">
                      + {rows.length - PREVIEW_ROW_LIMIT} more paper
                      {rows.length - PREVIEW_ROW_LIMIT === 1 ? "" : "s"}
                    </div>
                  )}
                </>
              ) : (
                <div className="bqe-preview-title">No changes to apply.</div>
              )}

              {pending.skipped?.length > 0 && (
                <div className="bqe-skipped">
                  {pending.skipped.length} paper
                  {pending.skipped.length === 1 ? "" : "s"} skipped:{" "}
                  {[...new Set(pending.skipped.map((s) => s.reason))].join("; ")}
                </div>
              )}

              {warnings.map((w, i) => (
                <div key={i} className="bqe-warning">
                  <FiAlertTriangle size={12} />
                  <span>{w}</span>
                </div>
              ))}

              {affected > 0 && (
                <button
                  type="button"
                  className={`bqe-apply-btn${confirming ? " bqe-apply-btn--confirm" : ""}`}
                  onClick={handleApply}
                  disabled={applying}
                >
                  <FiCheck size={13} />
                  {applying
                    ? "Applying…"
                    : confirming
                      ? `Yes — write to ${affected} paper${affected === 1 ? "" : "s"}`
                      : `Apply to ${affected} paper${affected === 1 ? "" : "s"}`}
                </button>
              )}
              {confirming && !applying && (
                <div className="bqe-confirm-note">
                  This saves every listed paper straight away. The paper open behind
                  this modal will reload.
                </div>
              )}
            </div>
          )}

          <div className="bqe-input-row">
            <textarea
              className="bqe-input"
              rows={2}
              placeholder="e.g. Question 3 should be out of 4, not 3"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              disabled={sending || applying}
            />
            <button
              type="button"
              className="bqe-send-btn"
              onClick={handleSend}
              disabled={sending || applying || !draft.trim()}
              title="Send"
            >
              <FiSend size={14} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
