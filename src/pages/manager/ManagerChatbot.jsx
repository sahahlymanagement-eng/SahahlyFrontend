import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { TeacherPageHeader } from "../teacher/TeacherUI";
import {
  FiSend,
  FiPlus,
  FiCpu,
  FiUser,
  FiMic,
  FiSquare,
  FiCopy,
  FiRefreshCw,
  FiEdit2,
  FiCheck,
  FiX,
  FiAlertTriangle,
  FiCheckCircle,
  FiFileText,
  FiTrendingUp,
  FiRadio,
  FiPaperclip,
  FiChevronDown,
  FiChevronRight,
  FiChevronLeft,
  FiClock,
  FiLayers,
  FiShield,
  FiTrash2,
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
  loadClassrooms,
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
  startIndexingMarking,
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

const CAPABILITY_CARDS = [
  {
    key: "batch_marking",
    icon: <FiLayers size={16} />,
    tone: "primary",
    label: "Batch mark assignment",
    example: "Batch-mark the last homework in Chemistry",
  },
  {
    key: "parent_reports",
    icon: <FiFileText size={16} />,
    tone: "success",
    label: "Parent reports",
    example: "Which students are missing a parent phone number in Grade 10A?",
  },
  {
    key: "students_needing_help",
    icon: <FiTrendingUp size={16} />,
    tone: "warn",
    label: "Class insight",
    example: "Which questions did Class 9B struggle with most?",
  },
  {
    key: "whatsapp",
    icon: <FiRadio size={16} />,
    tone: "accent",
    label: "WhatsApp scheduling",
    example: "Schedule a WhatsApp message to the Parents group tomorrow at 6pm",
  },
];

const MAX_TEXTAREA_HEIGHT = 200;
const STORAGE_KEY = "sahahly-manager-ai-agent";
const HISTORY_KEY = "sahahly-manager-ai-agent-history";
const MAX_HISTORY_SESSIONS = 20;
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
];

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function sessionTitleFromMessages(messages) {
  const firstUser = messages.find((m) => m.role === "user" && m.content?.trim());
  if (!firstUser) return "New conversation";
  const text = firstUser.content.trim();
  return text.length > 60 ? `${text.slice(0, 57)}…` : text;
}

function loadHistorySessions() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistorySessions(sessions) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(sessions.slice(0, MAX_HISTORY_SESSIONS)));
  } catch {
    /* ignore */
  }
}

