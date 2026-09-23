import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { TeacherPageHeader } from "./TeacherUI";
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
  FiCheckCircle,
  FiBarChart2,
  FiFileText,
  FiTrendingUp,
  FiUploadCloud,
  FiPaperclip,
  FiChevronDown,
  FiClock,
  FiLayers,
  FiShield,
  FiTrash2,
} from "react-icons/fi";
import { streamAgentTurn, revealText } from "../../utils/agentStream";
import { usePhoneSheetDismiss } from "./usePhoneSheetDismiss";
import { useVoiceCommand } from "../../utils/useVoiceCommand";
import {
  createCoursework,
  downloadGradesExcel,
  loadClassrooms,
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

const CAPABILITY_CARDS = [
  {
    key: "submissions",
    icon: <FiBarChart2 size={16} />,
    tone: "primary",
    label: "Check submissions",
    example: "Show me the submissions for the midterm in Class 9A",
  },
  {
    key: "parent_reports",
    icon: <FiFileText size={16} />,
    tone: "success",
    label: "Parent reports",
    example: "Send Omar's report for the last test in Class 9A",
  },
  {
    key: "class_insight",
    icon: <FiTrendingUp size={16} />,
    tone: "warn",
    label: "Class insight",
    example: "Which questions did the class struggle with most?",
  },
  {
    key: "grades_sync",
    icon: <FiUploadCloud size={16} />,
    tone: "accent",
    label: "Grades & sync",
    example: "Push the midterm grades to Google Classroom",
  },
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

const MAX_TEXTAREA_HEIGHT = 200;
const STORAGE_KEY = "sahahly-teacher-ai-agent";
const HISTORY_KEY = "sahahly-teacher-ai-agent-history";
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
  const [actionProposal, setActionProposal] = useState(null);
  const [editPreview, setEditPreview] = useState(null);
  const [executing, setExecuting] = useState(false);
  const [progressLabel, setProgressLabel] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySessions, setHistorySessions] = useState(() => loadHistorySessions());
  const [scope, setScope] = useState("All classes");
  const [scopeOpen, setScopeOpen] = useState(false);
  const dismissPhoneSheets = useCallback(() => {
    setHistoryOpen(false);
    setScopeOpen(false);
  }, []);
  usePhoneSheetDismiss(historyOpen || scopeOpen, dismissPhoneSheets);
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
    setPreviewModalOpen(false);
  };

  const openScopePicker = () => {
    setScopeOpen((prev) => !prev);
    if (scopeOpen || classroomOptions.length || classroomsLoading || !user?.id) return;
    setClassroomsLoading(true);
    loadClassrooms(user.id)
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.classrooms || [];
        const names = list.map((c) => c.name || c.className || c.title).filter(Boolean);
        setClassroomOptions(Array.from(new Set(names)));
      })
      .catch(() => setClassroomOptions([]))
      .finally(() => setClassroomsLoading(false));
  };

  const applyScope = useCallback(
    (text) => {
      if (scope === "All classes") return text;
      if (/^\[[^\]]+]\s/.test(text)) return text;
      return `[${scope}] ${text}`;
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
        "/teacher-chatbot/agent-stream",
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

  const confirmLabel = CONFIRM_LABELS[actionProposal?.type] || "Send";

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
              : 'Ask or instruct — e.g. "Send Sara\'s report for Quiz 2 in Grade 10"'
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
                <span className="dchat-scope-label">{scope}</span>
                <FiChevronDown size={13} />
              </button>
              {scopeOpen && (
                <>
                  <div className="dchat-panel-backdrop" onClick={() => setScopeOpen(false)} />
                  <div className="dchat-scope-menu" role="listbox" aria-label="Choose a scope">
                    <div className="dchat-sheet-head">
                      <p className="dchat-sheet-title">Choose a scope</p>
                      <button
                        type="button"
                        className="dchat-sheet-close"
                        aria-label="Close scope"
                        onClick={() => setScopeOpen(false)}
                      >
                        <FiX size={18} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className={`dchat-scope-option ${
                        scope === "All classes" ? "dchat-scope-option--active" : ""
                      }`}
                      onClick={() => {
                        setScope("All classes");
                        setScopeOpen(false);
                      }}
                    >
                      All classes
                    </button>
                    {classroomsLoading ? (
                      <div className="dchat-scope-loading">Loading classes…</div>
                    ) : (
                      classroomOptions.map((name) => (
                        <button
                          key={name}
                          type="button"
                          className={`dchat-scope-option ${
                            scope === name ? "dchat-scope-option--active" : ""
                          }`}
                          onClick={() => {
                            setScope(name);
                            setScopeOpen(false);
                          }}
                        >
                          {name}
                        </button>
                      ))
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
            : "Ask questions or tell me what to do — e.g. send a report, export grades, create an assignment."
        }
        breadcrumbs={conversationTitle ? [{ label: "AI Agent", to: "/teacher/ai-agent" }] : []}
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
                  <div className="dchat-history-panel" role="dialog" aria-label="Past conversations">
                    <button
                      type="button"
                      className="dchat-sheet-close"
                      aria-label="Close history"
                      onClick={() => setHistoryOpen(false)}
                    >
                      <FiX size={18} />
                    </button>
                    <div className="dchat-history-panel-title">Past conversations</div>
                    {historySessions.length === 0 ? (
                      <p className="dchat-history-empty">No past conversations yet. New chats on this device are kept here.</p>
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
            Sahahly Teacher Assistant
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
                Ask about your classes, or tell me to send a report, export grades,
                or create an assignment. You&apos;ll see a preview before anything is sent.
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
                <FiShield size={12} /> The agent always shows a preview and asks before
                sending messages or changing records.
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
                  {showPreviewEditor && editPreview?.items?.length > 0 && (
                    <>
                      <div className="tchat-select-bar">
                        <span className="tchat-action-card-hint">
                          {editPreview.items.length} recipient(s)
                        </span>
                        {editPreview.items.length > 3 && (
                          <button
                            type="button"
                            className="tchat-link-btn"
                            onClick={() => setPreviewModalOpen(true)}
                          >
                            Review full list
                          </button>
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
                                <span className="dchat-preview-row-status">Ready</span>
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
                            <label key={item.key} className="tchat-preview-item">
                              <span className="tchat-preview-name">
                                {item.name}
                                {item.error && (
                                  <span className="dchat-issue-tag">No number</span>
                                )}
                              </span>
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
                    </>
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
                    <div className="tchat-preview-list dchat-modal-list">
                      {editPreview.items.map((item) => (
                        <label key={item.key} className="tchat-preview-item">
                          <span className="tchat-preview-name">
                            {item.name}
                            {item.error && <span className="dchat-issue-tag">No number</span>}
                          </span>
                          <textarea
                            className="tchat-preview-textarea"
                            value={item.message}
                            rows={Math.min(
                              12,
                              Math.max(4, String(item.message || "").split("\n").length + 1)
                            )}
                            onChange={(e) => updatePreviewMessage(item.key, e.target.value)}
                          />
                        </label>
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
