import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiSend, FiPlus, FiCpu, FiUser, FiMessageCircle } from "react-icons/fi";
import { AssistantPageHeader } from "./AssistantUI";
import {
  assignmentsForClassroom,
  classroomsFromAssignments,
  formatNumberedList,
  loadAssistantAssignments,
  loadAssignmentMeta,
  loadClassroomAssignments,
  loadMarkingStudents,
  loadReportClassrooms,
  loadReportStudents,
  parseChoice,
  parseYesNo,
  runMarkingPipeline,
  sendAssignmentReports,
} from "./assistantChatbotActions";
import "./assistant.css";
import "./AssistantChatbot.css";

const STEPS = {
  MENU: "menu",
  MARK_CLASSROOM: "mark_classroom",
  MARK_ASSIGNMENT: "mark_assignment",
  MARK_SCOPE: "mark_scope",
  MARK_STUDENT: "mark_student",
  MARK_CONFIRM: "mark_confirm",
  REPORT_CLASSROOM: "report_classroom",
  REPORT_ASSIGNMENT: "report_assignment",
  REPORT_SCOPE: "report_scope",
  REPORT_STUDENT: "report_student",
  REPORT_CONFIRM: "report_confirm",
};

const WELCOME =
  "Hello! What do you want to do today?\n\n" +
  "1. Mark an assignment\n" +
  "2. Send a report\n\n" +
  "Reply with a number.";

function bot(content, extra = {}) {
  return { role: "assistant", content, ...extra, at: Date.now() };
}

function user(content) {
  return { role: "user", content, at: Date.now() };
}

function menuMessage() {
  return bot(WELCOME, { options: ["1", "2"] });
}

