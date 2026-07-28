import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../api/api";
import { TeacherPageHeader } from "./TeacherUI";
import { FiSend, FiPlus, FiCpu, FiUser, FiZap } from "react-icons/fi";
import {
  createCoursework,
  downloadGradesExcel,
  previewAssignmentReport,
  sendAssignmentReport,
  sendMonthly,
} from "./teacherChatbotActionsClient";
import "./teacher.css";
import "./TeacherChatbot.css";

const SUGGESTIONS = [
  "Give me today's briefing",
  "Send Omar's report for the last test in Class 9A",
  "Which students need the most support?",
  "Show assistant workload",
  "Export grades for the midterm in Physics",
  "Create a homework assignment due next Sunday",
];

const STORAGE_KEY = "sahahly-teacher-ai-agent";

function renderMarkdown(text) {
  const escaped = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const lines = escaped.split("\n");
  const html = [];
  let inList = false;

  for (const line of lines) {
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const heading = line.match(/^\s*#{1,4}\s+(.*)$/);

    if (bullet) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMd(bullet[1])}</li>`);
      continue;
    }
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
    if (heading) {
      html.push(`<div class="tchat-md-heading">${inlineMd(heading[1])}</div>`);
    } else if (line.trim() === "") {
      html.push('<div class="tchat-md-gap"></div>');
    } else {
      html.push(`<p>${inlineMd(line)}</p>`);
    }
  }
  if (inList) html.push("</ul>");
  return html.join("");
}

function inlineMd(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function previewKey(item) {
  return String(item.studentId || item.name || item.key || "");
}

export default function TeacherChatbot() {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastMatched, setLastMatched] = useState(null);
  const [briefing, setBriefing] = useState(null);
  const [actionProposal, setActionProposal] = useState(null);
  const [editPreview, setEditPreview] = useState(null);
  const [executing, setExecuting] = useState(false);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      const parsed = JSON.parse(stored);
      setUser(parsed);
      if (parsed?.id) {
        api
          .get("/teacher-chatbot/briefing", { params: { personId: parsed.id } })
          .then((res) => setBriefing(res.data))
          .catch(() => setBriefing(null));
      }
    }
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* ignore */
    }
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading, editPreview, actionProposal]);

  const clearActionState = () => {
    setActionProposal(null);
    setEditPreview(null);
  };

  const loadPreviewsForProposal = useCallback(async (proposal) => {
    if (!proposal) return;

    if (proposal.type === "send_assignment_report") {
      setEditPreview({ loading: true, items: [] });
      try {
        const previews = await previewAssignmentReport(
          proposal.execute.classroomId,
          proposal.execute.reports
        );
        setEditPreview({
          loading: false,
          items: previews.map((p) => ({
            key: previewKey(p),
            studentId: p.studentId,
            name: p.name,
            message: p.message || p.error || "(No message)",
            error: p.error,
          })),
        });
      } catch (err) {
        setEditPreview({
          loading: false,
          items: [],
          error: err.response?.data?.message || "Failed to load preview",
        });
      }
      return;
    }

    if (proposal.type === "send_monthly_report") {
      const items = (proposal.execute.previews || []).map((p) => ({
        key: String(p.studentId),
        name: p.studentName,
        message: p.whatsappMessage || "",
      }));
      setEditPreview({ loading: false, items });
    }
  }, []);

  useEffect(() => {
    if (!actionProposal) {
      setEditPreview(null);
      return;
    }
    loadPreviewsForProposal(actionProposal);
  }, [actionProposal, loadPreviewsForProposal]);

  const send = useCallback(
    async (text) => {
      const content = String(text ?? input).trim();
      if (!content || loading || !user?.id) return;

      clearActionState();
      const nextMessages = [...messages, { role: "user", content }];
      setMessages(nextMessages);
      setInput("");
      setLoading(true);
      setLastMatched(null);

      try {
        const { data } = await api.post("/teacher-chatbot/agent", {
          personId: user.id,
          messages: nextMessages.map(({ role, content: c }) => ({
            role,
            content: c,
          })),
        });
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.reply },
        ]);
        setLastMatched(data.matched || null);
        if (data.actionProposal) {
          setActionProposal(data.actionProposal);
        }
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              err.response?.data?.message ||
              "Something went wrong reaching the assistant. Please try again.",
            isError: true,
          },
        ]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [input, loading, messages, user?.id]
  );

  const updatePreviewMessage = (key, message) => {
    setEditPreview((prev) => {
      if (!prev?.items) return prev;
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.key === key ? { ...item, message } : item
        ),
      };
    });
  };

  const buildMessageOverrides = () => {
    if (!editPreview?.items?.length) return null;
    const overrides = {};
    for (const item of editPreview.items) {
      const text = String(item.message || "").trim();
      if (!text) continue;
      if (item.studentId) overrides[String(item.studentId)] = text;
      if (item.name) overrides[item.name] = text;
      if (item.key) overrides[item.key] = text;
    }
    return Object.keys(overrides).length ? overrides : null;
  };

  const confirmAction = async () => {
    if (!actionProposal || !user?.id || executing) return;
    setExecuting(true);

    try {
      const ex = actionProposal.execute;

      if (actionProposal.type === "send_assignment_report") {
        const overrides = buildMessageOverrides();
        const result = await sendAssignmentReport(ex.classroomId, ex.reports, overrides);
        const summary = result.summary || [];
        const ok = summary.filter((r) => r.status === "fulfilled").length;
        const fail = summary.filter((r) => r.status === "rejected").length;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Done — sent **${ok}** report(s)${fail ? `, **${fail}** failed` : ""}.`,
          },
        ]);
      } else if (actionProposal.type === "send_monthly_report") {
        const overrides = buildMessageOverrides();
        const result = await sendMonthly({
          personId: user.id,
          classroomId: ex.classroomId,
          year: ex.year,
          month: ex.month,
          studentIds: ex.studentIds,
          messageOverrides: overrides,
        });
        const sent = result.sent ?? result.successCount ?? ex.studentIds.length;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Done — monthly report send completed (${sent} recipient(s)).`,
          },
        ]);
      } else if (actionProposal.type === "create_coursework") {
        await createCoursework({
          personId: user.id,
          courseId: ex.courseId,
          courseworkData: ex.courseworkData,
        });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Created assignment **${ex.courseworkData.title}** in ${ex.classroomName}. Attach worksheets from **Courses** if needed.`,
          },
        ]);
      } else if (actionProposal.type === "export_grades") {
        const filename = await downloadGradesExcel(
          user.id,
          ex.assignmentId,
          ex.targetMax
        );
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Downloaded **${filename}** for ${ex.assignmentTitle}.`,
          },
        ]);
      }

      clearActionState();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: err.response?.data?.message || err.message || "Action failed.",
          isError: true,
        },
      ]);
    } finally {
      setExecuting(false);
      inputRef.current?.focus();
    }
  };

  const cancelAction = () => {
    clearActionState();
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "Action cancelled." },
    ]);
  };

  const newChat = () => {
    setMessages([]);
    setLastMatched(null);
    clearActionState();
    sessionStorage.removeItem(STORAGE_KEY);
    inputRef.current?.focus();
  };

  const matchedChips = [
    ...(lastMatched?.classrooms || []).map((n) => ({ type: "class", name: n })),
    ...(lastMatched?.students || []).map((n) => ({ type: "student", name: n })),
  ];

  const showPreviewEditor =
    actionProposal &&
    (actionProposal.type === "send_assignment_report" ||
      actionProposal.type === "send_monthly_report");

  const confirmLabel =
    actionProposal?.type === "export_grades"
      ? "Download Excel"
      : actionProposal?.type === "create_coursework"
        ? "Create assignment"
        : "Send";

  return (
    <div className="tch-page tch-page--wide tchat-page">
      <TeacherPageHeader
        eyebrow="AI Assistant"
        title="AI Agent"
        subtitle="Ask questions or tell me what to do — e.g. send a report, export grades, create an assignment."
        actions={
          messages.length > 0 ? (
            <button type="button" className="tch-btn tch-btn--ghost" onClick={newChat}>
              <FiPlus size={15} /> New chat
            </button>
          ) : null
        }
      />

      <div className="tchat-shell">
        <div className="tchat-scroll" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="tchat-empty">
              <div className="tchat-empty-icon">
                <FiCpu size={26} />
              </div>
              <h3>What would you like to know or do?</h3>
              <p>
                Ask about your classes, or tell me to send a report, export grades,
                or create an assignment. I&apos;ll show a preview before anything is sent.
              </p>
              {briefing?.lines?.length ? (
                <div className="tchat-briefing-card">
                  <div className="tchat-briefing-card-title">
                    {briefing.greeting || "Today's briefing"}
                  </div>
                  <ul>
                    {briefing.lines.slice(0, 5).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="tchat-suggestion"
                    onClick={() => send("Give me today's briefing")}
                  >
                    <FiZap size={13} />
                    Explain this briefing
                  </button>
                </div>
              ) : null}
              <div className="tchat-suggestions">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="tchat-suggestion"
                    onClick={() => send(s)}
                  >
                    <FiZap size={13} />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="tchat-messages">
              {messages.map((m, i) => (
                <div
                  key={`${m.at || i}-${i}`}
                  className={`tchat-row ${m.role === "user" ? "tchat-row--user" : ""}`}
                >
                  <div
                    className={`tchat-avatar ${
                      m.role === "user" ? "tchat-avatar--user" : ""
                    }`}
                  >
                    {m.role === "user" ? <FiUser size={14} /> : <FiCpu size={14} />}
                  </div>
                  <div
                    className={`tchat-bubble ${
                      m.role === "user" ? "tchat-bubble--user" : ""
                    } ${m.isError ? "tchat-bubble--error" : ""}`}
                  >
                    {m.role === "assistant" ? (
                      <div
                        className="tchat-md"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }}
                      />
                    ) : (
                      m.content
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="tchat-row">
                  <div className="tchat-avatar">
                    <FiCpu size={14} />
                  </div>
                  <div className="tchat-bubble tchat-bubble--typing">
                    <span className="tchat-dot" />
                    <span className="tchat-dot" />
                    <span className="tchat-dot" />
                  </div>
                </div>
              )}

              {!loading && matchedChips.length > 0 && (
                <div className="tchat-matched">
                  Answered using data from:
                  {matchedChips.map((c) => (
                    <span
                      key={`${c.type}-${c.name}`}
                      className={`tchat-chip tchat-chip--${c.type}`}
                    >
                      {c.type === "class" ? "📚" : "🎓"} {c.name}
                    </span>
                  ))}
                </div>
              )}

              {actionProposal && (
                <div className="tchat-action-card">
                  <div className="tchat-action-card-title">{actionProposal.title}</div>
                  {editPreview?.loading && (
                    <p className="tchat-action-card-hint">Loading preview…</p>
                  )}
                  {editPreview?.error && (
                    <p className="tchat-action-card-error">{editPreview.error}</p>
                  )}
                  {showPreviewEditor && editPreview?.items?.length > 0 && (
                    <div className="tchat-preview-list">
                      {editPreview.items.map((item) => (
                        <label key={item.key} className="tchat-preview-item">
                          <span className="tchat-preview-name">{item.name}</span>
                          <textarea
                            className="tchat-preview-textarea"
                            value={item.message}
                            rows={Math.min(
                              12,
                              Math.max(4, String(item.message || "").split("\n").length + 1)
                            )}
                            onChange={(e) =>
                              updatePreviewMessage(item.key, e.target.value)
                            }
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  {!showPreviewEditor && (
                    <p className="tchat-action-card-hint">
                      Review and confirm to proceed.
                    </p>
                  )}
                  <div className="tchat-preview-actions">
                    <button
                      type="button"
                      className="tch-btn tch-btn--primary"
                      onClick={confirmAction}
                      disabled={executing || editPreview?.loading}
                    >
                      {executing ? "Working…" : confirmLabel}
                    </button>
                    <button
                      type="button"
                      className="tch-btn tch-btn--ghost"
                      onClick={cancelAction}
                      disabled={executing}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <form
          className="tchat-inputbar"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            ref={inputRef}
            className="tchat-input"
            placeholder='Ask or instruct — e.g. "Send Sara&apos;s report for Quiz 2 in Grade 10"'
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={loading || executing}
          />
          <button
            type="submit"
            className="tchat-send"
            disabled={loading || executing || !input.trim()}
            aria-label="Send message"
          >
            <FiSend size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
