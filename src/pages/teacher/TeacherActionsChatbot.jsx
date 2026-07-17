import { useCallback, useEffect, useRef, useState } from "react";
import { TeacherPageHeader } from "./TeacherUI";
import { FiSend, FiPlus, FiCpu, FiUser } from "react-icons/fi";
import {
  createCoursework,
  downloadGradesExcel,
  formatNumberedList,
  loadAssistantMetrics,
  loadAssignments,
  loadClassrooms,
  loadStudents,
  parseChoice,
  parseYesNo,
  prepareAssignmentReport,
  previewAssignmentReport,
  previewMonthly,
  sendAssignmentReport,
  sendMonthly,
} from "./teacherChatbotActionsClient";
import "./teacher.css";
import "./TeacherChatbot.css";

const STEPS = {
  MENU: "menu",
  AR_CLASS: "ar_class",
  AR_ASG: "ar_asg",
  AR_SCOPE: "ar_scope",
  AR_STUDENT: "ar_student",
  AR_CONFIRM: "ar_confirm",
  MR_CLASS: "mr_class",
  MR_SCOPE: "mr_scope",
  MR_STUDENT: "mr_student",
  MR_CONFIRM: "mr_confirm",
  CR_CLASS: "cr_class",
  CR_TITLE: "cr_title",
  CR_POINTS: "cr_points",
  CR_DUE: "cr_due",
  CR_CONFIRM: "cr_confirm",
  EX_CLASS: "ex_class",
  EX_ASG: "ex_asg",
  EX_CONFIRM: "ex_confirm",
};

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

function botMsg(content, extra = {}) {
  return { role: "assistant", content, at: Date.now(), ...extra };
}

function userMsg(content) {
  return { role: "user", content, at: Date.now() };
}

function nextSundayIso() {
  const d = new Date();
  const day = d.getDay();
  const add = day === 0 ? 7 : 7 - day;
  d.setDate(d.getDate() + add);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
  };
}

const MENU_OPTIONS = ["1", "2", "3", "4", "5"];

/** Same menu as Actions, without "back to normal chat" (this page is actions-only). */
const CHATBOT_MENU =
  "Hello! What do you want to do?\n\n" +
  "1. Send assignment grade reports (WhatsApp)\n" +
  "2. Send monthly parent report (WhatsApp)\n" +
  "3. Show assistant workload\n" +
  "4. Create an assignment\n" +
  "5. Export grades to Excel\n\n" +
  "Reply with a number. Preview always comes before any send.";

