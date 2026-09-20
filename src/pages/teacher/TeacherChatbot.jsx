import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../api/api";
import { toast } from "react-toastify";
import { TeacherPageHeader } from "./TeacherUI";
import {
  FiSend,
  FiPlus,
  FiCpu,
  FiUser,
  FiZap,
  FiMic,
  FiSquare,
  FiCopy,
  FiRefreshCw,
  FiEdit2,
  FiCheck,
  FiX,
  FiCheckCircle,
} from "react-icons/fi";
import { streamAgentTurn, revealText } from "../../utils/agentStream";
import { useVoiceCommand } from "../../utils/useVoiceCommand";
import {
  createCoursework,
  downloadGradesExcel,
  previewAssignmentReport,
  pushClassroomGrades,
  sendAssignmentReport,
  sendMonthly,
  sendExecutiveReport,
  sendTeacherCollectiveReport,
  syncClassroom,
  syncCourseworkFromGoogle,
  syncStudentRoster,
  updateStudentContact,
  transcribeVoiceCommand,
} from "./teacherChatbotActionsClient";
import { confirmToast } from "../../utils/confirmToast";
import "./teacher.css";
import "./TeacherChatbot.css";

const SUGGESTIONS = [
  "Give me today's briefing",
  "Show me the submissions for the midterm in Class 9A",
  "Show Omar's marked submission for the last test",
  "Which questions did the class struggle with most?",
  "Send Omar's report for the last test in Class 9A",
  "Which students are missing a parent phone number?",
  "Export grades for the midterm in Physics",
  "Push the midterm grades to Google Classroom",
  "Send teacher collective report for Class 9A",
];

const CONFIRM_LABELS = {
  export_grades: "Download Excel",
  create_coursework: "Create assignment",
  send_teacher_collective_report: "Send collective PDF",
  send_executive_report: "Send executive report",
  sync_student_roster: "Sync roster",
  update_student_contact: "Save contact",
  push_classroom_grades: "Push grades",
  sync_classroom: "Sync now",
  sync_coursework_from_google: "Import assignments",
};

const STORAGE_KEY = "sahahly-teacher-ai-agent";

const BROADCAST_ACTION_TYPES = new Set([
  "send_assignment_report",
  "send_monthly_report",
  "send_teacher_collective_report",
  "send_executive_report",
]);

