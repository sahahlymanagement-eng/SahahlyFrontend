import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { TeacherPageHeader } from "../teacher/TeacherUI";
import { FiSend, FiPlus, FiCpu, FiUser } from "react-icons/fi";
import {
  DIRECTOR_ACTION_MENU,
  formatNumberedList,
  loadAssistantMetrics,
  loadAssignments,
  loadClassrooms,
  loadSentHistory,
  loadStudents,
  parseChoice,
  parseYesNo,
  prepareAssignmentReport,
  previewAssignmentReport,
  previewMonthly,
  sendAssignmentReport,
  sendMonthly,
} from "./directorChatbotActionsClient";
import { confirmToast } from "../../utils/confirmToast";
import "../teacher/teacher.css";
import "../teacher/TeacherChatbot.css";

const STEPS = {
  MENU: "menu",
  AR_CLASS: "ar_class",
  AR_ASG: "ar_asg",
  AR_CONFIRM: "ar_confirm",
  MR_CLASS: "mr_class",
  MR_CONFIRM: "mr_confirm",
  WL_CONFIRM: "wl_confirm",
  SH_CLASS: "sh_class",
  SH_SHOW: "sh_show",
};

function renderMarkdown(text) {
  const escaped = String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.split("\n").map((line, i) => {
    if (!line.trim()) return <div key={i} className="tchat-md-gap" />;
    return <p key={i}>{line}</p>;
  });
}

function botMsg(content, extra = {}) {
  return { role: "assistant", content, at: Date.now(), ...extra };
}

function userMsg(content) {
  return { role: "user", content, at: Date.now() };
}

const MENU_OPTIONS = ["1", "2", "3", "13"];

const MENU_GREETING = `${DIRECTOR_ACTION_MENU}\n\nTip: For delegations, automation, collective reports, and more — use the **AI Agent** tab for natural language.`;