export default function TeacherActionsChatbot() {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionOptions, setActionOptions] = useState(MENU_OPTIONS);
  const [editPreview, setEditPreview] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const sessionRef = useRef({ step: STEPS.MENU });
  const editPreviewRef = useRef(null);

  useEffect(() => {
    editPreviewRef.current = editPreview;
  }, [editPreview]);

  const pushBot = useCallback((content, extra = {}) => {
    setMessages((prev) => [...prev, botMsg(content, extra)]);
    if (extra.options) setActionOptions(extra.options);
    else if (extra.clearOptions) setActionOptions([]);
  }, []);

  const clearPreview = useCallback(() => {
    setEditPreview(null);
  }, []);

  const resetToMenu = useCallback(() => {
    sessionRef.current = { step: STEPS.MENU };
    setEditPreview(null);
    pushBot(CHATBOT_MENU, { options: MENU_OPTIONS });
  }, [pushBot]);

  const openAssignmentPreview = (previews) => {
    const items = (previews || [])
      .filter((p) => !p.error && p.message)
      .map((p, i) => ({
        key: String(p.studentId ?? p.name ?? i),
        studentId: p.studentId != null ? String(p.studentId) : null,
        name: p.name || "Student",
        message: String(p.message || ""),
      }));
    setEditPreview({ type: "assignment", items });
    sessionRef.current.step = STEPS.AR_CONFIRM;
    pushBot(
      `Edit the message(s) below if needed, then reply **1** to send or **2** to cancel.`,
      { options: ["1", "2"] }
    );
  };

  const openMonthlyPreview = (items) => {
    setEditPreview({ type: "monthly", items });
    sessionRef.current.step = STEPS.MR_CONFIRM;
    pushBot(
      `Edit the message(s) below if needed, then reply **1** to send or **2** to cancel.`,
      { options: ["1", "2"] }
    );
  };

  const buildOverrides = () => {
    const preview = editPreviewRef.current;
    if (!preview?.items?.length) return null;
    const overrides = {};
    for (const item of preview.items) {
      const text = String(item.message || "").trim();
      if (!text) continue;
      if (item.studentId) overrides[String(item.studentId)] = text;
      if (item.name) overrides[item.name] = text;
    }
    return Object.keys(overrides).length ? overrides : null;
  };

  const updatePreviewMessage = (key, message) => {
    setEditPreview((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        items: prev.items.map((item) =>
          item.key === key ? { ...item, message } : item
        ),
      };
    });
  };

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
    setMessages([botMsg(CHATBOT_MENU, { options: MENU_OPTIONS })]);
    setActionOptions(MENU_OPTIONS);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  const handleAction = async (raw) => {
    const text = String(raw ?? input).trim();
    if (!text || loading || !user?.id) return;
    const s = sessionRef.current;

    setMessages((prev) => [...prev, userMsg(text)]);
    setInput("");
    setLoading(true);

    try {
      if (text === "0" && s.step !== STEPS.MENU) {
        clearPreview();
        resetToMenu();
        return;
      }

      switch (s.step) {
        case STEPS.MENU: {
          const c = parseChoice(text, 5);
          if (c === 3) {
            pushBot("Loading assistant workload…", { clearOptions: true });
            const metrics = await loadAssistantMetrics(user.id);
            if (!metrics.assistants?.length) {
              pushBot("No assistants are assigned on your classrooms yet.");
            } else {
              const lines = metrics.assistants.map((a, i) => {
                const sum = a.summary || {};
                return (
                  `${i + 1}. **${a.name}** — on time: ${sum.onTime || 0}, ` +
                  `missed: ${sum.missedDeadline || 0}, pending: ${sum.pending || 0}, ` +
                  `papers: ${a.papersCorrected ?? "—"}`
                );
              });
              pushBot(`Assistant workload on your classes:\n\n${lines.join("\n")}`);
            }
            resetToMenu();
            break;
          }
          if (c === 1 || c === 2 || c === 4 || c === 5) {
            pushBot("Loading classrooms…", { clearOptions: true });
            const classrooms = await loadClassrooms(user.id);
            if (!classrooms.length) {
              pushBot("You have no active classrooms.");
              resetToMenu();
              break;
            }
            s.classrooms = classrooms;
            s.flow = c;
            s.step =
              c === 1
                ? STEPS.AR_CLASS
                : c === 2
                  ? STEPS.MR_CLASS
                  : c === 4
                    ? STEPS.CR_CLASS
                    : STEPS.EX_CLASS;
            pushBot(
              `Which classroom?\n\n${formatNumberedList(
                classrooms,
                (x) => (x.section ? `${x.name} (${x.section})` : x.name)
              )}\n\nReply with a number (0 = menu).`,
              { options: classrooms.map((_, i) => String(i + 1)) }
            );
            break;
          }
          pushBot("Please reply 1–5.", { options: MENU_OPTIONS });
          break;
        }

        case STEPS.AR_CLASS:
        case STEPS.MR_CLASS:
        case STEPS.CR_CLASS:
        case STEPS.EX_CLASS: {
          const choice = parseChoice(text, s.classrooms.length);
          if (!choice) {
            pushBot(`Pick 1–${s.classrooms.length} (or 0 for menu).`, {
              options: s.classrooms.map((_, i) => String(i + 1)),
            });
            break;
          }
          s.classroom = s.classrooms[choice - 1];
          if (s.step === STEPS.CR_CLASS) {
            s.step = STEPS.CR_TITLE;
            pushBot("Type the assignment title.", { clearOptions: true });
            break;
          }
          if (s.step === STEPS.MR_CLASS) {
            pushBot("Loading students…", { clearOptions: true });
            s.students = await loadStudents(user.id, {
              classroomId: s.classroom._id,
            });
            s.year = new Date().getFullYear();
            s.month = new Date().getMonth() + 1;
            s.step = STEPS.MR_SCOPE;
            pushBot(
              `Monthly report for ${s.classroom.name} (${s.year}-${String(s.month).padStart(2, "0")}).\n\n1. One student\n2. All students\n\nReply with a number.`,
              { options: ["1", "2"] }
            );
            break;
          }
          pushBot("Loading assignments…", { clearOptions: true });
          s.assignments = await loadAssignments(user.id, s.classroom._id);
          if (!s.assignments.length) {
            pushBot("No assignments in that classroom.");
            resetToMenu();
            break;
          }
          s.step = s.step === STEPS.AR_CLASS ? STEPS.AR_ASG : STEPS.EX_ASG;
          pushBot(
            `Which assignment?\n\n${formatNumberedList(
              s.assignments,
              (a) => a.title || "Untitled"
            )}\n\nReply with a number.`,
            { options: s.assignments.map((_, i) => String(i + 1)) }
          );
          break;
        }

        case STEPS.AR_ASG: {
          const choice = parseChoice(text, s.assignments.length);
          if (!choice) {
            pushBot(`Pick 1–${s.assignments.length}.`, {
              options: s.assignments.map((_, i) => String(i + 1)),
            });
            break;
          }
          s.assignment = s.assignments[choice - 1];
          s.step = STEPS.AR_SCOPE;
          pushBot(
            `Send reports for who on "${s.assignment.title}"?\n\n1. One student\n2. All students`,
            { options: ["1", "2"] }
          );
          break;
        }

        case STEPS.AR_SCOPE: {
          const choice = parseChoice(text, 2);
          if (choice === 2) {
            pushBot("Preparing preview…", { clearOptions: true });
            const prepared = await prepareAssignmentReport({
              personId: user.id,
              classroomId: s.classroom._id,
              assignmentId: s.assignment._id,
            });
            s.prepared = prepared;
            const previews = await previewAssignmentReport(
              prepared.classroomId,
              prepared.reports
            );
            openAssignmentPreview(previews);
            break;
          }
          if (choice === 1) {
            pushBot("Loading students…", { clearOptions: true });
            s.students = await loadStudents(user.id, {
              assignmentId: s.assignment._id,
            });
            s.step = STEPS.AR_STUDENT;
            pushBot(
              `Which student?\n\n${formatNumberedList(s.students, (st) => st.name)}\n\nReply with a number.`,
              { options: s.students.map((_, i) => String(i + 1)) }
            );
            break;
          }
          pushBot("Reply 1 or 2.", { options: ["1", "2"] });
          break;
        }

        case STEPS.AR_STUDENT: {
          const choice = parseChoice(text, s.students.length);
          if (!choice) {
            pushBot(`Pick 1–${s.students.length}.`, {
              options: s.students.map((_, i) => String(i + 1)),
            });
            break;
          }
          pushBot("Preparing preview…", { clearOptions: true });
          const prepared = await prepareAssignmentReport({
            personId: user.id,
            classroomId: s.classroom._id,
            assignmentId: s.assignment._id,
            studentIds: [s.students[choice - 1]._id],
          });
          s.prepared = prepared;
          const previews = await previewAssignmentReport(
            prepared.classroomId,
            prepared.reports
          );
          openAssignmentPreview(previews);
          break;
        }

        case STEPS.AR_CONFIRM: {
          const yn = parseYesNo(text);
          if (yn === true) {
            pushBot("Sending…", { clearOptions: true });
            const overrides = buildOverrides();
            clearPreview();
            const result = await sendAssignmentReport(
              s.prepared.classroomId,
              s.prepared.reports,
              overrides
            );
            const summary = result.summary || [];
            const ok = summary.filter((r) => r.status === "fulfilled").length;
            const fail = summary.filter((r) => r.status === "rejected").length;
            pushBot(`Sent — ${ok} succeeded${fail ? `, ${fail} failed` : ""}.`);
            resetToMenu();
            break;
          }
          if (yn === false) {
            clearPreview();
            pushBot("Cancelled.");
            resetToMenu();
            break;
          }
          pushBot("1 = Yes (send edited messages), 2 = No.", {
            options: ["1", "2"],
          });
          break;
        }

        case STEPS.MR_SCOPE: {
          const choice = parseChoice(text, 2);
          if (choice === 2) {
            s.studentIds = s.students.map((st) => st._id);
            pushBot("Loading previews…", { clearOptions: true });
            const items = [];
            for (const st of s.students) {
              try {
                const report = await previewMonthly({
                  personId: user.id,
                  classroomId: s.classroom._id,
                  studentId: st._id,
                  year: s.year,
                  month: s.month,
                });
                items.push({
                  key: String(st._id),
                  studentId: String(st._id),
                  name: report?.studentName || st.name,
                  message:
                    report?.whatsappMessage ||
                    report?.parentMessage ||
                    "",
                });
              } catch {
                items.push({
                  key: String(st._id),
                  studentId: String(st._id),
                  name: st.name,
                  message: "",
                });
              }
            }
            openMonthlyPreview(items);
            break;
          }
          if (choice === 1) {
            s.step = STEPS.MR_STUDENT;
            pushBot(
              `Which student?\n\n${formatNumberedList(s.students, (st) => st.name)}`,
              { options: s.students.map((_, i) => String(i + 1)) }
            );
            break;
          }
          pushBot("Reply 1 or 2.", { options: ["1", "2"] });
          break;
        }

        case STEPS.MR_STUDENT: {
          const choice = parseChoice(text, s.students.length);
          if (!choice) {
            pushBot(`Pick 1–${s.students.length}.`, {
              options: s.students.map((_, i) => String(i + 1)),
            });
            break;
          }
          const student = s.students[choice - 1];
          s.studentIds = [student._id];
          pushBot("Loading preview…", { clearOptions: true });
          const report = await previewMonthly({
            personId: user.id,
            classroomId: s.classroom._id,
            studentId: student._id,
            year: s.year,
            month: s.month,
          });
          openMonthlyPreview([
            {
              key: String(student._id),
              studentId: String(student._id),
              name: report?.studentName || student.name,
              message:
                report?.whatsappMessage || report?.parentMessage || "",
            },
          ]);
          break;
        }

        case STEPS.MR_CONFIRM: {
          const yn = parseYesNo(text);
          if (yn === true) {
            pushBot("Sending monthly reports…", { clearOptions: true });
            const overrides = buildOverrides();
            clearPreview();
            const result = await sendMonthly({
              personId: user.id,
              classroomId: s.classroom._id,
              year: s.year,
              month: s.month,
              studentIds: s.studentIds,
              messageOverrides: overrides,
            });
            const ok = result?.sent ?? result?.succeeded ?? result?.ok;
            pushBot(
              typeof ok === "number"
                ? `Monthly send finished — ${ok} sent.`
                : "Monthly send finished."
            );
            resetToMenu();
            break;
          }
          if (yn === false) {
            clearPreview();
            pushBot("Cancelled.");
            resetToMenu();
            break;
          }
          pushBot("1 = Yes (send edited messages), 2 = No.", {
            options: ["1", "2"],
          });
          break;
        }

        case STEPS.CR_TITLE: {
          s.title = text;
          s.step = STEPS.CR_POINTS;
          pushBot("Max points? Reply with a number, or type `ungraded`.", {
            clearOptions: true,
          });
          break;
        }

        case STEPS.CR_POINTS: {
          const lower = text.toLowerCase();
          if (lower === "ungraded") {
            s.isUngraded = true;
            s.maxPoints = null;
          } else {
            const n = Number(text);
            if (!Number.isFinite(n) || n <= 0) {
              pushBot("Enter a positive number or `ungraded`.");
              break;
            }
            s.isUngraded = false;
            s.maxPoints = n;
          }
          s.step = STEPS.CR_DUE;
          pushBot("Due date?\n1. Next Sunday\n2. No due date", {
            options: ["1", "2"],
          });
          break;
        }

        case STEPS.CR_DUE: {
          const choice = parseChoice(text, 2);
          if (!choice) {
            pushBot("Reply 1 or 2.", { options: ["1", "2"] });
            break;
          }
          s.dueDate = choice === 1 ? nextSundayIso() : null;
          s.step = STEPS.CR_CONFIRM;
          pushBot(
            `Create assignment?\n\n- Class: ${s.classroom.name}\n- Title: ${s.title}\n- Points: ${
              s.isUngraded ? "ungraded" : s.maxPoints
            }\n- Due: ${
              s.dueDate
                ? `${s.dueDate.year}-${s.dueDate.month}-${s.dueDate.day}`
                : "none"
            }\n\n(Attach worksheets from Courses — chat creates the assignment only.)\n\n1. Yes\n2. No`,
            { options: ["1", "2"] }
          );
          break;
        }

        case STEPS.CR_CONFIRM: {
          const yn = parseYesNo(text);
          if (yn === true) {
            if (!s.classroom.googleCourseId) {
              pushBot(
                "This classroom has no Google course id — open Courses to create it."
              );
              resetToMenu();
              break;
            }
            pushBot("Creating assignment…", { clearOptions: true });
            const courseworkData = {
              title: s.title,
              description: "",
              isUngraded: Boolean(s.isUngraded),
              ...(s.isUngraded ? {} : { maxPoints: s.maxPoints }),
              ...(s.dueDate
                ? { dueDate: s.dueDate, dueTime: { hours: 23, minutes: 59 } }
                : {}),
            };
            await createCoursework({
              personId: user.id,
              courseId: s.classroom.googleCourseId,
              courseworkData,
            });
            pushBot(
              `Created **${s.title}**. Attach a worksheet from **Courses** if needed.`
            );
            resetToMenu();
            break;
          }
          if (yn === false) {
            pushBot("Cancelled.");
            resetToMenu();
            break;
          }
          pushBot("1 = Yes, 2 = No.", { options: ["1", "2"] });
          break;
        }

        case STEPS.EX_ASG: {
          const choice = parseChoice(text, s.assignments.length);
          if (!choice) {
            pushBot(`Pick 1–${s.assignments.length}.`, {
              options: s.assignments.map((_, i) => String(i + 1)),
            });
            break;
          }
          s.assignment = s.assignments[choice - 1];
          s.step = STEPS.EX_CONFIRM;
          pushBot(
            `Export grades Excel for "${s.assignment.title}"?\n1. Yes\n2. No`,
            { options: ["1", "2"] }
          );
          break;
        }

        case STEPS.EX_CONFIRM: {
          const yn = parseYesNo(text);
          if (yn === true) {
            pushBot("Building Excel…", { clearOptions: true });
            const filename = await downloadGradesExcel(
              user.id,
              s.assignment._id,
              s.assignment.maxPoints || 100
            );
            pushBot(`Downloaded **${filename}**.`);
            resetToMenu();
            break;
          }
          if (yn === false) {
            pushBot("Cancelled.");
            resetToMenu();
            break;
          }
          pushBot("1 = Yes, 2 = No.", { options: ["1", "2"] });
          break;
        }

        default:
          resetToMenu();
      }
    } catch (err) {
      pushBot(
        err?.response?.data?.message || err.message || "Action failed.",
        { isError: true }
      );
      resetToMenu();
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const newChat = () => {
    sessionRef.current = { step: STEPS.MENU };
    setEditPreview(null);
    setMessages([botMsg(CHATBOT_MENU, { options: MENU_OPTIONS })]);
    setActionOptions(MENU_OPTIONS);
    inputRef.current?.focus();
  };

  const confirmPreviewSend = () => handleAction("1");
  const cancelPreviewSend = () => handleAction("2");

  return (
    <div className="tch-page tch-page--wide tchat-page">
      <TeacherPageHeader
        eyebrow="Actions"
        title="Chatbot"
        subtitle="Number-driven actions — edit WhatsApp previews before sending."
        actions={
          <button type="button" className="tch-btn tch-btn--ghost" onClick={newChat}>
            <FiPlus size={15} /> Restart
          </button>
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
                  } ${m.isError ? "tchat-bubble--error" : ""}`}
                >
                  {m.role === "assistant" ? (
                    <div
                      className="tchat-md"
                      dangerouslySetInnerHTML={{
                        __html: renderMarkdown(m.content),
                      }}
                    />
                  ) : (
                    m.content
                  )}
                </div>
              </div>
            ))}

            {editPreview?.items?.length > 0 && (
              <div className="tchat-preview-editor">
                <div className="tchat-preview-editor-title">
                  Editable preview — change text before sending
                </div>
                <div className="tchat-preview-list">
                  {editPreview.items.map((item) => (
                    <label key={item.key} className="tchat-preview-item">
                      <span className="tchat-preview-name">{item.name}</span>
                      <textarea
                        className="tchat-preview-textarea"
                        value={item.message}
                        rows={Math.min(
                          14,
                          Math.max(4, String(item.message || "").split("\n").length + 1)
                        )}
                        onChange={(e) =>
                          updatePreviewMessage(item.key, e.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>
                <div className="tchat-preview-actions">
                  <button
                    type="button"
                    className="tch-btn tch-btn--primary"
                    onClick={confirmPreviewSend}
                    disabled={loading}
                  >
                    Send
                  </button>
                  <button
                    type="button"
                    className="tch-btn tch-btn--ghost"
                    onClick={cancelPreviewSend}
                    disabled={loading}
                  >
                    Cancel
                  </button>
                </div>
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

        {!loading && actionOptions.length > 0 && actionOptions.length <= 16 && (
          <div className="tchat-suggestions" style={{ padding: "0 16px 10px" }}>
            {actionOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                className="tchat-suggestion"
                onClick={() => handleAction(opt)}
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
            handleAction();
          }}
        >
          <input
            ref={inputRef}
            className="tchat-input"
            placeholder="Type a number (or title when asked)…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            autoComplete="off"
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
