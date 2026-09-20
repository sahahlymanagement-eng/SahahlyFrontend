import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../api/api";
import { toast } from "react-toastify";
import { TeacherPageHeader } from "../teacher/TeacherUI";
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
  FiAlertTriangle,
  FiCheckCircle,
} from "react-icons/fi";
import { streamAgentTurn, revealText } from "../../utils/agentStream";
import { useVoiceCommand } from "../../utils/useVoiceCommand";
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
  startBatchMarking,
  startPriorityMarking,
  verifyMarkScheme,
  generateAssignmentPrompt,
  cancelBatchJob,
  syncClassroom,
  syncCourseworkFromGoogle,
  syncStudentRoster,
  updateStudentContact,
  transcribeVoiceCommand,
} from "./managerChatbotActionsClient";
import { confirmToast } from "../../utils/confirmToast";
import "../teacher/teacher.css";
import "../teacher/TeacherChatbot.css";

const SUGGESTIONS = [
  "Give me today's briefing",
  "List students who submitted late and we haven't corrected, with their classes",
  "Schedule a WhatsApp message to the Parents group tomorrow at 6pm",
  "Show me the submissions for the Physics test in Grade 10A",
  "Show Omar's marked submission for the last Chemistry homework",
  "Assign Raghad to mark the Physics test in Grade 10A",
  "Which questions did Class 9B struggle with most?",
  "List the scheduled WhatsApp messages",
  "Which students are missing a parent phone number in Grade 10A?",
  "Batch-mark the last homework in Chemistry",
  "Priority-mark Omar's Physics test right now",
  "Verify the mark scheme for the Physics test before marking",
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
    case "start_batch_marking":
      return "Start batch marking";
    case "start_priority_marking":
      return "Start marking now";
    case "verify_mark_scheme":
      return "Verify mark scheme";
    case "generate_assignment_prompt":
      return "Generate prompt";
    case "cancel_batch_job":
      return "Cancel job";
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

const DANGER_ACTION_TYPES = new Set([
  "cancel_batch_job",
  "remove_assistant",
  "remove_classroom_manager",
  "remove_quality_manager",
  "delete_subject",
  "delete_scheduled_message",
  "cancel_scheduled_message",
]);

const BROADCAST_ACTION_TYPES = new Set([
  "send_assignment_report",
  "send_monthly_report",
  "send_teacher_collective_report",
  "send_executive_report",
  "schedule_whatsapp_message",
  "send_scheduled_message_now",
]);

function actionCardMeta(type) {
  if (DANGER_ACTION_TYPES.has(type)) {
    return { tone: "danger", Icon: FiAlertTriangle };
  }
  if (BROADCAST_ACTION_TYPES.has(type)) {
    return { tone: "broadcast", Icon: FiSend };
  }
  return { tone: "primary", Icon: FiCheckCircle };
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
        "/manager-chatbot/agent-stream",
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
        case "start_batch_marking": {
          const result = await startBatchMarking({
            personId: user.id,
            assignmentId: ex.assignmentId,
            students: ex.students,
            markingMode: ex.markingMode,
          });
          successMsg = `Batch job **${result.jobId}** submitted for **${ex.assignmentTitle}** (${result.queuedCount} submission(s)). It finishes in the background — check the Grading page for progress.`;
          break;
        }
        case "start_priority_marking": {
          const result = await startPriorityMarking({
            personId: user.id,
            assignmentId: ex.assignmentId,
            students: ex.students,
            markingMode: ex.markingMode,
          });
          const saved = result?.savedCount ?? 0;
          const failed = result?.failedCount ?? 0;
          successMsg = `Marked **${saved}** submission(s) now for **${ex.assignmentTitle}**${
            failed ? `, ${failed} failed` : ""
          }.`;
          break;
        }
        case "verify_mark_scheme": {
          const result = await verifyMarkScheme({
            personId: user.id,
            assignmentId: ex.assignmentId,
          });
          successMsg = `Mark scheme verification for **${ex.assignmentTitle}**: ${
            result.verdict || result.status || "done"
          }${result.summary ? ` — ${result.summary}` : ""}`;
          break;
        }
        case "generate_assignment_prompt": {
          await generateAssignmentPrompt({
            personId: user.id,
            assignmentId: ex.assignmentId,
          });
          successMsg = `Marking prompt generated for **${ex.assignmentTitle}**.`;
          break;
        }
        case "cancel_batch_job": {
          await cancelBatchJob({
            personId: user.id,
            assignmentId: ex.assignmentId,
            jobId: ex.jobId,
          });
          successMsg = `Batch job **${ex.jobId}** cancelled for **${ex.assignmentTitle}**.`;
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
                executing. Click the <FiMic size={12} /> mic to speak a command instead of typing.
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
                : 'Ask or instruct — e.g. "Assign Sara to mark Quiz 2 in Grade 10"'
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