export default function AssistantChatbot() {
  const navigate = useNavigate();
  const [userInfo, setUserInfo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [options, setOptions] = useState(["1", "2"]);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const sessionRef = useRef({
    step: STEPS.MENU,
    assignments: [],
    classrooms: [],
    assignmentList: [],
    students: [],
    classroom: null,
    assignment: null,
    student: null,
    scope: null, // "one" | "all"
    meta: null,
  });

  const pushBot = useCallback((content, extra = {}) => {
    setMessages((prev) => [...prev, bot(content, extra)]);
    if (extra.options) setOptions(extra.options);
    else if (extra.clearOptions) setOptions([]);
  }, []);

  const resetToMenu = useCallback(() => {
    sessionRef.current = {
      step: STEPS.MENU,
      assignments: [],
      classrooms: [],
      assignmentList: [],
      students: [],
      classroom: null,
      assignment: null,
      student: null,
      scope: null,
      meta: null,
    };
    pushBot(
      "Anything else?\n\n1. Mark an assignment\n2. Send a report\n\nReply with a number.",
      { options: ["1", "2"] }
    );
  }, [pushBot]);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!stored || !token) {
      navigate("/login", { replace: true });
      return;
    }
    const parsed = JSON.parse(stored);
    if (parsed?.roleId?.name?.toLowerCase() !== "assistant") {
      navigate("/login", { replace: true });
      return;
    }
    setUserInfo(parsed);
    setMessages([menuMessage()]);
    setOptions(["1", "2"]);
  }, [navigate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  const startMarkFlow = async () => {
    const s = sessionRef.current;
    pushBot("Loading your classrooms…", { clearOptions: true });
    const assignments = await loadAssistantAssignments(userInfo.id);
    const classrooms = classroomsFromAssignments(assignments);
    if (!classrooms.length) {
      pushBot(
        "You have no delegated assignments yet, so there are no classrooms to mark.\n\n" +
          "1. Mark an assignment\n2. Send a report",
        { options: ["1", "2"] }
      );
      s.step = STEPS.MENU;
      return;
    }
    s.assignments = assignments;
    s.classrooms = classrooms;
    s.step = STEPS.MARK_CLASSROOM;
    pushBot(
      `Which classroom?\n\n${formatNumberedList(
        classrooms,
        (c) => (c.section ? `${c.name} (${c.section})` : c.name)
      )}\n\nReply with a number.`,
      { options: classrooms.map((_, i) => String(i + 1)) }
    );
  };

  const startReportFlow = async () => {
    const s = sessionRef.current;
    pushBot("Loading your classrooms…", { clearOptions: true });
    const classrooms = await loadReportClassrooms(userInfo.id);
    if (!classrooms.length) {
      pushBot(
        "No classrooms found for reports.\n\n1. Mark an assignment\n2. Send a report",
        { options: ["1", "2"] }
      );
      s.step = STEPS.MENU;
      return;
    }
    s.classrooms = classrooms;
    s.step = STEPS.REPORT_CLASSROOM;
    pushBot(
      `Which classroom?\n\n${formatNumberedList(
        classrooms,
        (c) => (c.section ? `${c.name} (${c.section})` : c.name)
      )}\n\nReply with a number.`,
      { options: classrooms.map((_, i) => String(i + 1)) }
    );
  };

  const runMarkConfirm = async () => {
    const s = sessionRef.current;
    const assignment = s.assignment;
    const meta = s.meta || (await loadAssignmentMeta(assignment._id));
    s.meta = meta;

    const students =
      s.scope === "one" && s.student ? [s.student] : null;
    const label =
      s.scope === "one"
        ? s.student?.name || "1 student"
        : "all eligible students";

    pushBot(`Starting full marking for ${label}…`, { clearOptions: true });

    try {
      const result = await runMarkingPipeline({
        assignmentId: assignment._id,
        classroomId: meta.classroomId || s.classroom?._id,
        maxPoints: meta.maxPoints,
        subjectId: meta.subjectId,
        students,
        onProgress: (msg) => pushBot(msg),
      });
      pushBot("Done. Marking pipeline finished successfully.");
    } catch (err) {
      pushBot(
        `Marking failed: ${err?.response?.data?.message || err.message || "Unknown error"}`,
        { isError: true }
      );
    } finally {
      resetToMenu();
    }
  };

  const runReportConfirm = async () => {
    const s = sessionRef.current;
    const students =
      s.scope === "one" && s.student ? [s.student] : s.students;

    pushBot(
      `Sending report for ${
        s.scope === "one" ? s.student?.name || "1 student" : `${students.length} students`
      }…`,
      { clearOptions: true }
    );

    try {
      await sendAssignmentReports({
        classroomId: s.classroom._id,
        assignment: s.assignment,
        students,
        summaryMap: s.meta?.summaryMap || {},
        onProgress: (msg) => pushBot(msg),
      });
      pushBot("Done. Report flow finished.");
    } catch (err) {
      pushBot(
        `Report failed: ${err?.response?.data?.message || err.message || "Unknown error"}`,
        { isError: true }
      );
    } finally {
      resetToMenu();
    }
  };

  const handleInput = async (raw) => {
    const text = String(raw ?? input).trim();
    if (!text || busy || !userInfo?.id) return;

    setMessages((prev) => [...prev, user(text)]);
    setInput("");
    setBusy(true);

    const s = sessionRef.current;

    try {
      // Global cancel
      if (text === "0" && s.step !== STEPS.MENU) {
        s.step = STEPS.MENU;
        pushBot(WELCOME, { options: ["1", "2"] });
        return;
      }

      switch (s.step) {
        case STEPS.MENU: {
          const choice = parseChoice(text, 2);
          if (choice === 1) {
            await startMarkFlow();
          } else if (choice === 2) {
            await startReportFlow();
          } else {
            pushBot("Please reply with 1 or 2.\n\n" + WELCOME, {
              options: ["1", "2"],
            });
          }
          break;
        }

        case STEPS.MARK_CLASSROOM: {
          const choice = parseChoice(text, s.classrooms.length);
          if (!choice) {
            pushBot(
              `Please reply with a number from 1 to ${s.classrooms.length}.`,
              { options: s.classrooms.map((_, i) => String(i + 1)) }
            );
            break;
          }
          s.classroom = s.classrooms[choice - 1];
          s.assignmentList = assignmentsForClassroom(
            s.assignments,
            s.classroom._id
          );
          if (!s.assignmentList.length) {
            pushBot("No assignments in that classroom. Pick another classroom.", {
              options: s.classrooms.map((_, i) => String(i + 1)),
            });
            break;
          }
          s.step = STEPS.MARK_ASSIGNMENT;
          pushBot(
            `Which assignment?\n\n${formatNumberedList(
              s.assignmentList,
              (a) => a.title || "Untitled"
            )}\n\nReply with a number (or 0 to cancel).`,
            { options: s.assignmentList.map((_, i) => String(i + 1)) }
          );
          break;
        }

        case STEPS.MARK_ASSIGNMENT: {
          const choice = parseChoice(text, s.assignmentList.length);
          if (!choice) {
            pushBot(
              `Please reply with a number from 1 to ${s.assignmentList.length} (or 0 to cancel).`,
              { options: s.assignmentList.map((_, i) => String(i + 1)) }
            );
            break;
          }
          s.assignment = s.assignmentList[choice - 1];
          s.step = STEPS.MARK_SCOPE;
          pushBot(
            `Mark who on "${s.assignment.title}"?\n\n1. A specific student\n2. All students\n\nReply with a number.`,
            { options: ["1", "2"] }
          );
          break;
        }

        case STEPS.MARK_SCOPE: {
          const choice = parseChoice(text, 2);
          if (choice === 2) {
            s.scope = "all";
            s.student = null;
            s.meta = await loadAssignmentMeta(s.assignment._id);
            s.step = STEPS.MARK_CONFIRM;
            pushBot(
              `Mark all eligible students on "${s.assignment.title}" in ${s.classroom.name}?\n\n` +
                "This will: generate prompt → verify mark scheme → mark.\n\n" +
                "1. Yes\n2. No",
              { options: ["1", "2"] }
            );
          } else if (choice === 1) {
            pushBot("Loading students…", { clearOptions: true });
            const students = await loadMarkingStudents(s.assignment._id);
            if (!students.length) {
              pushBot("No students found for this assignment.", {
                options: ["1", "2"],
              });
              s.step = STEPS.MENU;
              break;
            }
            s.students = students;
            s.scope = "one";
            s.step = STEPS.MARK_STUDENT;
            pushBot(
              `Which student?\n\n${formatNumberedList(
                students,
                (st) => st.name || "Unnamed"
              )}\n\nReply with a number (or 0 to cancel).`,
              { options: students.map((_, i) => String(i + 1)) }
            );
          } else {
            pushBot("Please reply with 1 or 2.", { options: ["1", "2"] });
          }
          break;
        }

        case STEPS.MARK_STUDENT: {
          const choice = parseChoice(text, s.students.length);
          if (!choice) {
            pushBot(
              `Please reply with a number from 1 to ${s.students.length} (or 0 to cancel).`,
              { options: s.students.map((_, i) => String(i + 1)) }
            );
            break;
          }
          s.student = s.students[choice - 1];
          s.meta = await loadAssignmentMeta(s.assignment._id);
          s.step = STEPS.MARK_CONFIRM;
          pushBot(
            `Mark ${s.student.name} on "${s.assignment.title}"?\n\n` +
              "This will: generate prompt → verify mark scheme → mark.\n\n" +
              "1. Yes\n2. No",
            { options: ["1", "2"] }
          );
          break;
        }

        case STEPS.MARK_CONFIRM: {
          const yn = parseYesNo(text);
          if (yn === true) {
            await runMarkConfirm();
            break;
          }
          if (yn === false) {
            pushBot("Cancelled.");
            resetToMenu();
            break;
          }
          pushBot("Please reply 1 for Yes or 2 for No.", { options: ["1", "2"] });
          break;
        }

        case STEPS.REPORT_CLASSROOM: {
          const choice = parseChoice(text, s.classrooms.length);
          if (!choice) {
            pushBot(
              `Please reply with a number from 1 to ${s.classrooms.length}.`,
              { options: s.classrooms.map((_, i) => String(i + 1)) }
            );
            break;
          }
          s.classroom = s.classrooms[choice - 1];
          pushBot("Loading assignments…", { clearOptions: true });
          const list = await loadClassroomAssignments(s.classroom._id);
          if (!list.length) {
            pushBot("No assignments in that classroom. Pick another.", {
              options: s.classrooms.map((_, i) => String(i + 1)),
            });
            break;
          }
          s.assignmentList = list;
          s.step = STEPS.REPORT_ASSIGNMENT;
          pushBot(
            `Which assignment?\n\n${formatNumberedList(
              list,
              (a) => a.title || "Untitled"
            )}\n\nReply with a number (or 0 to cancel).`,
            { options: list.map((_, i) => String(i + 1)) }
          );
          break;
        }

        case STEPS.REPORT_ASSIGNMENT: {
          const choice = parseChoice(text, s.assignmentList.length);
          if (!choice) {
            pushBot(
              `Please reply with a number from 1 to ${s.assignmentList.length} (or 0 to cancel).`,
              { options: s.assignmentList.map((_, i) => String(i + 1)) }
            );
            break;
          }
          s.assignment = s.assignmentList[choice - 1];
          s.step = STEPS.REPORT_SCOPE;
          pushBot(
            `Send report for who on "${s.assignment.title}"?\n\n1. A specific student\n2. All students\n\nReply with a number.`,
            { options: ["1", "2"] }
          );
          break;
        }

        case STEPS.REPORT_SCOPE: {
          const choice = parseChoice(text, 2);
          if (choice === 2) {
            pushBot("Loading students…", { clearOptions: true });
            const students = await loadReportStudents(s.assignment._id);
            if (!students.length) {
              pushBot("No students found for this assignment.");
              resetToMenu();
              break;
            }
            s.students = students;
            s.scope = "all";
            s.student = null;
            s.meta = await loadAssignmentMeta(s.assignment._id);
            s.step = STEPS.REPORT_CONFIRM;
            pushBot(
              `Send WhatsApp reports for all ${students.length} students on "${s.assignment.title}"?\n\n1. Yes\n2. No`,
              { options: ["1", "2"] }
            );
          } else if (choice === 1) {
            pushBot("Loading students…", { clearOptions: true });
            const students = await loadReportStudents(s.assignment._id);
            if (!students.length) {
              pushBot("No students found for this assignment.");
              resetToMenu();
              break;
            }
            s.students = students;
            s.scope = "one";
            s.step = STEPS.REPORT_STUDENT;
            pushBot(
              `Which student?\n\n${formatNumberedList(
                students,
                (st) => st.name || "Unnamed"
              )}\n\nReply with a number (or 0 to cancel).`,
              { options: students.map((_, i) => String(i + 1)) }
            );
          } else {
            pushBot("Please reply with 1 or 2.", { options: ["1", "2"] });
          }
          break;
        }

        case STEPS.REPORT_STUDENT: {
          const choice = parseChoice(text, s.students.length);
          if (!choice) {
            pushBot(
              `Please reply with a number from 1 to ${s.students.length} (or 0 to cancel).`,
              { options: s.students.map((_, i) => String(i + 1)) }
            );
            break;
          }
          s.student = s.students[choice - 1];
          s.meta = await loadAssignmentMeta(s.assignment._id);
          s.step = STEPS.REPORT_CONFIRM;
          pushBot(
            `Send WhatsApp report for ${s.student.name} on "${s.assignment.title}"?\n\n1. Yes\n2. No`,
            { options: ["1", "2"] }
          );
          break;
        }

        case STEPS.REPORT_CONFIRM: {
          const yn = parseYesNo(text);
          if (yn === true) {
            await runReportConfirm();
            break;
          }
          if (yn === false) {
            pushBot("Cancelled.");
            resetToMenu();
            break;
          }
          pushBot("Please reply 1 for Yes or 2 for No.", { options: ["1", "2"] });
          break;
        }

        default:
          s.step = STEPS.MENU;
          pushBot(WELCOME, { options: ["1", "2"] });
      }
    } catch (err) {
      pushBot(
        err?.response?.data?.message || err.message || "Something went wrong.",
        { isError: true }
      );
      resetToMenu();
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const newChat = () => {
    sessionRef.current = {
      step: STEPS.MENU,
      assignments: [],
      classrooms: [],
      assignmentList: [],
      students: [],
      classroom: null,
      assignment: null,
      student: null,
      scope: null,
      meta: null,
    };
    setMessages([menuMessage()]);
    setOptions(["1", "2"]);
    inputRef.current?.focus();
  };

  return (
    <div className="ast-page ast-page--wide achat-page">
      <AssistantPageHeader
        eyebrow="Assistant"
        title="Chatbot"
        subtitle="Reply with numbers — mark assignments or send reports step by step."
        actions={
          messages.length > 1 ? (
            <button type="button" className="ast-btn ast-btn--ghost" onClick={newChat}>
              <FiPlus size={15} /> New chat
            </button>
          ) : null
        }
      />

      <div className="achat-shell">
        <div className="achat-scroll" ref={scrollRef}>
          <div className="achat-messages">
            {messages.map((m, i) => (
              <div
                key={`${m.at}-${i}`}
                className={`achat-row ${m.role === "user" ? "achat-row--user" : ""}`}
              >
                <div
                  className={`achat-avatar ${
                    m.role === "user" ? "achat-avatar--user" : ""
                  }`}
                >
                  {m.role === "user" ? (
                    <FiUser size={14} />
                  ) : (
                    <FiMessageCircle size={14} />
                  )}
                </div>
                <div
                  className={`achat-bubble ${
                    m.role === "user" ? "achat-bubble--user" : ""
                  } ${m.isError ? "achat-bubble--error" : ""}`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {busy && (
              <div className="achat-row">
                <div className="achat-avatar">
                  <FiCpu size={14} />
                </div>
                <div className="achat-bubble achat-bubble--typing">
                  <span className="achat-dot" />
                  <span className="achat-dot" />
                  <span className="achat-dot" />
                </div>
              </div>
            )}
          </div>
        </div>

        {!busy && options.length > 0 && options.length <= 12 && (
          <div className="achat-quick">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                className="achat-quick-btn"
                onClick={() => handleInput(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        <form
          className="achat-inputbar"
          onSubmit={(e) => {
            e.preventDefault();
            handleInput();
          }}
        >
          <input
            ref={inputRef}
            className="achat-input"
            placeholder="Type a number…"
            value={input}
            inputMode="numeric"
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            autoComplete="off"
          />
          <button
            type="submit"
            className="achat-send"
            disabled={busy || !input.trim()}
            aria-label="Send"
          >
            <FiSend size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
