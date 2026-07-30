import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../api/api";
import { TeacherPageHeader } from "../teacher/TeacherUI";
import { FiSend, FiPlus, FiCpu, FiUser, FiZap } from "react-icons/fi";
import {
  actOnScheduledWhatsApp,
  assignAssistant,
  changeAssistant,
  continueAutomation,
  createCoursework,
  downloadGradesExcel,
  loadAutomationStatus,
  previewAssignmentReport,
  pushClassroomGrades,
  removeAssistant,
  runAutomation,
  scheduleWhatsAppMessage,
  sendAssignmentReport,
  sendExecutiveReport,
  sendMonthly,
  sendTeacherCollectiveReport,
  syncClassroom,
  syncCourseworkFromGoogle,
  syncStudentRoster,
  updateStudentContact,
} from "./managerChatbotActionsClient";
import { confirmToast } from "../../utils/confirmToast";
import "../teacher/teacher.css";
import "../teacher/TeacherChatbot.css";

const SUGGESTIONS = [
  "Give me today's briefing",
  "Schedule a WhatsApp message to the Parents group tomorrow at 6pm",
  "Show me the submissions for the Physics test in Grade 10A",
  "Show Omar's marked submission for the last Chemistry homework",
  "Assign Raghad to mark the Physics test in Grade 10A",
  "Which questions did Class 9B struggle with most?",
  "List the scheduled WhatsApp messages",
  "Which students are missing a parent phone number in Grade 10A?",
  "Run automation on the last homework in Chemistry",
];

const STORAGE_KEY = "sahahly-manager-ai-agent";

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

function confirmLabelFor(type) {
  switch (type) {
    case "export_grades":
      return "Download Excel";
    case "create_coursework":
      return "Create assignment";
    case "assign_assistant":
      return "Assign assistant";
    case "change_assistant":
      return "Change assistant";
    case "remove_assistant":
      return "Remove assistant";
    case "run_automation":
      return "Start automation";
    case "push_classroom_grades":
      return "Push grades";
    case "sync_classroom":
      return "Sync now";
    case "send_teacher_collective_report":
      return "Send collective PDF";
    case "send_executive_report":
      return "Send executive report";
    case "sync_student_roster":
      return "Sync roster";
    case "update_student_contact":
      return "Save contact";
    case "schedule_whatsapp_message":
      return "Schedule message";
    case "send_scheduled_message_now":
      return "Send now";
    case "cancel_scheduled_message":
      return "Cancel message";
    case "delete_scheduled_message":
      return "Delete message";
    case "get_automation_status":
      return "Check status";
    case "continue_automation":
      return "Resume automation";
    case "sync_coursework_from_google":
      return "Import assignments";
    default:
      return "Confirm";
  }
}

function formatAutomationStatus(status, assignmentTitle) {
  if (!status || status.ok === false) {
    return `No automation run found for **${assignmentTitle}**.`;
  }
  const run = status.run || status;
  const parts = [
    `**${assignmentTitle}** automation status:`,
    `- Stage: ${run.stage || run.status || "unknown"}`,
  ];
  if (run.markedCount != null || run.totalCount != null) {
    parts.push(`- Marked: ${run.markedCount ?? 0} / ${run.totalCount ?? "?"}`);
  }
  if (run.startedAt) parts.push(`- Started: ${new Date(run.startedAt).toLocaleString()}`);
  if (run.finishedAt) parts.push(`- Finished: ${new Date(run.finishedAt).toLocaleString()}`);
  if (run.error || run.lastError) parts.push(`- Error: ${run.error || run.lastError}`);
  return parts.join("\n");
}

