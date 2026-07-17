import { useCallback, useEffect, useRef, useState } from "react";
import api from "../../api/api";
import { TeacherPageHeader } from "./TeacherUI";
import { FiSend, FiPlus, FiCpu, FiUser, FiZap } from "react-icons/fi";
import "./teacher.css";
import "./TeacherChatbot.css";

const SUGGESTIONS = [
  "Prepare a report on one of my classes",
  "Which students need the most support?",
  "Summarize the latest assignment results",
  "How is the attendance this month?",
];

const STORAGE_KEY = "sahahly-teacher-chatbot";

/** Minimal safe markdown → HTML (bold, bullets, headings, line breaks). */
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

export default function TeacherChatbot() {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastMatched, setLastMatched] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved));
    } catch {
      /* ignore corrupted session state */
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* ignore quota errors */
    }
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, loading]);

  const send = useCallback(
    async (text) => {
      const content = String(text ?? input).trim();
      if (!content || loading || !user?.id) return;

      const nextMessages = [...messages, { role: "user", content }];
      setMessages(nextMessages);
      setInput("");
      setLoading(true);
      setLastMatched(null);

      try {
        const { data } = await api.post("/teacher-chatbot/chat", {
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

  const newChat = () => {
    setMessages([]);
    setLastMatched(null);
    sessionStorage.removeItem(STORAGE_KEY);
    inputRef.current?.focus();
  };

  const matchedChips = [
    ...(lastMatched?.classrooms || []).map((n) => ({ type: "class", name: n })),
    ...(lastMatched?.students || []).map((n) => ({ type: "student", name: n })),
  ];

  return (
    <div className="tch-page tch-page--wide tchat-page">
      <TeacherPageHeader
        eyebrow="AI Assistant"
        title="Chatbot"
        subtitle="Ask about your classes and students — reports, performance, attendance, and more."
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
              <h3>What would you like to know?</h3>
              <p>
                I can see your classes, assignments, grades, and attendance.
                Mention a class or student by name for detailed answers.
              </p>
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
                  key={i}
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
                        // renderMarkdown escapes HTML before adding formatting tags
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
            placeholder='Ask anything — e.g. "How is Malak doing this year?" or "Prepare a report on AS Biology"'
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={loading}
          />
          <button
            type="submit"
            className="tchat-send"
            disabled={loading || !input.trim()}
            aria-label="Send message"
          >
            <FiSend size={16} />
          </button>
        </form>
      </div>
    </div>
  );
}