function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMin = Math.round((Date.now() - then) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

const DEFAULT_SCOPE = { label: "All classes", teacherName: null, className: null };

function scopeLabel(teacherName, className) {
  if (className) return teacherName ? `${teacherName} — ${className}` : className;
  if (teacherName) return `${teacherName} — All classes`;
  return "All classes";
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
    case "start_indexing_marking":
      return "Start indexing marking";
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
  const [actionProposal, setActionProposal] = useState(null);
  const [editPreview, setEditPreview] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState(() => new Set());
  const [executing, setExecuting] = useState(false);
  const [progressLabel, setProgressLabel] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySessions, setHistorySessions] = useState(() => loadHistorySessions());
  const [scope, setScope] = useState(DEFAULT_SCOPE);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [expandedTeacherId, setExpandedTeacherId] = useState(null);
  const [classroomOptions, setClassroomOptions] = useState([]);
  const [classroomsLoading, setClassroomsLoading] = useState(false);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [attachError, setAttachError] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const revealStopRef = useRef(null);
  const fileInputRef = useRef(null);

  const voice = useVoiceCommand(transcribeVoiceCommand, (text) => send(text));

  const autoGrow = useCallback((el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, []);

  useEffect(() => {
    autoGrow(inputRef.current);
  }, [input, autoGrow]);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) {
      const parsed = JSON.parse(stored);
      setUser(parsed);
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
    setSelectedKeys(new Set());
    setPreviewModalOpen(false);
  };

  const openScopePicker = () => {
    setScopeOpen((prev) => !prev);
    if (scopeOpen || classroomOptions.length || classroomsLoading || !user?.id) return;
    setClassroomsLoading(true);
    loadClassrooms(user.id)
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.classrooms || [];
        setClassroomOptions(list);
      })
      .catch(() => setClassroomOptions([]))
      .finally(() => setClassroomsLoading(false));
  };

  const closeScopeMenu = () => {
    setScopeOpen(false);
    setExpandedTeacherId(null);
  };

  const selectScope = (teacherName, className) => {
    setScope({
      label: scopeLabel(teacherName, className),
      teacherName: teacherName || null,
      className: className || null,
    });
    closeScopeMenu();
  };

  const teacherGroups = useMemo(() => {
    const map = new Map();
    for (const c of classroomOptions) {
      const key = c.teacherId || `__unassigned`;
      if (!map.has(key)) {
        map.set(key, { key, teacherName: c.teacherName || "Unassigned", classrooms: [] });
      }
      map.get(key).classrooms.push(c);
    }
    return Array.from(map.values()).sort((a, b) => a.teacherName.localeCompare(b.teacherName));
  }, [classroomOptions]);

  const expandedTeacher = teacherGroups.find((g) => g.key === expandedTeacherId) || null;

  const applyScope = useCallback(
    (text) => {
      if (!scope.teacherName && !scope.className) return text;
      if (/^\[[^\]]+]\s/.test(text)) return text;
      return `[${scope.label}] ${text}`;
    },
    [scope]
  );

  const fillComposer = (example) => {
    setInput(example);
    inputRef.current?.focus();
  };

  const openFilePicker = () => {
    if (loading || executing) return;
    setAttachError(null);
    fileInputRef.current?.click();
  };

  const clearAttachment = () => {
    setAttachment(null);
    setAttachError(null);
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!ALLOWED_ATTACHMENT_TYPES.includes(file.type)) {
      setAttachError("Only images (PNG/JPEG/WEBP/GIF) and PDFs can be attached.");
      return;
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      setAttachError(`That file is ${formatBytes(file.size)} — the limit is 10 MB.`);
      return;
    }
    setAttachError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.slice(result.indexOf(",") + 1);
      setAttachment({ name: file.name, mimeType: file.type, size: file.size, base64 });
    };
    reader.onerror = () => setAttachError("Couldn't read that file — please try again.");
    reader.readAsDataURL(file);
  };

  const toggleSelectedKey = (key) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllPreviewKeys = () => {
    if (!editPreview?.items?.length) return;
    setSelectedKeys(new Set(editPreview.items.map((item) => item.key)));
  };

  const clearAllPreviewKeys = () => setSelectedKeys(new Set());

  const loadPreviewsForProposal = useCallback(async (proposal) => {
    if (!proposal) return;

    const markingTypes = [
      "start_batch_marking",
      "start_priority_marking",
      "start_indexing_marking",
    ];
    if (markingTypes.includes(proposal.type)) {
      const students = proposal.execute?.students || [];
      const items = students.map((s) => ({
        key: String(s.submissionId),
        name: s.studentName || `Submission ${s.submissionId}`,
        submissionId: s.submissionId,
        studentId: s.studentId,
        selected: s.selected !== false,
        kind: "student",
      }));
      setEditPreview({ loading: false, items, kind: "marking" });
      setSelectedKeys(
        new Set(items.filter((i) => i.selected !== false).map((i) => i.key))
      );
      return;
    }

    if (proposal.type === "send_assignment_report") {
      setEditPreview({ loading: true, items: [] });
      try {
        const reports = proposal.execute.reports || [];
        const previews = await previewAssignmentReport(
          proposal.execute.classroomId,
          reports
        );
        const selectedById = new Map(
          reports.map((r) => [String(r.studentId || ""), r.selected !== false])
        );
        const items = previews.map((p) => {
          const key = previewKey(p);
          return {
            key,
            studentId: p.studentId,
            name: p.name,
            message: p.message || p.error || "(No message)",
            error: p.error,
            selected: selectedById.has(String(p.studentId || ""))
              ? selectedById.get(String(p.studentId || ""))
              : true,
            kind: "report",
          };
        });
        setEditPreview({ loading: false, items, kind: "report" });
        setSelectedKeys(
          new Set(items.filter((i) => i.selected !== false).map((i) => i.key))
        );
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
        studentId: p.studentId,
        name: p.studentName,
        message: p.whatsappMessage || "",
        selected: p.selected !== false,
        kind: "report",
      }));
      setEditPreview({ loading: false, items, kind: "report" });
      setSelectedKeys(
        new Set(items.filter((i) => i.selected !== false).map((i) => i.key))
      );
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
    async (nextMessages, attachmentPayload) => {
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
          ...(attachmentPayload ? { attachment: attachmentPayload } : {}),
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
      const raw = String(text ?? input).trim();
      if ((!raw && !attachment) || loading || !user?.id) return;
      const content = raw ? applyScope(raw) : `Sent ${attachment.name}`;
      const attachmentMeta = attachment
        ? { name: attachment.name, mimeType: attachment.mimeType, size: attachment.size }
        : null;
      const attachmentPayload = attachment
        ? { mimeType: attachment.mimeType, dataBase64: attachment.base64, name: attachment.name }
        : null;
      const nextMessages = [
        ...messages,
        { role: "user", content, ...(attachmentMeta ? { attachment: attachmentMeta } : {}) },
      ];
      setMessages(nextMessages);
      setInput("");
      setAttachment(null);
      runTurn(nextMessages, attachmentPayload);
    },
    [input, loading, messages, user?.id, runTurn, applyScope, attachment]
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
      if (selectedKeys.size && !selectedKeys.has(item.key)) continue;
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

      const selectedReportItems = () =>
        (editPreview?.items || []).filter((item) => selectedKeys.has(item.key));

      const selectedMarkingStudents = () => {
        const fromPreview = (editPreview?.items || [])
          .filter((item) => selectedKeys.has(item.key))
          .map((item) => ({
            submissionId: item.submissionId,
            studentId: item.studentId,
            studentName: item.name,
          }));
        if (fromPreview.length) return fromPreview;
        return (ex.students || []).filter(
          (s) => selectedKeys.has(String(s.submissionId)) || s.selected !== false
        );
      };

      switch (actionProposal.type) {
        case "send_assignment_report": {
          const chosen = selectedReportItems();
          if (!chosen.length) {
            throw new Error("Select at least one student before sending.");
          }
          const reportById = new Map(
            (ex.reports || []).map((r) => [String(r.studentId || ""), r])
          );
          const reports = chosen
            .map((item) => reportById.get(String(item.studentId || item.key)))
            .filter(Boolean);
          if (!reports.length) {
            throw new Error("No matching report payloads for the selected students.");
          }
          const overrides = buildMessageOverrides();
          let result = await sendAssignmentReport(ex.classroomId, reports, overrides);
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
              result = await sendAssignmentReport(ex.classroomId, reports, overrides, {
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
          const chosen = selectedReportItems();
          const studentIds = chosen.length
            ? chosen.map((item) => String(item.studentId || item.key))
            : (ex.studentIds || []).filter((id) => selectedKeys.has(String(id)));
          if (!studentIds.length) {
            throw new Error("Select at least one student before sending.");
          }
          const overrides = buildMessageOverrides();
          const result = await sendMonthly({
            personId: user.id,
            classroomId: ex.classroomId,
            year: ex.year,
            month: ex.month,
            studentIds,
            messageOverrides: overrides,
          });
          const sent = result.sent ?? result.successCount ?? studentIds.length;
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
          const students = selectedMarkingStudents();
          if (!students.length) throw new Error("Select at least one student to mark.");
          const result = await startBatchMarking({
            personId: user.id,
            assignmentId: ex.assignmentId,
            students,
            markingMode: ex.markingMode,
          });
          successMsg = `Batch job **${result.jobId}** submitted for **${ex.assignmentTitle}** (${result.queuedCount} submission(s)). It finishes in the background — check the Grading page for progress.`;
          break;
        }
        case "start_priority_marking": {
          const students = selectedMarkingStudents();
          if (!students.length) throw new Error("Select at least one student to mark.");
          const result = await startPriorityMarking({
            personId: user.id,
            assignmentId: ex.assignmentId,
            students,
            markingMode: ex.markingMode,
          });
          const saved = result?.savedCount ?? 0;
          const failed = result?.failedCount ?? 0;
          successMsg = `Marked **${saved}** submission(s) now for **${ex.assignmentTitle}**${
            failed ? `, ${failed} failed` : ""
          }.`;
          break;
        }
        case "start_indexing_marking": {
          const students = selectedMarkingStudents();
          if (!students.length) throw new Error("Select at least one student to mark with indexing.");
          const result = await startIndexingMarking({
            personId: user.id,
            assignmentId: ex.assignmentId,
            examId: ex.examId,
            mode: ex.mode || "instant",
            students,
          });
          successMsg = `Indexing **${ex.mode || "instant"}** run **${result.runId}** started for **${ex.assignmentTitle}** (${result.paperCount} paper(s)). Track it in the Submission Viewer indexing runs.`;
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

  const archiveCurrentSession = () => {
    if (!messages.length) return;
    const session = {
      id: activeSessionId || `s_${Date.now()}`,
      title: sessionTitleFromMessages(messages),
      messages,
      updatedAt: new Date().toISOString(),
    };
    setHistorySessions((prev) => {
      const next = [session, ...prev.filter((s) => s.id !== session.id)];
      saveHistorySessions(next);
      return next;
    });
  };

  const newChat = () => {
    revealStopRef.current?.();
    archiveCurrentSession();
    setMessages([]);
    setActiveSessionId(null);
    setLastMatched(null);
    setEditingIndex(null);
    clearActionState();
    sessionStorage.removeItem(STORAGE_KEY);
    setHistoryOpen(false);
    inputRef.current?.focus();
  };

  const restoreSession = (session) => {
    revealStopRef.current?.();
    clearActionState();
    setMessages(session.messages);
    setActiveSessionId(session.id);
    setLastMatched(null);
    setEditingIndex(null);
    setHistoryOpen(false);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session.messages.slice(-40)));
    } catch {
      /* ignore */
    }
  };

  const deleteSession = (id, e) => {
    e.stopPropagation();
    setHistorySessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      saveHistorySessions(next);
      return next;
    });
  };

  useEffect(() => () => revealStopRef.current?.(), []);

  const conversationTitle = useMemo(
    () => (messages.length > 0 ? sessionTitleFromMessages(messages) : null),
    [messages]
  );

  const matchedChips = [
    ...(lastMatched?.classrooms || []).map((n) => ({ type: "class", name: n })),
    ...(lastMatched?.students || []).map((n) => ({ type: "student", name: n })),
  ];

  const showPreviewEditor =
    actionProposal &&
    (actionProposal.type === "send_assignment_report" ||
      actionProposal.type === "send_monthly_report");

  const showStudentPicker =
    actionProposal &&
    (showPreviewEditor ||
      actionProposal.type === "start_batch_marking" ||
      actionProposal.type === "start_priority_marking" ||
      actionProposal.type === "start_indexing_marking");

  const selectedCount = selectedKeys.size;

  const confirmLabel = actionProposal
    ? confirmLabelFor(actionProposal.type)
    : "Confirm";

  const confirmDisabled =
    executing ||
    editPreview?.loading ||
    (showStudentPicker && selectedCount === 0);

  const renderComposer = (variant) => (
    <div className={`dchat-composer dchat-composer--${variant}`}>
      {voice.micError && <div className="tchat-mic-error">{voice.micError}</div>}
      <form
        className="tchat-inputbar dchat-inputbar"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_ATTACHMENT_TYPES.join(",")}
          onChange={handleFileChange}
          style={{ display: "none" }}
        />
        {attachment && (
          <div className="dchat-attachment-chip">
            <FiPaperclip size={12} />
            <span className="dchat-attachment-name">{attachment.name}</span>
            <span className="dchat-attachment-size">{formatBytes(attachment.size)}</span>
            <button
              type="button"
              className="dchat-attachment-remove"
              onClick={clearAttachment}
              aria-label="Remove attachment"
              title="Remove attachment"
            >
              <FiX size={12} />
            </button>
          </div>
        )}
        {attachError && <div className="dchat-attachment-error">{attachError}</div>}
        <textarea
          ref={inputRef}
          className="tchat-input dchat-textarea"
          placeholder={
            voice.recording
              ? "Listening… click the mic to stop"
              : voice.transcribing
              ? "Transcribing your voice command…"
              : 'Ask or instruct — e.g. "Assign Raghad to mark Quiz 2 in Grade 10"'
          }
          value={input}
          rows={variant === "hero" ? 2 : 1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={loading || executing || voice.recording || voice.transcribing}
          aria-label="Message the AI Agent"
        />
        <div className="dchat-composer-toolbar">
          <div className="dchat-composer-toolbar-left">
            <button
              type="button"
              className={`dchat-icon-btn ${attachment ? "dchat-icon-btn--active" : ""}`}
              onClick={openFilePicker}
              disabled={loading || executing}
              title="Attach an image or PDF"
              aria-label="Attach a file"
            >
              <FiPaperclip size={15} />
            </button>
            <div className="dchat-scope-wrap">
              <button
                type="button"
                className="dchat-scope-btn"
                onClick={openScopePicker}
                aria-haspopup="listbox"
                aria-expanded={scopeOpen}
              >
                <FiLayers size={13} />
                <span className="dchat-scope-label">{scope.label}</span>
                <FiChevronDown size={13} />
              </button>
              {scopeOpen && (
                <>
                  <div className="dchat-panel-backdrop" onClick={closeScopeMenu} />
                  <div className="dchat-scope-menu" role="listbox">
                    {expandedTeacher ? (
                      <>
                        <button
                          type="button"
                          className="dchat-scope-back"
                          onClick={() => setExpandedTeacherId(null)}
                        >
                          <FiChevronLeft size={13} /> Back
                        </button>
                        <div className="dchat-scope-menu-title">{expandedTeacher.teacherName}</div>
                        <button
                          type="button"
                          className={`dchat-scope-option ${
                            scope.teacherName === expandedTeacher.teacherName && !scope.className
                              ? "dchat-scope-option--active"
                              : ""
                          }`}
                          onClick={() => selectScope(expandedTeacher.teacherName, null)}
                        >
                          All classes
                        </button>
                        {expandedTeacher.classrooms.map((c) => (
                          <button
                            key={c._id}
                            type="button"
                            className={`dchat-scope-option ${
                              scope.teacherName === expandedTeacher.teacherName &&
                              scope.className === c.name
                                ? "dchat-scope-option--active"
                                : ""
                            }`}
                            onClick={() => selectScope(expandedTeacher.teacherName, c.name)}
                          >
                            {c.name}
                          </button>
                        ))}
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className={`dchat-scope-option ${
                            !scope.teacherName && !scope.className
                              ? "dchat-scope-option--active"
                              : ""
                          }`}
                          onClick={() => selectScope(null, null)}
                        >
                          All classes
                        </button>
                        {classroomsLoading ? (
                          <div className="dchat-scope-loading">Loading teachers…</div>
                        ) : teacherGroups.length === 0 ? (
                          <div className="dchat-scope-loading">No classrooms found</div>
                        ) : (
                          teacherGroups.map((g) => (
                            <button
                              key={g.key}
                              type="button"
                              className="dchat-scope-option dchat-scope-option--drill"
                              onClick={() => setExpandedTeacherId(g.key)}
                            >
                              <span>{g.teacherName}</span>
                              <FiChevronRight size={13} />
                            </button>
                          ))
                        )}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="dchat-composer-toolbar-right">
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
            <button
              type="submit"
              className="tchat-send"
              disabled={loading || executing || (!input.trim() && !attachment)}
              aria-label="Send message"
            >
              <FiSend size={16} />
            </button>
          </div>
        </div>
        <div className="tchat-hint">
          Enter to send · Shift+Enter for a new line · 🎤 to speak a command
        </div>
      </form>
    </div>
  );

  return (
    <div className="tch-page tch-page--wide tchat-page dchat-page">
      <TeacherPageHeader
        eyebrow={conversationTitle ? "AI Agent" : "AI Assistant"}
        title={conversationTitle || "AI Agent"}
        subtitle={
          conversationTitle
            ? undefined
            : "Ask questions or instruct me to do anything in your manager account — delegations, reports, automation, and more."
        }
        breadcrumbs={conversationTitle ? [{ label: "AI Agent", to: "/manager/ai-agent" }] : []}
        actions={
          <div className="dchat-header-actions">
            <div className="dchat-history-wrap">
              <button
                type="button"
                className="tch-btn tch-btn--ghost"
                onClick={() => setHistoryOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={historyOpen}
              >
                <FiClock size={15} /> History
              </button>
              {historyOpen && (
                <>
                  <div className="dchat-panel-backdrop" onClick={() => setHistoryOpen(false)} />
                  <div className="dchat-history-panel">
                    <div className="dchat-history-panel-title">Past conversations</div>
                    {historySessions.length === 0 ? (
                      <p className="dchat-history-empty">No past conversations yet.</p>
                    ) : (
                      <ul className="dchat-history-list">
                        {historySessions.map((s) => (
                          <li key={s.id} className="dchat-history-list-item">
                            <button
                              type="button"
                              className="dchat-history-item"
                              onClick={() => restoreSession(s)}
                            >
                              <span className="dchat-history-item-title">{s.title}</span>
                              <span className="dchat-history-item-time">
                                {relativeTime(s.updatedAt)}
                              </span>
                            </button>
                            <button
                              type="button"
                              className="dchat-history-delete"
                              onClick={(e) => deleteSession(s.id, e)}
                              aria-label="Delete conversation"
                              title="Delete conversation"
                            >
                              <FiTrash2 size={13} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
            <button type="button" className="tch-btn tch-btn--ghost" onClick={newChat}>
              <FiPlus size={15} /> New chat
            </button>
          </div>
        }
      />

      <div className="tchat-shell">
        <div className="tchat-shell-header">
          <div className="tchat-shell-header-left">
            <span className="tchat-shell-dot" />
            Sahahly Manager Assistant
          </div>
          <span className="tchat-shell-badge">AI Agent</span>
        </div>
        <div
          className={`tchat-scroll ${messages.length === 0 ? "tchat-scroll--start" : ""}`}
          ref={scrollRef}
        >
          {messages.length === 0 ? (
            <div className="tchat-empty">
              <div className="tchat-empty-header">
                <div className="tchat-empty-icon">
                  <FiCpu size={18} />
                </div>
                <h3>What should we get done today?</h3>
              </div>
              <p>
                Natural language works for everything — assign assistants, send reports,
                run automation, push grades, and more. You'll see a plan before anything
                is sent or changed.
              </p>
              {renderComposer("hero")}

              <div className="dchat-section-label">Try asking</div>
              <div className="dchat-capability-grid">
                {CAPABILITY_CARDS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    className="dchat-capability-card"
                    onClick={() => fillComposer(c.example)}
                  >
                    <span className={`dchat-capability-icon dchat-capability-icon--${c.tone}`}>
                      {c.icon}
                    </span>
                    <span className="dchat-capability-text">
                      <span className="dchat-capability-label">{c.label}</span>
                      <span className="dchat-capability-example">“{c.example}”</span>
                    </span>
                  </button>
                ))}
              </div>

              <p className="dchat-trust-line">
                <FiShield size={12} /> The agent always shows a plan and asks before sending
                messages or changing accounts.
              </p>
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
                          {m.attachment && (
                            <div className="dchat-bubble-attachment">
                              <FiPaperclip size={12} />
                              {m.attachment.name}
                            </div>
                          )}
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
                              aria-label="Copy message"
                            >
                              {copiedIndex === i ? <FiCheck size={12} /> : <FiCopy size={12} />}
                              <span className="dchat-msg-action-label">
                                {copiedIndex === i ? "Copied" : "Copy"}
                              </span>
                            </button>
                          ) : null}
                          {m.role === "user" && !loading ? (
                            <button
                              type="button"
                              className="tchat-msg-action"
                              onClick={() => startEdit(i)}
                              title="Edit & resend"
                              aria-label="Edit and resend message"
                            >
                              <FiEdit2 size={12} />
                              <span className="dchat-msg-action-label">Edit</span>
                            </button>
                          ) : null}
                          {isLastAssistant ? (
                            <button
                              type="button"
                              className="tchat-msg-action"
                              onClick={retryLast}
                              title="Retry"
                              aria-label="Retry last request"
                            >
                              <FiRefreshCw size={12} />
                              <span className="dchat-msg-action-label">Retry</span>
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
                  {showStudentPicker && editPreview?.items?.length > 0 && (
                    <>
                      <div className="tchat-select-bar">
                        <span className="tchat-action-card-hint">
                          {selectedCount} of {editPreview.items.length} selected
                        </span>
                        {editPreview.items.length > 3 ? (
                          <button
                            type="button"
                            className="tchat-link-btn"
                            onClick={() => setPreviewModalOpen(true)}
                          >
                            Review full list
                          </button>
                        ) : (
                          <div className="tchat-select-bar-actions">
                            <button
                              type="button"
                              className="tchat-link-btn"
                              onClick={selectAllPreviewKeys}
                              disabled={executing}
                            >
                              Select all
                            </button>
                            <button
                              type="button"
                              className="tchat-link-btn"
                              onClick={clearAllPreviewKeys}
                              disabled={executing}
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>

                      {editPreview.items.length > 3 ? (
                        <div className="dchat-preview-compact">
                          {editPreview.items.slice(0, 3).map((item) => (
                            <div key={item.key} className="dchat-preview-row">
                              <span className="dchat-preview-avatar">
                                {(item.name || "?").slice(0, 1).toUpperCase()}
                              </span>
                              <span className="dchat-preview-row-name">{item.name}</span>
                              {item.error ? (
                                <span className="dchat-issue-tag">No number</span>
                              ) : (
                                <span className="dchat-preview-row-status">
                                  {item.kind === "report" ? "WhatsApp" : "Selected"}
                                </span>
                              )}
                            </div>
                          ))}
                          <button
                            type="button"
                            className="dchat-preview-more"
                            onClick={() => setPreviewModalOpen(true)}
                          >
                            + {editPreview.items.length - 3} more
                          </button>
                        </div>
                      ) : (
                        <div className="tchat-preview-list">
                          {editPreview.items.map((item) => (
                            <div key={item.key} className="tchat-preview-item">
                              <label className="tchat-student-check">
                                <input
                                  type="checkbox"
                                  checked={selectedKeys.has(item.key)}
                                  onChange={() => toggleSelectedKey(item.key)}
                                  disabled={executing}
                                />
                                <span className="tchat-preview-name">{item.name}</span>
                                {item.error && (
                                  <span className="dchat-issue-tag">No number</span>
                                )}
                              </label>
                              {showPreviewEditor && (
                                <textarea
                                  className="tchat-preview-textarea"
                                  value={item.message}
                                  rows={Math.min(
                                    12,
                                    Math.max(
                                      4,
                                      String(item.message || "").split("\n").length + 1
                                    )
                                  )}
                                  onChange={(e) =>
                                    updatePreviewMessage(item.key, e.target.value)
                                  }
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {!showStudentPicker && (
                    <p className="tchat-action-card-hint">
                      Review and confirm to proceed.
                    </p>
                  )}
                  <div className="tchat-preview-actions">
                    <button
                      type="button"
                      className="tch-btn tch-btn--primary"
                      onClick={confirmAction}
                      disabled={confirmDisabled}
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

              {previewModalOpen && editPreview?.items?.length > 0 && (
                <div
                  className="dchat-modal-overlay"
                  onClick={() => setPreviewModalOpen(false)}
                >
                  <div
                    className="dchat-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="dchat-preview-title"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="dchat-modal-header">
                      <h4 id="dchat-preview-title">Review recipients</h4>
                      <button
                        type="button"
                        className="dchat-modal-close"
                        onClick={() => setPreviewModalOpen(false)}
                        aria-label="Close recipient review"
                      >
                        <FiX size={16} />
                      </button>
                    </div>
                    <div className="tchat-select-bar">
                      <span className="tchat-action-card-hint">
                        {selectedCount} of {editPreview.items.length} selected
                      </span>
                      <div className="tchat-select-bar-actions">
                        <button
                          type="button"
                          className="tchat-link-btn"
                          onClick={selectAllPreviewKeys}
                          disabled={executing}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className="tchat-link-btn"
                          onClick={clearAllPreviewKeys}
                          disabled={executing}
                        >
                          Clear
                        </button>
                      </div>
                    </div>
                    <div className="tchat-preview-list dchat-modal-list">
                      {editPreview.items.map((item) => (
                        <div key={item.key} className="tchat-preview-item">
                          <label className="tchat-student-check">
                            <input
                              type="checkbox"
                              checked={selectedKeys.has(item.key)}
                              onChange={() => toggleSelectedKey(item.key)}
                              disabled={executing}
                            />
                            <span className="tchat-preview-name">{item.name}</span>
                            {item.error && <span className="dchat-issue-tag">No number</span>}
                          </label>
                          {showPreviewEditor && (
                            <textarea
                              className="tchat-preview-textarea"
                              value={item.message}
                              rows={Math.min(
                                12,
                                Math.max(4, String(item.message || "").split("\n").length + 1)
                              )}
                              onChange={(e) => updatePreviewMessage(item.key, e.target.value)}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="dchat-modal-footer">
                      <button
                        type="button"
                        className="tch-btn tch-btn--primary tch-btn--sm"
                        onClick={() => setPreviewModalOpen(false)}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {messages.length > 0 && renderComposer("docked")}
      </div>
    </div>
  );
}