export default function ManagerChatbot() {
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
          .get("/manager-chatbot/briefing", { params: { personId: parsed.id } })
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
        const { data } = await api.post("/manager-chatbot/agent", {
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
      let successMsg = "Done.";

      switch (actionProposal.type) {
        case "send_assignment_report": {
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
                toastId: "manager-agent-force-resend",
              }
            );
            if (confirmed) {
              result = await sendAssignmentReport(ex.classroomId, ex.reports, overrides, {
                forceResend: true,
              });
            } else if (sent === 0) {
              successMsg = "Send cancelled — nothing was resent.";
              break;
            }
          }
          const summary = result.summary || [];
          const ok = result.sentCount ?? summary.filter((r) => r.status === "fulfilled").length;
          const fail = summary.filter((r) => r.status === "rejected").length;
          successMsg = `Sent **${ok}** report(s)${fail ? `, **${fail}** failed` : ""}.`;
          break;
        }
        case "send_monthly_report": {
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
          successMsg = `Monthly report send completed (${sent} recipient(s)).`;
          break;
        }
        case "create_coursework":
          await createCoursework({
            personId: user.id,
            courseId: ex.courseId,
            courseworkData: ex.courseworkData,
          });
          successMsg = `Created assignment **${ex.courseworkData.title}** in ${ex.classroomName}.`;
          break;
        case "export_grades": {
          const filename = await downloadGradesExcel(
            user.id,
            ex.assignmentId,
            ex.targetMax
          );
          successMsg = `Downloaded **${filename}** for ${ex.assignmentTitle}.`;
          break;
        }
        case "assign_assistant":
          await assignAssistant({
            personId: user.id,
            assignmentId: ex.assignmentId,
            assistantPersonId: ex.assistantPersonId,
            assignedBy: ex.assignedBy || user.id,
          });
          successMsg = `Assigned **${ex.assistantName}** to **${ex.assignmentTitle}**.`;
          break;
        case "change_assistant":
          await changeAssistant({
            personId: user.id,
            assignmentId: ex.assignmentId,
            newPersonId: ex.newPersonId,
            assignedBy: ex.assignedBy || user.id,
          });
          successMsg = `Changed assistant to **${ex.assistantName}** on **${ex.assignmentTitle}**.`;
          break;
        case "remove_assistant":
          await removeAssistant({
            personId: user.id,
            assignmentId: ex.assignmentId,
            assignedBy: ex.assignedBy || user.id,
          });
          successMsg = `Removed assistant from **${ex.assignmentTitle}**.`;
          break;
        case "run_automation": {
          const result = await runAutomation({
            personId: user.id,
            assignmentId: ex.assignmentId,
            force: ex.force,
          });
          successMsg = result.message || `Automation started for **${ex.assignmentTitle}**. Poll Automation tab for status.`;
          break;
        }
        case "push_classroom_grades":
          await pushClassroomGrades({
            personId: user.id,
            assignmentId: ex.assignmentId,
          });
          successMsg = `Pushed grades to Google Classroom for **${ex.assignmentTitle}**.`;
          break;
        case "sync_classroom":
          await syncClassroom({
            personId: user.id,
            assignmentId: ex.assignmentId,
          });
          successMsg = `Synced submissions for **${ex.assignmentTitle}**.`;
          break;
        case "send_executive_report":
          await sendExecutiveReport({
            personId: user.id,
            assignmentId: ex.assignmentId,
            trigger: ex.trigger,
          });
          successMsg = `Executive analysis report sent for **${ex.assignmentTitle}**.`;
          break;
        case "send_teacher_collective_report":
          await sendTeacherCollectiveReport({
            personId: user.id,
            classroomId: ex.classroomId,
            reports: ex.reports,
          });
          successMsg = `Teacher collective PDF sent for **${ex.classroomName}**.`;
          break;
        case "sync_student_roster": {
          const result = await syncStudentRoster({
            personId: user.id,
            classroomId: ex.classroomId,
          });
          successMsg = `Roster synced for **${ex.classroomName}** — ${
            result.synced ?? 0
          } student(s) updated${result.removed ? `, ${result.removed} removed` : ""}.`;
          break;
        }
        case "update_student_contact":
          await updateStudentContact({
            personId: user.id,
            classroomId: ex.classroomId,
            studentId: ex.studentId,
            updates: ex.updates,
          });
          successMsg = `Updated contact details for **${ex.studentName}**.`;
          break;
        case "schedule_whatsapp_message": {
          await scheduleWhatsAppMessage({
            personId: user.id,
            payload: ex.payload,
          });
          successMsg = `Scheduled a WhatsApp message to **${ex.groupName}** — ${ex.when}.`;
          break;
        }
        case "send_scheduled_message_now": {
          const result = await actOnScheduledWhatsApp(
            ex.scheduledMessageId,
            "send-now",
            { personId: user.id }
          );
          successMsg = result?.skipped
            ? `WhatsApp skipped this send (duplicate guard) for **${ex.groupName}**.`
            : `Message sent now to **${ex.groupName}**.`;
          break;
        }
        case "cancel_scheduled_message":
          await actOnScheduledWhatsApp(ex.scheduledMessageId, "cancel", {
            personId: user.id,
          });
          successMsg = `Cancelled the scheduled message to **${ex.groupName}**.`;
          break;
        case "delete_scheduled_message":
          await actOnScheduledWhatsApp(ex.scheduledMessageId, "delete", {
            personId: user.id,
          });
          successMsg = `Deleted the scheduled message to **${ex.groupName}**.`;
          break;
        case "get_automation_status": {
          const status = await loadAutomationStatus(user.id, ex.assignmentId);
          successMsg = formatAutomationStatus(status, ex.assignmentTitle);
          break;
        }
        case "continue_automation": {
          const result = await continueAutomation({
            personId: user.id,
            assignmentId: ex.assignmentId,
            remark: ex.remark,
          });
          successMsg =
            result.message ||
            `Automation resumed for **${ex.assignmentTitle}**. Track it in the Automation tab.`;
          break;
        }
        case "sync_coursework_from_google": {
          const result = await syncCourseworkFromGoogle({
            personId: user.id,
            courseId: ex.courseId,
            classroomId: ex.classroomId,
          });
          successMsg = `Imported Google Classroom assignments for **${ex.classroomName}** — ${
            result.synced ?? 0
          } synced${result.added ? `, ${result.added} new` : ""}${
            result.restored ? `, ${result.restored} restored` : ""
          }.`;
          break;
        }
        default:
          throw new Error("Unknown action type");
      }

      setMessages((prev) => [...prev, { role: "assistant", content: successMsg }]);
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

  const confirmLabel = actionProposal
    ? confirmLabelFor(actionProposal.type)
    : "Confirm";

  return (
    <div className="tch-page tch-page--wide tchat-page">
      <TeacherPageHeader
        eyebrow="AI Assistant"
        title="AI Agent"
        subtitle="Ask questions or instruct me to do anything in your manager account — delegations, reports, automation, and more."
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
                Natural language works for everything — assign assistants, send reports,
                run automation, push grades, and more. I always show a confirm step before
                executing.
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
            placeholder='Ask or instruct — e.g. "Assign Sara to mark Quiz 2 in Grade 10"'
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
