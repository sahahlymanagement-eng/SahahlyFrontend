import { useRef, useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiCopy, FiTrash2, FiUpload, FiUsers } from "react-icons/fi";
import { REJECTION_LABEL } from "./format";
import RosterPicker from "./RosterPicker";

const PAGE = 25;

/** The three ways to build a list. All three end at the same review table. */
const SOURCE_TABS = [
  ["sheet", "Excel sheet"],
  ["classroom", "Classroom"],
  ["partner", "Grading partner"],
];

const AUDIENCE_LABEL = { parent: "Parent", student: "Student" };

/**
 * Build a recipient list, then review exactly who will and will not be messaged.
 *
 * The review is the point of this panel, not decoration. A broadcast has no undo,
 * so every rejected row is shown with the reason AND the raw value it came from —
 * seeing "1/1/24" in a sheet's phone column is what tells someone Excel reformatted
 * it, and seeing a blank against a student is what tells them the roster is missing
 * a number, which no error message alone would convey.
 *
 * The source only affects how the list is PRODUCED. Removing a row here removes it
 * from what gets sent either way: the create request posts the reviewed list as
 * JSON rather than re-uploading or re-resolving, so edits made here are not undone
 * by the server.
 */
export default function RecipientImportPanel({
  mode,
  onModeChange,
  preview,
  recipients,
  importing,
  disabled,
  onFile,
  onRemoveRecipient,
  onClear,
  // Roster mode
  classrooms,
  partners,
  partnerAssignments,
  rosterSelection,
  loadingRosterOptions,
  onRosterChange,
  onLoadRoster,
}) {
  const fileInputRef = useRef(null);
  const [tab, setTab] = useState("valid");
  const [shown, setShown] = useState(PAGE);

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    // Clear straight away so picking the SAME file again still fires a change event.
    event.target.value = "";
    if (!file) return;
    setTab("valid");
    setShown(PAGE);
    onFile(file);
  };

  const invalid = preview?.invalid ?? [];
  const duplicates = preview?.duplicates ?? [];
  const detected = preview?.detectedColumns;
  // Roster previews carry a `source` block; sheet previews carry a filename.
  const source = preview?.source ?? null;
  const isRoster = Boolean(source) && source.kind !== "sheet";
  const showsAudience = isRoster && source.audience === "both";

  return (
    <section className="mws-card">
      <div className="mws-card-header">
        <h2 className="mws-card-title">
          <FiUsers size={15} /> Recipients
        </h2>
        <div className="wbc-actions">
          {preview ? (
            <button
              type="button"
              className="mws-btn mws-btn--ghost"
              onClick={onClear}
              disabled={disabled || importing}
            >
              <FiTrash2 aria-hidden="true" /> Clear list
            </button>
          ) : null}
          {mode === "sheet" ? (
            <>
              <button
                type="button"
                className="mws-btn mws-btn--primary"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || importing}
              >
                <FiUpload aria-hidden="true" />{" "}
                {importing ? "Reading…" : preview ? "Replace sheet" : "Upload Excel / CSV"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFile}
                style={{ display: "none" }}
              />
            </>
          ) : null}
        </div>
      </div>

      {/* Switching source clears the list: a half-swapped list, part sheet and part
          classroom, is the one thing nobody could review honestly. */}
      <div className="wbc-tabs" role="tablist">
        {SOURCE_TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            className={`wbc-tab ${mode === key ? "wbc-tab--on" : ""}`}
            onClick={() => {
              setTab("valid");
              setShown(PAGE);
              onModeChange(key);
            }}
            disabled={disabled || importing}
          >
            {label}
          </button>
        ))}
      </div>

      {mode !== "sheet" ? (
        <RosterPicker
          mode={mode}
          classrooms={classrooms}
          partners={partners}
          partnerAssignments={partnerAssignments}
          selection={rosterSelection}
          loadingOptions={loadingRosterOptions}
          loading={importing}
          disabled={disabled}
          onChange={onRosterChange}
          onLoad={() => {
            setTab("valid");
            setShown(PAGE);
            onLoadRoster();
          }}
        />
      ) : null}

      {!preview ? (
        mode === "sheet" ? (
          <p className="mws-hint">
            Upload a sheet with a name column and a phone column. Headings can be English or
            Arabic — <code>Name</code>/<code>الاسم</code> and <code>Phone</code>,{" "}
            <code>Mobile</code>, <code>WhatsApp</code>/<code>رقم الموبايل</code> are all
            recognised, and Egyptian numbers written as <code>01…</code> are handled. Nothing
            is sent at this stage: you will see the full list to check first.
          </p>
        ) : null
      ) : (
        <>
          <div className="wbc-stat-row">
            <div className="wbc-stat wbc-stat--ok">
              <span className="wbc-stat-value">{recipients.length}</span>
              <span className="wbc-stat-label">Will receive it</span>
            </div>
            <div className={`wbc-stat ${invalid.length ? "wbc-stat--warn" : ""}`}>
              <span className="wbc-stat-value">{invalid.length}</span>
              <span className="wbc-stat-label">
                {isRoster ? "No usable number" : "Cannot be sent"}
              </span>
            </div>
            <div className={`wbc-stat ${duplicates.length ? "wbc-stat--warn" : ""}`}>
              <span className="wbc-stat-value">{duplicates.length}</span>
              <span className="wbc-stat-label">Duplicates removed</span>
            </div>
            <div className="wbc-stat">
              <span className="wbc-stat-value">
                {isRoster ? preview.studentCount ?? 0 : preview.totalRows}
              </span>
              <span className="wbc-stat-label">{isRoster ? "Students" : "Rows in sheet"}</span>
            </div>
          </div>

          {isRoster ? (
            <p className="mws-note">
              Reading <strong>{source.label}</strong> — sending to{" "}
              <strong>
                {source.audience === "both"
                  ? "parents and students"
                  : source.audience === "parent"
                  ? "parents"
                  : "students"}
              </strong>
              . Numbers come from each student's saved contact details, so anything wrong
              here is fixed on the student record, not in this panel.
            </p>
          ) : (
            <p className="mws-note">
              Reading <strong>{preview.sourceFilename}</strong>
              {preview.sheetNames?.length > 1 ? ` (sheet “${preview.sheetName}”)` : ""} — names
              from <code>{detected?.name || "—"}</code>, numbers from{" "}
              <code>{detected?.phone}</code>.
              {detected?.detectedBy === "heuristic" ? (
                <>
                  {" "}
                  <FiAlertTriangle aria-hidden="true" /> These columns were{" "}
                  <strong>guessed</strong> because the headings weren’t recognised — check the
                  list below before sending.
                </>
              ) : null}
            </p>
          )}

          {preview.unnamedStudents ? (
            <p className="mws-error">
              <FiAlertTriangle aria-hidden="true" /> {preview.unnamedStudents} submission(s) on
              this assignment carry no student name, so they are not in this list at all. Fix
              the roster with the partner if that matters.
            </p>
          ) : null}

          {preview.droppedOverLimit > 0 ? (
            <p className="mws-error">
              {preview.droppedOverLimit} row(s) beyond the per-broadcast limit were dropped and
              will not be messaged.
            </p>
          ) : null}

          {preview.recentBroadcastsWithSameSheet?.length ? (
            <p className="mws-error">
              <FiAlertTriangle aria-hidden="true" /> This exact list of numbers was already
              broadcast to in the last 7 days. Sending again will message these people a second
              time — you’ll be asked to confirm.
            </p>
          ) : null}

          <div className="wbc-tabs" role="tablist">
            {[
              ["valid", `Will receive it (${recipients.length})`],
              [
                "invalid",
                `${isRoster ? "No usable number" : "Cannot be sent"} (${invalid.length})`,
              ],
              ["duplicates", `Duplicates (${duplicates.length})`],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                className={`wbc-tab ${tab === key ? "wbc-tab--on" : ""}`}
                onClick={() => {
                  setTab(key);
                  setShown(PAGE);
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "valid" ? (
            recipients.length ? (
              <RowTable
                rows={recipients.slice(0, shown)}
                total={recipients.length}
                shown={shown}
                onMore={() => setShown((n) => n + PAGE)}
                columns={[
                  "Row",
                  "Name",
                  ...(isRoster ? ["Student"] : []),
                  ...(showsAudience ? ["To"] : []),
                  "Number",
                  "",
                ]}
                render={(r, i) => (
                  <tr key={`${r.phoneDigits}-${i}`}>
                    <td data-label="Row">{r.rowNumber ?? "—"}</td>
                    <td data-label="Name">
                      {r.name || <span className="mws-mono">(no name)</span>}
                    </td>
                    {isRoster ? <td data-label="Student">{r.studentName || "—"}</td> : null}
                    {showsAudience ? (
                      <td data-label="To">{AUDIENCE_LABEL[r.audience] || "—"}</td>
                    ) : null}
                    <td data-label="Number" className="mws-mono">
                      {r.rawPhone}
                    </td>
                    <td data-label="">
                      <button
                        type="button"
                        className="mws-icon-btn mws-icon-btn--danger"
                        onClick={() => onRemoveRecipient(r.phoneDigits)}
                        disabled={disabled}
                        title="Remove from this broadcast"
                        aria-label={`Remove ${r.name || r.rawPhone}`}
                      >
                        <FiTrash2 />
                      </button>
                    </td>
                  </tr>
                )}
              />
            ) : (
              <p className="mws-empty">
                No sendable numbers here. Check the “
                {isRoster ? "No usable number" : "Cannot be sent"}” tab for why.
              </p>
            )
          ) : null}

          {tab === "invalid" ? (
            invalid.length ? (
              <RowTable
                rows={invalid.slice(0, shown)}
                total={invalid.length}
                shown={shown}
                onMore={() => setShown((n) => n + PAGE)}
                columns={[
                  "Row",
                  "Name",
                  ...(isRoster ? ["Student"] : []),
                  ...(showsAudience ? ["To"] : []),
                  isRoster ? "Number on file" : "Cell value",
                  "Why",
                ]}
                render={(r, i) => (
                  <tr key={`${r.rowNumber}-${i}`}>
                    <td data-label="Row">{r.rowNumber ?? "—"}</td>
                    <td data-label="Name">{r.name || "—"}</td>
                    {isRoster ? <td data-label="Student">{r.studentName || "—"}</td> : null}
                    {showsAudience ? (
                      <td data-label="To">{AUDIENCE_LABEL[r.audience] || "—"}</td>
                    ) : null}
                    {/* The raw value is the diagnostic: "1/1/24" tells them Excel ate it. */}
                    <td data-label="Value" className="mws-mono">
                      {r.rawPhone ?? <em>(blank)</em>}
                    </td>
                    <td data-label="Why">
                      <span className="mws-badge mws-badge--danger">
                        {REJECTION_LABEL[r.reason] || r.reason}
                      </span>
                      {r.message ? <div className="mws-note">{r.message}</div> : null}
                    </td>
                  </tr>
                )}
              />
            ) : (
              <p className="mws-empty">
                <FiCheckCircle aria-hidden="true" /> Everyone here had a usable number.
              </p>
            )
          ) : null}

          {tab === "duplicates" ? (
            duplicates.length ? (
              <RowTable
                rows={duplicates.slice(0, shown)}
                total={duplicates.length}
                shown={shown}
                onMore={() => setShown((n) => n + PAGE)}
                columns={[
                  "Row",
                  "Name",
                  ...(isRoster ? ["Student"] : []),
                  "Number",
                  "Same as",
                ]}
                render={(r, i) => (
                  <tr key={`${r.rowNumber}-${i}`}>
                    <td data-label="Row">{r.rowNumber ?? "—"}</td>
                    <td data-label="Name">{r.name || "—"}</td>
                    {isRoster ? <td data-label="Student">{r.studentName || "—"}</td> : null}
                    <td data-label="Number" className="mws-mono">
                      {r.rawPhone}
                    </td>
                    <td data-label="Same as">
                      <FiCopy aria-hidden="true" /> row {r.firstSeenRow}
                    </td>
                  </tr>
                )}
              />
            ) : (
              <p className="mws-empty">
                {isRoster
                  ? "No number appears twice — no siblings or shared phones in this list."
                  : "No repeated numbers in this sheet."}
              </p>
            )
          ) : null}
        </>
      )}
    </section>
  );
}

function RowTable({ rows, total, shown, onMore, columns, render }) {
  return (
    <>
      <div className="wbc-table-scroll">
        <table className="mws-table sah-table--cards">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>{rows.map(render)}</tbody>
        </table>
      </div>
      {shown < total ? (
        <button type="button" className="mws-btn mws-btn--ghost wbc-more" onClick={onMore}>
          Show more ({total - shown} left)
        </button>
      ) : null}
    </>
  );
}
