/**
 * Exam board + subject pickers for the marking guidance modal.
 */
export default function ExamBoardGuidanceFields({
  boards,
  subjects,
  board,
  setBoard,
  subjectKey,
  setSubjectKey,
  subjectLabel,
  subjectLocked,
  loadingSubject,
  loadingGuidance,
  guidanceError,
}) {
  const selectedSubject = subjects.find((s) => s.key === subjectKey);

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <div>
          <label
            style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}
          >
            Exam board
          </label>
          <select
            className="msv-gemini-select"
            value={board}
            onChange={(e) => setBoard(e.target.value)}
          >
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            style={{ fontSize: 12, color: "var(--muted)", display: "block", marginBottom: 6 }}
          >
            Subject
            {subjectLocked && subjectLabel ? (
              <span style={{ marginLeft: 6, fontWeight: 500, color: "var(--text-primary)" }}>
                (from classroom)
              </span>
            ) : null}
          </label>
          {subjectLocked && subjectKey ? (
            <div
              style={{
                padding: "9px 12px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface-2)",
                fontSize: 13,
              }}
            >
              {selectedSubject?.label || subjectLabel || "—"}
            </div>
          ) : (
            <select
              className="msv-gemini-select"
              value={subjectKey}
              onChange={(e) => setSubjectKey(e.target.value)}
              disabled={loadingSubject}
            >
              <option value="">
                {loadingSubject ? "Loading subject…" : "Select subject…"}
              </option>
              {subjects.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          {!subjectLocked && subjectLabel && !subjectKey ? (
            <div style={{ fontSize: 11, color: "var(--warning)", marginTop: 6 }}>
              Classroom subject is &quot;{subjectLabel}&quot; — pick the closest match above.
            </div>
          ) : null}
        </div>
      </div>

      {board === "cambridge" && subjectKey ? (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
          Prompt uses hardcoded Cambridge {selectedSubject?.label || "subject"} marking rules (no
          guidance PDF).
        </div>
      ) : null}

      {board === "edexcel" && subjectKey ? (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
          Prompt uses hardcoded Cambridge {selectedSubject?.label || "subject"} rules + overall
          Edexcel rules (no guidance PDF).
        </div>
      ) : null}

      {loadingGuidance ? (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>
          Loading exam board guidance…
        </div>
      ) : null}
      {guidanceError ? (
        <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 8 }}>{guidanceError}</div>
      ) : null}
    </div>
  );
}
