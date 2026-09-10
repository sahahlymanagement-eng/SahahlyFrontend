import { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { Icon } from "../ui.jsx";

function applyPatchesLocal(questions, patches) {
  let next = (questions || []).map((q) => ({
    ...q,
    qpPages: [...(q.qpPages || [])],
    msPages: [...(q.msPages || [])],
    markPoints: (q.markPoints || []).map((p) => ({
      ...p,
      alternatives: [...(p.alternatives || [])],
    })),
    acceptableAnswers: [...(q.acceptableAnswers || [])],
  }));

  for (const row of patches || []) {
    const op = String(row.op || "update").toLowerCase();
    if (op === "add") {
      const patch = row.patch || {};
      next.push({
        id: `chat_${Date.now()}_${next.length}`,
        label: String(patch.label || "").trim() || `q${next.length + 1}`,
        stem: String(patch.stem || "").trim(),
        qpPages: Array.isArray(patch.qpPages) ? patch.qpPages : [],
        msPages: Array.isArray(patch.msPages) ? patch.msPages : [],
        msLabel: patch.msLabel != null ? String(patch.msLabel).trim() : "",
        maxMarks: patch.maxMarks ?? null,
        questionType: patch.questionType || "other",
        isMcq: Boolean(patch.isMcq),
        correctMcqLetter: patch.correctMcqLetter || null,
        hasDiagram: Boolean(patch.hasDiagram),
        markPoints: Array.isArray(patch.markPoints) ? patch.markPoints : [],
        acceptableAnswers: Array.isArray(patch.acceptableAnswers)
          ? patch.acceptableAnswers
          : [],
        markingNotes: String(patch.markingNotes || "").trim(),
        matchedBy: "chat",
      });
      continue;
    }

    const index = next.findIndex(
      (q) =>
        (row.questionId && q.id === row.questionId) ||
        (row.label && String(q.label).toLowerCase() === String(row.label).toLowerCase()) ||
        (row.patch?.label &&
          String(q.label).toLowerCase() === String(row.patch.label).toLowerCase())
    );
    if (index < 0) continue;

    if (op === "remove") {
      next = next.filter((_, i) => i !== index);
      continue;
    }

    const patch = row.patch || {};
    const current = next[index];
    next[index] = {
      ...current,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      matchedBy:
        patch.msLabel || current.msLabel
          ? patch.matchedBy || current.matchedBy || "chat"
          : null,
    };
  }
  return next;
}

/**
 * Sticky chat dock for fixing indexing misses (e.g. NO MS) with optional MS photos.
 */
export default function IndexChat({ examId, questions, unmatchedCount, onApplyPatches, disabled }) {
  const [open, setOpen] = useState(unmatchedCount > 0);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState([]);
  const [messages, setMessages] = useState([]);
  const [pendingPatches, setPendingPatches] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, pendingPatches, busy, open]);

  function addFiles(list) {
    const next = [...files];
    for (const file of list || []) {
      if (next.length >= 4) break;
      next.push(file);
    }
    setFiles(next);
  }

  function removeFile(index) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function send(e) {
    e?.preventDefault();
    if (busy || disabled) return;
    const text = input.trim();
    if (!text && !files.length) return;

    const userMsg = {
      id: `u_${Date.now()}`,
      role: "user",
      text: text || "Attached mark-scheme photo",
      attachments: files.map((f) => f.name),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setError("");
    setPendingPatches(null);
    setBusy(true);

    const form = new FormData();
    form.set("message", text);
    form.set(
      "history",
      JSON.stringify(
        messages.slice(-8).map((m) => ({ role: m.role, text: m.text }))
      )
    );
    form.set("questions", JSON.stringify(questions || []));
    for (const file of files) form.append("images", file);
    setFiles([]);

    try {
      const result = await api.indexChat(examId, form);
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: "assistant",
          text: result.reply,
          patchCount: result.proposedPatches?.length || 0,
        },
      ]);
      if (result.proposedPatches?.length) setPendingPatches(result.proposedPatches);
    } catch (err) {
      setError(err.message);
      setMessages((prev) => [
        ...prev,
        {
          id: `e_${Date.now()}`,
          role: "assistant",
          text: `Could not reach Gemini: ${err.message}`,
          failed: true,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function applyPending() {
    if (!pendingPatches?.length) return;
    onApplyPatches?.(applyPatchesLocal(questions, pendingPatches), pendingPatches.length);
    setPendingPatches(null);
  }

  const hint =
    unmatchedCount > 0
      ? `${unmatchedCount} question${unmatchedCount === 1 ? "" : "s"} still need an MS row — attach a photo of the scheme and say which label to fix.`
      : "Ask about pairing, marks, or attach a mark-scheme photo to tweak the index.";

  return (
    <div className={`index-chat ${open ? "open" : ""}`}>
      <button
        type="button"
        className="index-chat-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="index-chat-toggle-main">
          <Icon name="pencil" size={14} />
          Indexing chat
          {unmatchedCount > 0 && <span className="chip bad">{unmatchedCount} no MS</span>}
        </span>
        <Icon name={open ? "chevronDown" : "chevronUp"} size={14} />
      </button>

      {open && (
        <div className="index-chat-body">
          <p className="muted small index-chat-hint">{hint}</p>

          <div className="index-chat-messages" ref={listRef}>
            {messages.length === 0 && (
              <p className="muted small">
                Example: “Question 19 has no MS — here’s a photo of that mark-scheme row.”
              </p>
            )}
            {messages.map((m) => (
              <div
                key={m.id}
                className={`index-chat-bubble ${m.role}${m.failed ? " failed" : ""}`}
              >
                <p>{m.text}</p>
                {m.attachments?.length > 0 && (
                  <p className="muted small">{m.attachments.join(" · ")}</p>
                )}
              </div>
            ))}
            {busy && (
              <div className="index-chat-bubble assistant">
                <p className="pulse" style={{ margin: 0 }}>
                  Reading the pack…
                </p>
              </div>
            )}
          </div>

          {pendingPatches?.length > 0 && (
            <div className="index-chat-apply">
              <span>
                {pendingPatches.length} suggested change
                {pendingPatches.length === 1 ? "" : "s"} ready
              </span>
              <button type="button" onClick={applyPending} disabled={disabled}>
                <Icon name="check" size={14} />
                Apply to index
              </button>
            </div>
          )}

          {error && <p className="error" style={{ margin: 0 }}>{error}</p>}

          {files.length > 0 && (
            <ul className="index-chat-files">
              {files.map((file, i) => (
                <li key={`${file.name}_${i}`}>
                  <Icon name="image" size={13} />
                  <span>{file.name}</span>
                  <button type="button" className="ghost icon-only" onClick={() => removeFile(i)}>
                    <Icon name="x" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form className="index-chat-compose" onSubmit={send}>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,application/pdf,.png,.jpg,.jpeg,.webp,.gif,.pdf"
              multiple
              hidden
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="ghost icon-only"
              title="Attach mark-scheme photo"
              disabled={busy || disabled || files.length >= 4}
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="image" size={16} />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe the miss, or attach an MS photo…"
              disabled={busy || disabled}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="submit"
              disabled={busy || disabled || (!input.trim() && !files.length)}
              title="Send"
            >
              {busy ? <span className="spinner tiny" /> : <Icon name="send" size={15} />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
