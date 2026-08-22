import QuestionNumberBadge from "./QuestionNumberBadge";
import QuestionKeywordFields from "./QuestionKeywordFields";
import QuestionErrorTypePicker from "./QuestionErrorTypePicker";
import { MARKING_CHECKLIST_CONFIG } from "../constants/markingChecklist";
import { isBlankQuestion } from "../utils/blankQuestionFeedback";
import { alignExaminerFeedbackToMarks } from "../utils/syncExaminerFeedback";

const fieldLabel = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 4,
  color: "var(--muted)",
};

const textAreaStyle = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text-primary)",
  fontSize: 12,
  resize: "vertical",
  boxSizing: "border-box",
  fontFamily: "inherit",
  outline: "none",
};

export default function MarkingQuestionCard({
  question,
  index,
  guidance = "",
  allQuestions = [],
  onChange,
  getScoreColor,
  onRemove,
}) {
  const q = question || {};
  const awarded = Number(q.marksAwarded) || 0;
  const qMax = Math.max(0, Number(q.maxMarks) || 0);
  const color = getScoreColor(awarded, qMax || 1);
  const qPct = qMax > 0 ? Math.round((awarded / qMax) * 100) : 0;

  const update = (patch) => onChange(index, { ...q, ...patch });

  const setMarks = (nextAwarded, { mode = "prefix" } = {}) => {
    const max = Math.max(0, Number(q.maxMarks) || 0);
    const marksAwarded = Math.min(max, Math.max(0, Number(nextAwarded) || 0));
    let markPoints = q.markPoints;
    if (Array.isArray(markPoints) && markPoints.length) {
      if (marksAwarded >= max && max > 0) {
        markPoints = markPoints.map((p) => ({ ...p, awarded: true }));
      } else if (marksAwarded === 0) {
        markPoints = markPoints.map((p) => ({ ...p, awarded: false }));
      }
    }
    onChange(
      index,
      alignExaminerFeedbackToMarks({ ...q, marksAwarded, markPoints }, mode)
    );
  };

  const setMaxMarks = (nextMax, { mode = "prefix" } = {}) => {
    const max = Math.max(1, Number(nextMax) || 1);
    const marksAwarded = Math.min(max, Number(q.marksAwarded) || 0);
    onChange(
      index,
      alignExaminerFeedbackToMarks({ ...q, maxMarks: max, marksAwarded }, mode)
    );
  };

  const toggleChecklist = (key) => {
    const checklist = { ...(q.checklist || {}) };
    checklist[key] = !checklist[key];
    update({ checklist });
  };

  return (
    <div className="msv-q-card">
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <input
          type="text"
          value={q.questionNumber ?? ""}
          onChange={(e) => update({ questionNumber: e.target.value })}
          title="Mark-scheme question id"
          style={{
            width: 56,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid var(--border)",
            background: "var(--surface-2)",
            color: "var(--text-primary)",
            fontWeight: 700,
            fontSize: 13,
            textAlign: "center",
            outline: "none",
          }}
        />
        <QuestionNumberBadge question={q} guidance={guidance} allQuestions={allQuestions} />

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="number"
            min={0}
            max={qMax || 999}
            value={awarded}
            onChange={(e) => setMarks(e.target.value)}
            onBlur={() => setMarks(awarded, { mode: "full" })}
            style={{
              width: 52,
              padding: "4px 8px",
              borderRadius: 6,
              border: `1px solid ${color}`,
              background: `color-mix(in srgb, ${color} 15%, transparent)`,
              color,
              fontWeight: 700,
              fontSize: 14,
              textAlign: "center",
              outline: "none",
            }}
          />
          <span style={{ color: "var(--muted)", fontSize: 13 }}>/</span>
          <input
            type="number"
            min={1}
            max={999}
            value={qMax || 1}
            onChange={(e) => setMaxMarks(e.target.value)}
            onBlur={() => setMaxMarks(qMax || 1, { mode: "full" })}
            style={{
              width: 44,
              padding: "4px 6px",
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              color: "var(--text-primary)",
              fontSize: 13,
              textAlign: "center",
              outline: "none",
            }}
          />
        </div>

        <button
          type="button"
          onClick={() => setMarks(qMax, { mode: "full" })}
          title="Award full marks"
          style={{
            fontSize: 11,
            padding: "3px 8px",
            borderRadius: 6,
            border: "1px solid color-mix(in srgb, var(--success) 40%, transparent)",
            background: "color-mix(in srgb, var(--success) 12%, transparent)",
            color: "var(--success)",
            cursor: "pointer",
          }}
        >
          Full marks
        </button>
        <button
          type="button"
          onClick={() => setMarks(0, { mode: "full" })}
          title="Award zero marks"
          style={{
            fontSize: 11,
            padding: "3px 8px",
            borderRadius: 6,
            border: "1px solid color-mix(in srgb, var(--danger) 40%, transparent)",
            background: "color-mix(in srgb, var(--danger) 12%, transparent)",
            color: "var(--danger)",
            cursor: "pointer",
          }}
        >
          Zero
        </button>

        <div
          style={{
            flex: 1,
            minWidth: 60,
            height: 5,
            background: "color-mix(in srgb, var(--text-primary) 8%, transparent)",
            borderRadius: 3,
          }}
        >
          <div
            style={{
              width: `${qPct}%`,
              height: "100%",
              background: color,
              borderRadius: 3,
            }}
          />
        </div>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>{qPct}%</span>

        {typeof onRemove === "function" && (
          <button
            type="button"
            onClick={() => onRemove(index)}
            title="Remove question on Confirm Edits"
            style={{
              fontSize: 11,
              padding: "3px 8px",
              borderRadius: 6,
              border: "1px solid color-mix(in srgb, var(--danger) 35%, transparent)",
              background: "transparent",
              color: "var(--danger)",
              cursor: "pointer",
            }}
          >
            Remove
          </button>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 10 }}>
        {MARKING_CHECKLIST_CONFIG.map(({ key, label, passIsGood }) => {
          const val = q.checklist?.[key];
          const isGood = passIsGood ? val === true : val === false;
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleChecklist(key)}
              title="Click to toggle"
              style={{
                padding: "2px 8px",
                borderRadius: 12,
                fontSize: 11,
                cursor: "pointer",
                background: isGood
                  ? "color-mix(in srgb, var(--success) 10%, transparent)"
                  : "color-mix(in srgb, var(--danger) 10%, transparent)",
                color: isGood ? "var(--success)" : "var(--danger)",
                border: `1px solid ${
                  isGood
                    ? "color-mix(in srgb, var(--success) 20%, transparent)"
                    : "color-mix(in srgb, var(--danger) 20%, transparent)"
                }`,
              }}
            >
              {isGood ? "✅" : "❌"} {label}
            </button>
          );
        })}
      </div>

      {q.needsReview === true && (
        <div
          style={{
            fontSize: 11,
            color: "var(--warning)",
            marginBottom: 8,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid color-mix(in srgb, var(--warning) 35%, transparent)",
            background: "color-mix(in srgb, var(--warning) 10%, transparent)",
          }}
        >
          Flagged for review — a critical digit, sign, or choice could not be read reliably
        </div>
      )}

      {Array.isArray(q.markPoints) && q.markPoints.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={fieldLabel}>Mark points (score follows these ticks)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {q.markPoints.map((point, pointIndex) => (
              <label
                key={`${point.code || "P"}-${pointIndex}`}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={point.awarded === true}
                  onChange={() => {
                    const markPoints = q.markPoints.map((p, i) =>
                      i === pointIndex ? { ...p, awarded: !p.awarded } : p
                    );
                    const fromPoints = markPoints.reduce(
                      (sum, p) => sum + (p.awarded ? Number(p.marks) || 1 : 0),
                      0
                    );
                    const marksAwarded = Math.min(qMax, Math.max(0, fromPoints));
                    onChange(
                      index,
                      alignExaminerFeedbackToMarks(
                        { ...q, markPoints, marksAwarded },
                        "full"
                      )
                    );
                  }}
                  style={{ marginTop: 2 }}
                />
                <span>
                  <strong>{point.code || `P${pointIndex + 1}`}</strong>
                  {point.evidence || point.description || point.criterion || point.label
                    ? `: ${point.evidence || point.description || point.criterion || point.label}`
                    : point.awarded
                      ? ""
                      : ": not met"}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 8 }}>
        <div style={fieldLabel}>Final answer (last written value / MCQ)</div>
        <input
          type="text"
          value={q.studentFinalAnswer ?? ""}
          onChange={(e) => update({ studentFinalAnswer: e.target.value })}
          placeholder="e.g. x = 4, or C"
          style={{ ...textAreaStyle, resize: "none" }}
        />
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={fieldLabel}>Student answer (script)</div>
        <textarea
          value={q.studentAnswer ?? ""}
          onChange={(e) => update({ studentAnswer: e.target.value })}
          rows={2}
          placeholder="What the student wrote"
          style={textAreaStyle}
        />
        {isBlankQuestion(q) && (
          <div style={{ fontSize: 11, color: "var(--warning)", marginTop: 4 }}>
            Treated as blank / not attempted
          </div>
        )}
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={fieldLabel}>Model / correct answer</div>
        <textarea
          value={q.correctAnswer ?? ""}
          onChange={(e) => update({ correctAnswer: e.target.value })}
          rows={2}
          placeholder="Mark-scheme answer"
          style={textAreaStyle}
        />
      </div>

      <QuestionKeywordFields question={q} onChange={(updated) => onChange(index, updated)} />

      <div style={fieldLabel}>Examiner note (PDF feedback)</div>
      <textarea
        value={q.reason ?? ""}
        onChange={(e) => update({ reason: e.target.value })}
        rows={3}
        placeholder="Explanation shown on the marked PDF"
        style={textAreaStyle}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
        <div>
          <div style={fieldLabel}>Study topic</div>
          <input
            type="text"
            value={q.studyTopic ?? ""}
            onChange={(e) => update({ studyTopic: e.target.value })}
            style={{ ...textAreaStyle, resize: "none" }}
          />
        </div>
        <div>
          <div style={fieldLabel}>Revision advice</div>
          <input
            type="text"
            value={q.mistakeAdvice ?? ""}
            onChange={(e) => update({ mistakeAdvice: e.target.value })}
            style={{ ...textAreaStyle, resize: "none" }}
          />
        </div>
      </div>

      {/*
        Why the AI got this question wrong, in the reviewer's own words. Rendered
        for every question rather than only for ones whose mark moved: this card
        is not given the AI baseline, and adding a prop for it would mean editing
        all four Results pages — where controls reliably reach three of the four
        and the column comes back half-populated with nothing to show it.

        Left unset it stores null, which is the honest reading of "nobody
        classified this". Reporting keys off editedByAssistant, so a type set on
        a question nobody changed never counts as a correction.
      */}
      <div style={{ marginTop: 8 }}>
        <QuestionErrorTypePicker
          value={q.errorType ?? null}
          onChange={(errorType) => update({ errorType })}
        />
      </div>
    </div>
  );
}