function readStoredUser() {
  try {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export default function DirectorActionsChatbot() {
  const [user] = useState(readStoredUser);
  const [messages, setMessages] = useState(() => [
    botMsg(MENU_GREETING, { options: MENU_OPTIONS }),
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionOptions, setActionOptions] = useState(MENU_OPTIONS);
  const [editPreview, setEditPreview] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const sessionRef = useRef({ step: STEPS.MENU });

  const pushBot = useCallback((content, extra = {}) => {
    setMessages((prev) => [...prev, botMsg(content, extra)]);
    if (extra.options) setActionOptions(extra.options);
    else if (extra.clearOptions) setActionOptions([]);
  }, []);

  const resetToMenu = useCallback(() => {
    sessionRef.current = { step: STEPS.MENU };
    setEditPreview(null);
    pushBot(MENU_GREETING, { options: MENU_OPTIONS });
  }, [pushBot]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading, editPreview]);

  const handleUserInput = async (raw) => {
    const text = String(raw ?? input).trim();
    if (!text || loading || !user?.id) return;

    setMessages((prev) => [...prev, userMsg(text)]);
    setInput("");
    setLoading(true);

    const s = sessionRef.current;

    try {
      if (text.toLowerCase() === "menu" || text === "0") {
        resetToMenu();
        return;
      }

      if (s.step === STEPS.MENU) {
        const choice = parseChoice(text, 13);
        if (!choice) {
          pushBot("Reply with a number from the menu (1–13), or type **menu**.");
          return;
        }
        if (choice === 1) {
          s.step = STEPS.AR_CLASS;
          const classrooms = await loadClassrooms(user.id);
          s.classrooms = classrooms;
          pushBot(
            `Choose a classroom:\n\n${formatNumberedList(classrooms, (c) => c.name)}\n\nReply with the number.`
          );
          return;
        }
        if (choice === 2) {
          s.step = STEPS.MR_CLASS;
          const classrooms = await loadClassrooms(user.id);
          s.classrooms = classrooms;
          pushBot(
            `Choose a classroom for monthly report:\n\n${formatNumberedList(classrooms, (c) => c.name)}`
          );
          return;
        }
        if (choice === 3) {
          s.step = STEPS.WL_CONFIRM;
          const metrics = await loadAssistantMetrics(user.id);
          const lines = (metrics.assistants || []).slice(0, 10).map(
            (a) =>
              `• **${a.name}** — ${a.assignmentCount} assignment(s)` +
              (a.summary?.missedDeadline
                ? `, **${a.summary.missedDeadline}** missed deadline`
                : "")
          );
          pushBot(
            `**Assistant workload** (${metrics.assistantCount || 0} assistants, ${metrics.unassignedAssignments || 0} unassigned)\n\n` +
              (lines.length ? lines.join("\n") : "No assistant delegations found.") +
              `\n\nType **menu** to go back.`,
            { clearOptions: true }
          );
          s.step = STEPS.MENU;
          return;
        }
        if (choice >= 4 && choice <= 12) {
          pushBot(
            `For option **${choice}** (delegations, exports, collective/executive reports, automation, Classroom sync), please use the **AI Agent** tab — you can say exactly what you want in plain language.\n\n` +
              `[Open AI Agent](/director/ai-agent)\n\nType **menu** to return.`,
            { clearOptions: true }
          );
          s.step = STEPS.MENU;
          return;
        }
        if (choice === 13) {
          s.step = STEPS.SH_CLASS;
          const classrooms = await loadClassrooms(user.id);
          s.classrooms = classrooms;
          pushBot(
            `Filter by classroom (optional):\n\n1. All classrooms\n${classrooms.map((c, i) => `${i + 2}. ${c.name}`).join("\n")}`
          );
          return;
        }
      }

      if (s.step === STEPS.AR_CLASS) {
        const idx = parseChoice(text, s.classrooms.length);
        if (!idx) {
          pushBot("Invalid choice. Reply with a classroom number.");
          return;
        }
        s.classroom = s.classrooms[idx - 1];
        s.step = STEPS.AR_ASG;
        const assignments = await loadAssignments(user.id, s.classroom._id);
        s.assignments = assignments;
        pushBot(
          `Assignment in **${s.classroom.name}**:\n\n${formatNumberedList(assignments, (a) => a.title)}`
        );
        return;
      }

      if (s.step === STEPS.AR_ASG) {
        const idx = parseChoice(text, s.assignments.length);
        if (!idx) {
          pushBot("Invalid choice. Reply with an assignment number.");
          return;
        }
        s.assignment = s.assignments[idx - 1];
        s.step = STEPS.AR_CONFIRM;
        const payload = await prepareAssignmentReport({
          personId: user.id,
          classroomId: s.classroom._id,
          assignmentId: s.assignment._id,
        });
        s.reports = payload.reports;
        const previews = await previewAssignmentReport(s.classroom._id, payload.reports);
        setEditPreview({
          items: previews.slice(0, 8).map((p) => ({
            key: String(p.studentId || p.name),
            name: p.name,
            message: p.message || "",
          })),
        });
        pushBot(
          `Preview ready for **${payload.reports.length}** student(s). Edit messages below if needed, then reply **1** to send or **2** to cancel.`,
          { options: ["1", "2"] }
        );
        return;
      }

      if (s.step === STEPS.AR_CONFIRM) {
        const yn = parseYesNo(text);
        if (yn === false) {
          setEditPreview(null);
          resetToMenu();
          return;
        }
        if (yn !== true) {
          pushBot("Reply **1** to send or **2** to cancel.");
          return;
        }
        let result = await sendAssignmentReport(s.classroom._id, s.reports);
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
              toastId: "manager-menu-force-resend",
            }
          );
          if (confirmed) {
            result = await sendAssignmentReport(s.classroom._id, s.reports, null, {
              forceResend: true,
            });
          } else if (sent === 0) {
            setEditPreview(null);
            pushBot("Cancelled — nothing was resent. Type **menu** for more actions.");
            s.step = STEPS.MENU;
            return;
          }
        }
        const ok = result.sentCount ?? (result.summary || []).filter((r) => r.status === "fulfilled").length;
        setEditPreview(null);
        pushBot(`Sent **${ok}** report(s). Type **menu** for more actions.`);
        s.step = STEPS.MENU;
        return;
      }

      if (s.step === STEPS.MR_CLASS) {
        const idx = parseChoice(text, s.classrooms.length);
        if (!idx) {
          pushBot("Invalid choice.");
          return;
        }
        s.classroom = s.classrooms[idx - 1];
        s.step = STEPS.MR_CONFIRM;
        const students = await loadStudents(user.id, { classroomId: s.classroom._id });
        s.studentIds = students.map((st) => String(st._id));
        const now = new Date();
        s.year = now.getFullYear();
        s.month = now.getMonth() + 1;
        const preview = students[0]
          ? await previewMonthly({
              personId: user.id,
              classroomId: s.classroom._id,
              studentId: students[0]._id,
              year: s.year,
              month: s.month,
            })
          : null;
        pushBot(
          `Send monthly report to **${students.length}** student(s) in **${s.classroom.name}**?\n\nSample intro:\n${preview?.whatsappMessage?.slice(0, 200) || "(no preview)"}…\n\nReply **1** yes / **2** no.`,
          { options: ["1", "2"] }
        );
        return;
      }

      if (s.step === STEPS.MR_CONFIRM) {
        const yn = parseYesNo(text);
        if (yn === false) {
          resetToMenu();
          return;
        }
        if (yn !== true) {
          pushBot("Reply **1** yes or **2** no.");
          return;
        }
        await sendMonthly({
          personId: user.id,
          classroomId: s.classroom._id,
          year: s.year,
          month: s.month,
          studentIds: s.studentIds,
        });
        pushBot(`Monthly reports queued for **${s.studentIds.length}** students. Type **menu**.`);
        s.step = STEPS.MENU;
        return;
      }

      if (s.step === STEPS.SH_CLASS) {
        if (text === "1") {
          s.classroomFilter = null;
        } else {
          const idx = parseChoice(text, s.classrooms.length + 1);
          if (!idx || idx === 1) s.classroomFilter = null;
          else s.classroomFilter = s.classrooms[idx - 2]?._id;
        }
        const history = await loadSentHistory(user.id, s.classroomFilter);
        const rows = history.rows || history.items || [];
        const lines = rows.slice(0, 15).map(
          (r) =>
            `• ${r.reportTypeLabel || r.reportType || "Report"} — ${r.classroomName || "—"} — ${r.sentAt ? new Date(r.sentAt).toLocaleString() : ""}`
        );
        pushBot(
          `**Sent reports** (${rows.length} total)\n\n` +
            (lines.length ? lines.join("\n") : "No sends found.") +
            `\n\nType **menu**.`,
          { clearOptions: true }
        );
        s.step = STEPS.MENU;
        return;
      }

      pushBot("Type **menu** to see options.");
    } catch (err) {
      pushBot(err.response?.data?.message || err.message || "Something went wrong.");
      s.step = STEPS.MENU;
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="tch-page tch-page--wide tchat-page">
      <TeacherPageHeader
        eyebrow="Actions"
        title="Chatbot"
        subtitle="Numbered menu for common director actions. Use AI Agent for full natural-language control."
        actions={
          <>
            <Link to="/director/ai-agent" className="tch-btn tch-btn--ghost">
              AI Agent
            </Link>
            <button type="button" className="tch-btn tch-btn--ghost" onClick={resetToMenu}>
              <FiPlus size={15} /> Menu
            </button>
          </>
        }
      />

      <div className="tchat-shell">
        <div className="tchat-scroll" ref={scrollRef}>
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
                  }`}
                >
                  {m.role === "assistant" ? (
                    <div className="tchat-md">{renderMarkdown(m.content)}</div>
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}

            {editPreview?.items?.length > 0 && (
              <div className="tchat-preview-list">
                {editPreview.items.map((item) => (
                  <div key={item.key} className="tchat-preview-item">
                    <span className="tchat-preview-name">{item.name}</span>
                    <div className="tchat-preview-textarea" style={{ whiteSpace: "pre-wrap" }}>
                      {item.message}
                    </div>
                  </div>
                ))}
              </div>
            )}

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
          </div>
        </div>

        {actionOptions.length > 0 && !loading && (
          <div className="tchat-suggestions">
            {actionOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                className="tchat-suggestion"
                onClick={() => handleUserInput(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        <form
          className="tchat-inputbar"
          onSubmit={(e) => {
            e.preventDefault();
            handleUserInput();
          }}
        >
          <textarea
            ref={inputRef}
            className="tchat-input"
            placeholder="Reply with a menu number or instruction…"
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleUserInput();
              }
            }}
            disabled={loading}
          />
          <button
            type="submit"
            className="tchat-send"
            disabled={loading || !input.trim()}
            aria-label="Send"
          >
            <FiSend size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