function actionCardMeta(type) {
  if (BROADCAST_ACTION_TYPES.has(type)) {
    return { tone: "broadcast", Icon: FiSend };
  }
  return { tone: "primary", Icon: FiCheckCircle };
}

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
  const [progressLabel, setProgressLabel] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [copiedIndex, setCopiedIndex] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const revealStopRef = useRef(null);

  const voice = useVoiceCommand(transcribeVoiceCommand, (text) => send(text));

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

  const runTurn = useCallback(
    async (nextMessages) => {
      if (!user?.id) return;
      clearActionState();
      setLoading(true);
      setLastMatched(null);
      setProgressLabel("Thinking…");

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        setLoading(false);
        setProgressLabel(null);
        inputRef.current?.focus();
      };

      await streamAgentTurn(
        "/teacher-chatbot/agent-stream",
        {
          personId: user.id,
          messages: nextMessages.map(({ role, content: c }) => ({ role, content: c })),
        },
        {
          onProgress: (evt) => setProgressLabel(evt.label || "Working…"),
          onFinal: (data) => {
            setProgressLabel(null);
            setLastMatched(data.matched || null);
            if (data.actionProposal) setActionProposal(data.actionProposal);

            const replyText =
              data.reply?.trim() || "I couldn't complete that request. Please try rephrasing.";
            setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
            revealStopRef.current?.();
            revealStopRef.current = revealText(
              replyText,
              (partial) => {
                setMessages((prev) => {
                  const next = [...prev];
                  next[next.length - 1] = { role: "assistant", content: partial };
                  return next;
                });
              },
              finish
            );
          },
          onError: (err) => {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content:
                  err.message || "Something went wrong reaching the assistant. Please try again.",
                isError: true,
              },
            ]);
            finish();
          },
        }
      );
    },
    [user?.id]
  );

  const send = useCallback(
    (text) => {
      const content = String(text ?? input).trim();
      if (!content || loading || !user?.id) return;
      const nextMessages = [...messages, { role: "user", content }];
      setMessages(nextMessages);
      setInput("");
      runTurn(nextMessages);
    },
    [input, loading, messages, user?.id, runTurn]
  );

  const retryLast = useCallback(() => {
    if (loading) return;
    const lastUserIdx = messages.map((m) => m.role).lastIndexOf("user");
    if (lastUserIdx === -1) return;
    const trimmed = messages.slice(0, lastUserIdx + 1);
    setMessages(trimmed);
    runTurn(trimmed);
  }, [messages, loading, runTurn]);

  const startEdit = (index) => {
    if (loading) return;
    setEditingIndex(index);
    setEditValue(messages[index]?.content || "");
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditValue("");
  };

  const saveEdit = () => {
    const content = editValue.trim();
    if (!content || editingIndex == null) return;
    const trimmed = messages.slice(0, editingIndex);
    setEditingIndex(null);
    setEditValue("");
    setMessages(trimmed);
    send(content);
  };

  const copyMessage = (index, content) => {
    navigator.clipboard
      ?.writeText(content)
      .then(() => {
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex((i) => (i === index ? null : i)), 1500);
      })
      .catch(() => toast.error("Couldn't copy — please select and copy manually."));
  };

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
        let result = await sendAssignmentReport(ex.classroomId, ex.reports, overrides);
        const skipped = result.skippedCount || 0;
        if (skipped > 0) {
          const sent = result.sentCount ?? 0;
          const confirmed = await confirmToast(
            sent > 0
              ? `Sent to ${sent}. ${skipped} were skipped because they were already sent recently. Send those again too?`
              : "This report was already sent recently. Are you sure you want to send it again?",
            {
              title: "Already sent recently",
              confirmLabel: "Send again",
              cancelLabel: sent > 0 ? "Keep as is" : "Cancel",
              toastId: "teacher-agent-force-resend",
            }
          );
          if (confirmed) {
            result = await sendAssignmentReport(ex.classroomId, ex.reports, overrides, {
              forceResend: true,
            });
          } else if (sent === 0) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: "Send cancelled — nothing was resent." },
            ]);
            clearActionState();
            return;
          }
        }
        const summary = result.summary || [];
        const ok = result.sentCount ?? summary.filter((r) => r.status === "fulfilled").length;
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
      } else if (actionProposal.type === "send_executive_report") {
        await sendExecutiveReport({
          personId: user.id,
          assignmentId: ex.assignmentId,
          trigger: ex.trigger,
        });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Executive analysis report sent for **${ex.assignmentTitle}**.`,
          },
        ]);
      } else if (actionProposal.type === "send_teacher_collective_report") {
        await sendTeacherCollectiveReport({
          personId: user.id,
          classroomId: ex.classroomId,
          reports: ex.reports,
        });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Teacher collective PDF sent for **${ex.classroomName}**.`,
          },
        ]);
      } else if (actionProposal.type === "sync_student_roster") {
        const result = await syncStudentRoster({
          personId: user.id,
          classroomId: ex.classroomId,
        });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Roster synced for **${ex.classroomName}** — ${
              result.synced ?? 0
            } student(s) updated${result.removed ? `, ${result.removed} removed` : ""}.`,
          },
        ]);
      } else if (actionProposal.type === "update_student_contact") {
        await updateStudentContact({
          personId: user.id,
          classroomId: ex.classroomId,
          studentId: ex.studentId,
          updates: ex.updates,
        });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Updated contact details for **${ex.studentName}**.`,
          },
        ]);
      } else if (actionProposal.type === "push_classroom_grades") {
        await pushClassroomGrades({
          personId: user.id,
          assignmentId: ex.assignmentId,
        });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Pushed grades to Google Classroom for **${ex.assignmentTitle}**.`,
          },
        ]);
      } else if (actionProposal.type === "sync_classroom") {
        await syncClassroom({
          personId: user.id,
          assignmentId: ex.assignmentId,
        });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Synced submissions for **${ex.assignmentTitle}**.`,
          },
        ]);
      } else if (actionProposal.type === "sync_coursework_from_google") {
        const result = await syncCourseworkFromGoogle({
          personId: user.id,
          courseId: ex.courseId,
          classroomId: ex.classroomId,
        });
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Imported Google Classroom assignments for **${ex.classroomName}** — ${
              result.synced ?? 0
            } synced${result.added ? `, ${result.added} new` : ""}${
              result.restored ? `, ${result.restored} restored` : ""
            }.`,
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
    revealStopRef.current?.();
    setMessages([]);
    setLastMatched(null);
    setEditingIndex(null);
    clearActionState();
    sessionStorage.removeItem(STORAGE_KEY);
    inputRef.current?.focus();
  };

  useEffect(() => () => revealStopRef.current?.(), []);

  const matchedChips = [
    ...(lastMatched?.classrooms || []).map((n) => ({ type: "class", name: n })),
    ...(lastMatched?.students || []).map((n) => ({ type: "student", name: n })),
  ];

  const showPreviewEditor =
    actionProposal &&
    (actionProposal.type === "send_assignment_report" ||
      actionProposal.type === "send_monthly_report");

  const confirmLabel = CONFIRM_LABELS[actionProposal?.type] || "Send";

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
                Click the <FiMic size={12} /> mic to speak a command instead of typing.
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
              {messages.map((m, i) => {
                const isLastAssistant =
                  m.role === "assistant" && i === messages.length - 1 && !loading;
                const isEditing = editingIndex === i;
                return (
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
                    <div className="tchat-bubble-col">
                      {isEditing ? (
                        <div className="tchat-edit-row">
                          <textarea
                            className="tchat-input tchat-edit-textarea"
                            value={editValue}
                            rows={2}
                            autoFocus
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                saveEdit();
                              } else if (e.key === "Escape") {
                                cancelEdit();
                              }
                            }}
                          />
                          <div className="tchat-edit-actions">
                            <button
                              type="button"
                              className="tch-btn tch-btn--primary tch-btn--sm"
                              onClick={saveEdit}
                            >
                              <FiCheck size={13} /> Save &amp; resend
                            </button>
                            <button
                              type="button"
                              className="tch-btn tch-btn--ghost tch-btn--sm"
                              onClick={cancelEdit}
                            >
                              <FiX size={13} /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
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
                      )}
                      {!isEditing && (
                        <div className="tchat-msg-actions">
                          {m.content ? (
                            <button
                              type="button"
                              className="tchat-msg-action"
                              onClick={() => copyMessage(i, m.content)}
                              title="Copy"
                            >
                              {copiedIndex === i ? <FiCheck size={12} /> : <FiCopy size={12} />}
                            </button>
                          ) : null}
                          {m.role === "user" && !loading ? (
                            <button
                              type="button"
                              className="tchat-msg-action"
                              onClick={() => startEdit(i)}
                              title="Edit & resend"
                            >
                              <FiEdit2 size={12} />
                            </button>
                          ) : null}
                          {isLastAssistant ? (
                            <button
                              type="button"
                              className="tchat-msg-action"
                              onClick={retryLast}
                              title="Retry"
                            >
                              <FiRefreshCw size={12} />
                            </button>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {loading && progressLabel && (
                <div className="tchat-row">
                  <div className="tchat-avatar">
                    <FiCpu size={14} />
                  </div>
                  <div className="tchat-bubble tchat-bubble--typing">
                    <span className="tchat-dot" />
                    <span className="tchat-dot" />
                    <span className="tchat-dot" />
                    <span className="tchat-progress-label">{progressLabel}</span>
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
                <div className={`tchat-action-card tchat-action-card--${actionCardMeta(actionProposal.type).tone}`}>
                  <div className="tchat-action-card-title">
                    {(() => {
                      const { Icon } = actionCardMeta(actionProposal.type);
                      return <Icon size={15} />;
                    })()}
                    {actionProposal.title}
                  </div>
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

        {voice.micError && <div className="tchat-mic-error">{voice.micError}</div>}
        <form
          className="tchat-inputbar"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <button
            type="button"
            className={`tchat-mic ${voice.recording ? "tchat-mic--recording" : ""}`}
            onClick={voice.toggle}
            disabled={loading || executing || voice.transcribing}
            aria-label={voice.recording ? "Stop recording" : "Speak a command"}
            title={voice.recording ? "Stop recording" : "Speak a command"}
          >
            {voice.recording ? <FiSquare size={15} /> : <FiMic size={16} />}
          </button>
          <textarea
            ref={inputRef}
            className="tchat-input"
            placeholder={
              voice.recording
                ? "Listening… click the mic to stop"
                : voice.transcribing
                ? "Transcribing your voice command…"
                : 'Ask or instruct — e.g. "Send Sara\'s report for Quiz 2 in Grade 10"'
            }
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={loading || executing || voice.recording || voice.transcribing}
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
