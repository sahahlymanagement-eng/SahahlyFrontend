import { useRef, useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiCopy, FiTrash2, FiUpload, FiUsers } from "react-icons/fi";
import { REJECTION_LABEL } from "./format";

const PAGE = 25;

/**
 * Upload a sheet, then review exactly who will and will not be messaged.
 *
 * The review is the point of this panel, not decoration. A broadcast has no undo,
 * so every row the parser rejected is shown with the reason AND the raw cell value
 * as it appeared in the sheet — seeing "1/1/24" in the phone column is what tells
 * someone Excel reformatted it, which no error message alone would convey.
 *
 * Removing a row here removes it from what gets sent: the create request posts the
 * reviewed list as JSON rather than re-uploading the file, so edits made here are
 * not undone by a re-parse on the server.
 */
export default function RecipientImportPanel({
  preview,
  recipients,
  importing,
  disabled,
  onFile,
  onRemoveRecipient,
  onClear,
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
          <button
            type="button"
            className="mws-btn mws-btn--primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || importing}
          >
            <FiUpload aria-hidden="true" /> {importing ? "Reading…" : preview ? "Replace sheet" : "Upload Excel / CSV"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFile}
            style={{ display: "none" }}
          />
        </div>
      </div>

      {!preview ? (
        <p className="mws-hint">
          Upload a sheet with a name column and a phone column. Headings can be English or
          Arabic — <code>Name</code>/<code>الاسم</code> and <code>Phone</code>,{" "}
          <code>Mobile</code>, <code>WhatsApp</code>/<code>رقم الموبايل</code> are all
          recognised, and Egyptian numbers written as <code>01…</code> are handled. Nothing
          is sent at this stage: you will see the full list to check first.
        </p>
      ) : (
        <>
          <div className="wbc-stat-row">
            <div className="wbc-stat wbc-stat--ok">
              <span className="wbc-stat-value">{recipients.length}</span>
              <span className="wbc-stat-label">Will receive it</span>
            </div>
            <div className={`wbc-stat ${invalid.length ? "wbc-stat--warn" : ""}`}>
              <span className="wbc-stat-value">{invalid.length}</span>
              <span className="wbc-stat-label">Cannot be sent</span>
            </div>
            <div className={`wbc-stat ${duplicates.length ? "wbc-stat--warn" : ""}`}>
              <span className="wbc-stat-value">{duplicates.length}</span>
              <span className="wbc-stat-label">Duplicates removed</span>
            </div>
            <div className="wbc-stat">
              <span className="wbc-stat-value">{preview.totalRows}</span>
              <span className="wbc-stat-label">Rows in sheet</span>
            </div>
          </div>

          <p className="mws-note">
            Reading <strong>{preview.sourceFilename}</strong>
            {preview.sheetNames?.length > 1 ? ` (sheet “${preview.sheetName}”)` : ""} — names from{" "}
            <code>{detected?.name || "—"}</code>, numbers from <code>{detected?.phone}</code>.
            {detected?.detectedBy === "heuristic" ? (
              <>
                {" "}
                <FiAlertTriangle aria-hidden="true" /> These columns were <strong>guessed</strong>{" "}
                because the headings weren’t recognised — check the list below before sending.
              </>
            ) : null}
          </p>

          {preview.droppedOverLimit > 0 ? (
            <p className="mws-error">
              {preview.droppedOverLimit} row(s) beyond the per-broadcast limit were dropped and
              will not be messaged.
            </p>
          ) : null}

          {preview.recentBroadcastsWithSameSheet?.length ? (
            <p className="mws-error">
              <FiAlertTriangle aria-hidden="true" /> This exact sheet was already used for a
              broadcast in the last 7 days. Sending again will message these people a second
              time — you’ll be asked to confirm.
            </p>
          ) : null}

          <div className="wbc-tabs" role="tablist">
            {[
              ["valid", `Will receive it (${recipients.length})`],
              ["invalid", `Cannot be sent (${invalid.length})`],
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
                columns={["Row", "Name", "Number", ""]}
                render={(r, i) => (
                  <tr key={`${r.phoneDigits}-${i}`}>
                    <td data-label="Row">{r.rowNumber ?? "—"}</td>
                    <td data-label="Name">
                      {r.name || <span className="mws-mono">(no name)</span>}
                    </td>
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
                No sendable numbers in this sheet. Check the “Cannot be sent” tab for why.
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
                columns={["Row", "Name", "Cell value", "Why"]}
                render={(r, i) => (
                  <tr key={`${r.rowNumber}-${i}`}>
                    <td data-label="Row">{r.rowNumber ?? "—"}</td>
                    <td data-label="Name">{r.name || "—"}</td>
                    {/* The raw value is the diagnostic: "1/1/24" tells them Excel ate it. */}
                    <td data-label="Cell value" className="mws-mono">
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
                <FiCheckCircle aria-hidden="true" /> Every row in the sheet had a usable number.
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
                columns={["Row", "Name", "Number", "Same as"]}
                render={(r, i) => (
                  <tr key={`${r.rowNumber}-${i}`}>
                    <td data-label="Row">{r.rowNumber ?? "—"}</td>
                    <td data-label="Name">{r.name || "—"}</td>
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
              <p className="mws-empty">No repeated numbers in this sheet.</p>
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
