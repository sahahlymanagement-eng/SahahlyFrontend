import { useEffect, useState } from "react";
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

/** Parse marks from an input; empty/partial typing returns null (don't commit yet). */
function parseMarksInput(raw) {
  const s = String(raw ?? "").trim();
  if (s === "" || s === "-" || s === "." || s === "-.") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

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
  const awarded = Number.isFinite(Number(q.marksAwarded)) ? Number(q.marksAwarded) : 0;
  const qMax = Math.max(0, Number(q.maxMarks) || 0);
  const color = getScoreColor(awarded, qMax || 1);
  const qPct = qMax > 0 ? Math.round((awarded / qMax) * 100) : 0;

  // Local draft so typing "0" / clearing the field is not fought by controlled
  // Number(value)||0 snapping, and blur commits the real input (not a stale prop).
  const [marksDraft, setMarksDraft] = useState(null);
  const [maxDraft, setMaxDraft] = useState(null);

  useEffect(() => {
    setMarksDraft(null);
    setMaxDraft(null);
  }, [index, q.questionNumber]);

  const update = (patch) => onChange(index, { ...q, ...patch });

  const setMarks = (nextAwarded, { mode = "prefix" } = {}) => {
    const max = Math.max(0, Number(q.maxMarks) || 0);
    const parsed = Number(nextAwarded);
    const marksAwarded = Math.min(
      max,
      Math.max(0, Number.isFinite(parsed) ? parsed : 0)
    );
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
      alignExaminerFeedbackToMarks({ ...q, marksAwarded, markPoints }, mode, {
        preferMarksOverBlank: true,
      })
    );
  };

  const setMaxMarks = (nextMax, { mode = "prefix" } = {}) => {
    const parsed = Number(nextMax);
    const max = Math.max(1, Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
    const currentAwarded = Number.isFinite(Number(q.marksAwarded))
      ? Number(q.marksAwarded)
      : 0;
    const marksAwarded = Math.min(max, Math.max(0, currentAwarded));
    onChange(
      index,
      alignExaminerFeedbackToMarks({ ...q, maxMarks: max, marksAwarded }, mode, {
        preferMarksOverBlank: true,
      })
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
            step="any"
            value={marksDraft !== null ? marksDraft : awarded}
            onFocus={() => setMarksDraft(String(awarded))}
            onChange={(e) => {
              const raw = e.target.value;
              setMarksDraft(raw);
              const n = parseMarksInput(raw);
              if (n != null) setMarks(n);
            }}
            onBlur={(e) => {
              const n = parseMarksInput(e.target.value);
              setMarks(n != null ? n : 0, { mode: "full" });
              setMarksDraft(null);
            }}
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
            step="any"
            value={maxDraft !== null ? maxDraft : qMax || 1}
            onFocus={() => setMaxDraft(String(qMax || 1))}
            onChange={(e) => {
              const raw = e.target.value;
              setMaxDraft(raw);
              const n = parseMarksInput(raw);
              if (n != null && n >= 1) setMaxMarks(n);
            }}
            onBlur={(e) => {
              const n = parseMarksInput(e.target.value);
              setMaxMarks(n != null && n >= 1 ? n : 1, { mode: "full" });
              setMaxDraft(null);
            }}
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
          onClick={() => {
            setMarksDraft(null);
            setMarks(qMax, { mode: "full" });
          }}
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
          onClick={() => {
            setMarksDraft("0");
            setMarks(0, { mode: "full" });
          }}
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

      {/*
        Scope flags from utils/questionDisplayOrder.js. These answer two
        questions a reviewer cannot otherwise tell apart from a bare 0/N row:
        did the student not answer it, or was it never really asked?
      */}
      {q._scopeFlags?.notAnswered && (
        <div style={{
            fontSize: 11,
            color: "var(--warning)",
            marginBottom: 8,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid color-mix(in srgb, var(--warning) 35%, transparent)",
            background: "color-mix(in srgb, var(--warning) 10%, transparent)",
          }}>
          {q._scopeFlags.notDetected
            ? "Not found on the script - this question was not detected during automated marking. Check the paper and award marks manually if the student did answer it."
            : "Not answered - the student left this question blank."}
        </div>
      )}

      {q._scopeFlags?.markSchemeOnly && (
        <div style={{
            fontSize: 11,
            color: "var(--warning)",
            marginBottom: 8,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid color-mix(in srgb, var(--warning) 35%, transparent)",
            background: "color-mix(in srgb, var(--warning) 10%, transparent)",
          }}>
          In the mark scheme but not found on the question paper - this question
          may not have been asked. Verify before counting it against the student.
        </div>
      )}

      {q._scopeFlags?.offInventory && (
        <div style={{
            fontSize: 11,
            color: "var(--warning)",
            marginBottom: 8,
            padding: "4px 8px",
            borderRadius: 6,
            border: "1px solid color-mix(in srgb, var(--warning) 35%, transparent)",
            background: "color-mix(in srgb, var(--warning) 10%, transparent)",
          }}>
          Not in the assignment question list - graded anyway, and its marks are
          counted in the total. Confirm it belongs to this assignment.
        </div>
      )}

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

      {/*
        REGRESSION: markingGroundingCheck.js has computed these flags on every
        marked paper all along (see groundingFlags / groundingReviewCount in
        markingGrades.js), but nothing anywhere in the frontend ever rendered
        them — a suspected mark-scheme-copy answer had no visible signal to
        the human reviewing the paper. Mirrors the needsReview badge above.
        Coverage/award contradictions (coverageContradictionCheck.js) render
        through this same badge on purpose: one visual language for "this needs
        a second look", rather than a new badge style per integrity check.
      */}
      {(q.groundingFlags?.length > 0 || q.coverageFlags?.length > 0 || q.ruleFlags?.length > 0) && (
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
          {[...(q.groundingFlags || []), ...(q.coverageFlags || []), ...(q.ruleFlags || [])].map((flag, flagIndex) => (
            <div key={`${flag.code || "FLAG"}-${flagIndex}`}>
              ⚠ {flag.detail || "This answer may not be grounded in the student's own script — verify against the scan."}
            </div>
          ))}
        </div>
      )}

      {Array.isArray(q.markPoints) && q.markPoints.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={fieldLabel}>Mark points (score follows these ticks)</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {q.markPoints.map((point, pointIndex) => {
              const evidenceText = String(
                point.evidence ||
                  point.description ||
                  point.criterion ||
                  point.label ||
                  point.text ||
                  ""
              );
              return (
                <div
                  key={`${point.code || "P"}-${pointIndex}`}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    fontSize: 12,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={point.awarded === true}
                    title="Award this mark point"
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
                          "full",
                          { preferMarksOverBlank: true }
                        )
                      );
                    }}
                    style={{ marginTop: 8 }}
                  />
                  <input
                    type="text"
                    value={point.code || ""}
                    title="Mark point code (e.g. B1)"
                    placeholder={`P${pointIndex + 1}`}
                    onChange={(e) => {
                      const markPoints = q.markPoints.map((p, i) =>
                        i === pointIndex ? { ...p, code: e.target.value } : p
                      );
                      update({ markPoints });
                    }}
                    style={{
                      ...textAreaStyle,
                      width: 56,
                      flex: "0 0 56px",
                      resize: "none",
                      padding: "6px 8px",
                      fontWeight: 700,
                      textAlign: "center",
                    }}
                  />
                  <input
                    type="text"
                    value={evidenceText}
                    title="Mark point text shown on the annotated PDF"
                    placeholder="What this mark point requires / notes"
                    onChange={(e) => {
                      const nextEvidence = e.target.value;
                      const markPoints = q.markPoints.map((p, i) =>
                        i === pointIndex
                          ? {
                              ...p,
                              evidence: nextEvidence,
                              // Keep PDF text in sync with the edited field —
                              // annotatePdf prefers evidence, then these aliases.
                              description: undefined,
                              criterion: undefined,
                              label: undefined,
                              text: undefined,
                            }
                          : p
                      );
                      update({ markPoints });
                    }}
                    style={{
                      ...textAreaStyle,
                      flex: 1,
                      resize: "none",
                      padding: "6px 8px",
                    }}
                  />
                </div>
              );
            })}
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
