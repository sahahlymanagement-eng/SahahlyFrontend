import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  FiAlertTriangle,
  FiCheck,
  FiDownloadCloud,
  FiEdit2,
  FiRefreshCw,
  FiSearch,
  FiTrash2,
  FiUpload,
  FiUsers,
  FiX,
} from "react-icons/fi";
import {
  deletePartnerContact,
  importPartnerContacts,
  listPartnerStudents,
  partnerReportErr,
  savePartnerContact,
} from "../api/partnerReports";
import { confirmToast } from "../utils/confirmToast";
import Pagination from "./Pagination";

/** Rows per page. "All" stays available — a 272-student roster is still a
 *  reasonable thing to want in one scrollable list, e.g. to print or Ctrl+F. */
const PAGE_SIZES = [25, 50, 100];
const ALL_ROWS = "all";

/** "14 Aug 2026", or the raw value if it is not a date we can read. */
function formatSyncedAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/**
 * A number the partner sent that is NOT the one we would send to.
 *
 * There are two ways to get here and both are worth seeing. Either the partner's
 * number was rejected as unroutable (a placeholder, a truncated number) and the
 * saved one was left alone, or somebody edited this row by hand since the last
 * delivery — in which case the edit is living on borrowed time, because the
 * student's next submission overwrites it.
 *
 * Silent otherwise: on a healthy row the partner's number IS the saved one, and
 * repeating it under every phone would bury the handful that need attention.
 */
function UnusedPartnerNumber({ inUse, fromPartner, providerLabel }) {
  if (!fromPartner || fromPartner === inUse) return null;
  return (
    <span className="prw-cell-sub prw-cell-sub--warn">
      <FiAlertTriangle size={11} /> {providerLabel} sent {fromPartner} — not in use
    </span>
  );
}

/**
 * The partner student contact directory.
 *
 * The partners now send a parent phone, a student phone and both emails on every
 * new submission and resubmission, and the backend writes them straight in
 * (utils/partnerPayloadContacts.js). So this panel is no longer the only way a
 * number gets here — it is where you see what arrived, fill the gaps for students
 * whose latest submission predates that change, and correct anything wrong.
 *
 * The partner's own values WIN: the next submission a student hands in
 * overwrites what is saved here. That is why a hand-edited row says so, and why
 * the fix for a wrong number is to fix it in the partner's platform.
 *
 * Students are discovered from the partner's own submissions, so the list is
 * always exactly the people who have handed work in. Rows are matched to stored
 * contacts by the partner's student CODE where there is one, and otherwise by a
 * normalized form of the name (the backend's utils/partnerStudentKey.js) so that
 * "Ahmed  Hassan" and "ahmed hassan" are one person. Keying on the code is what
 * keeps two students who share a name from sharing a phone number.
 */
export default function PartnerContactsPanel({ slug, providerLabel, onContactsChanged }) {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [unnamed, setUnnamed] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importReport, setImportReport] = useState(null);
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPartnerStudents(slug);
      setStudents(data.students || []);
      setUnnamed(data.unnamed || 0);
    } catch (err) {
      toast.error(partnerReportErr(err, "Failed to load partner students"));
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.studentName.toLowerCase().includes(q) ||
        (s.parentName || "").toLowerCase().includes(q) ||
        (s.parentPhone || "").includes(q) ||
        (s.phone || "").includes(q) ||
        (s.parentEmail || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q)
    );
  }, [students, search]);

  // Paging is applied to the FILTERED list, never the other way round: the
  // search box matches every student the partner has ever sent us, not just the
  // page you happen to be looking at, and a hit on page 9 pulls that student
  // onto page 1 of the results. The stats and the counts below are whole-roster
  // for the same reason — a directory that reported "3 missing a number" when
  // it meant "3 on this page" would be worse than not reporting it.
  const perPage = pageSize === ALL_ROWS ? Math.max(filtered.length, 1) : pageSize;
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  // Clamped on read rather than corrected in an effect: a search that narrows
  // the list, or deleting the last contact on the final page, must not leave
  // you staring at an empty table with no way back.
  const safePage = Math.min(page, totalPages);
  const firstIndex = (safePage - 1) * perPage;
  const visible = filtered.slice(firstIndex, firstIndex + perPage);

  const missingCount = students.filter((s) => !s.hasContact).length;
  // Rows the partner's own payload has filled in at least once. Worth its own
  // number: it is the difference between "the directory is maintained by hand"
  // and "the directory maintains itself", and it is how you tell at a glance
  // whether the partner has started sending contacts for a given cohort.
  const fromPartnerCount = students.filter((s) => s.partnerData?.syncedAt).length;

  const startEdit = (student) => {
    setEditingKey(student.studentKey);
    setDraft({
      studentName: student.studentName || "",
      parentName: student.parentName || "",
      parentPhone: student.parentPhone || "",
      phone: student.phone || "",
      parentEmail: student.parentEmail || "",
      email: student.email || "",
      notes: student.notes || "",
    });
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setDraft({});
  };

  // Paging away from a row that is mid-edit would leave it in edit state with
  // its Save button off-screen, so the edit is dropped with the page.
  const goToPage = (next) => {
    setPage(Math.min(Math.max(1, next), totalPages));
    cancelEdit();
  };

  // Any change to what is being listed starts again at page 1 — landing on
  // page 4 of 2 results, or holding page 4 while the list changes underneath,
  // is never what was meant.
  const changeSearch = (value) => {
    setSearch(value);
    setPage(1);
  };

  const changePageSize = (value) => {
    setPageSize(value === ALL_ROWS ? ALL_ROWS : Number(value));
    setPage(1);
  };

  const saveEdit = async (student) => {
    setSaving(true);
    try {
      await savePartnerContact(slug, {
        studentKey: student.studentKey,
        studentName: draft.studentName?.trim() || student.studentName,
        parentName: draft.parentName?.trim() || null,
        parentPhone: draft.parentPhone?.trim() || null,
        phone: draft.phone?.trim() || null,
        parentEmail: draft.parentEmail?.trim() || null,
        email: draft.email?.trim() || null,
        notes: draft.notes?.trim() || null,
      });
      toast.success(`Saved contact for ${student.studentName}`);
      cancelEdit();
      await load();
      onContactsChanged?.();
    } catch (err) {
      toast.error(partnerReportErr(err, "Failed to save contact"));
    } finally {
      setSaving(false);
    }
  };

  const removeContact = async (student) => {
    const ok = await confirmToast(
      `Remove the saved numbers for ${student.studentName}? Their reports can no longer be sent` +
        `${student.partnerData?.syncedAt ? `, until ${providerLabel} sends them again on their next submission` : ""}.`
    );
    if (!ok) return;
    try {
      await deletePartnerContact(slug, student.studentKey);
      toast.success("Contact removed");
      await load();
      onContactsChanged?.();
    } catch (err) {
      toast.error(partnerReportErr(err, "Failed to remove contact"));
    }
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    // Clear the input straight away so picking the SAME file again still fires
    // a change event.
    event.target.value = "";
    if (!file) return;

    setImporting(true);
    setImportReport(null);
    try {
      const result = await importPartnerContacts(slug, file);
      setImportReport(result);
      if (result.imported > 0) {
        toast.success(`Imported ${result.imported} contact(s)`);
        await load();
        onContactsChanged?.();
      } else {
        toast.warn("Nothing was imported — check the column headings and phone numbers");
      }
    } catch (err) {
      toast.error(partnerReportErr(err, "Import failed"));
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="prw-panel">
      <div className="prw-panel-head">
        <div>
          <h2 className="prw-panel-title">
            <FiUsers size={15} /> {providerLabel} contacts
          </h2>
          <p className="prw-panel-sub">
            Parent reports go to the numbers saved here. {providerLabel} now sends them
            with each new submission; anything it does not cover is filled in below.
          </p>
        </div>
        <div className="prw-panel-actions">
          <button type="button" className="prw-btn prw-btn--ghost" onClick={load} disabled={loading}>
            <FiRefreshCw size={13} /> {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            className="prw-btn prw-btn--primary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            <FiUpload size={13} /> {importing ? "Importing…" : "Import Excel / CSV"}
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

      <div className="prw-stat-row">
        <div className="prw-stat">
          <span className="prw-stat-value">{students.length}</span>
          <span className="prw-stat-label">Students seen</span>
        </div>
        <div className={`prw-stat ${missingCount ? "prw-stat--warn" : "prw-stat--ok"}`}>
          <span className="prw-stat-value">{missingCount}</span>
          <span className="prw-stat-label">Missing a number</span>
        </div>
        <div className="prw-stat">
          <span className="prw-stat-value">{fromPartnerCount}</span>
          <span className="prw-stat-label">Sent by {providerLabel}</span>
        </div>
        {unnamed > 0 && (
          <div className="prw-stat prw-stat--warn">
            <span className="prw-stat-value">{unnamed}</span>
            <span className="prw-stat-label">Submissions with no student name</span>
          </div>
        )}
      </div>

      {unnamed > 0 && (
        <p className="prw-note prw-note--warn">
          <FiAlertTriangle size={13} /> {unnamed} submission(s) carry no student name in{" "}
          {providerLabel}&apos;s data, so they cannot be matched to a person or reported on.
          They need fixing in {providerLabel} itself.
        </p>
      )}

      <p className="prw-note">
        <FiDownloadCloud size={13} />
        <span>
          {providerLabel} sends a parent number, a student number and both emails with
          every new submission and resubmission, and those <strong>overwrite</strong> what
          is saved here when they arrive. So an edit below holds until that student hands
          in again — if a number is wrong, correcting it in {providerLabel} is what makes
          it stay corrected. Students whose last submission predates this still need
          filling in by hand or by import.
        </span>
      </p>

      <p className="prw-note">
        Import accepts any spreadsheet with a student-name column. Headings like{" "}
        <code>Student Name</code>, <code>Parent Name</code>, <code>Parent Phone</code>,{" "}
        <code>Student Phone</code>, <code>Parent Email</code>, <code>Email</code> and{" "}
        <code>Notes</code> are recognised in any order and any capitalisation. Rows with no
        phone number are reported back, not imported.
      </p>

      {importReport && (
        <div className="prw-import-report">
          <div className="prw-import-report-head">
            <strong>
              Import result: {importReport.imported} imported, {importReport.skipped} skipped
            </strong>
            <button type="button" className="prw-icon-btn" onClick={() => setImportReport(null)}>
              <FiX size={14} />
            </button>
          </div>
          {importReport.results?.some((r) => r.status === "skipped") && (
            <ul className="prw-import-skipped">
              {importReport.results
                .filter((r) => r.status === "skipped")
                .slice(0, 20)
                .map((r) => (
                  <li key={r.row}>
                    Row {r.row}
                    {r.studentName ? ` (${r.studentName})` : ""}: {r.reason}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      <div className="prw-search">
        <FiSearch size={14} />
        <input
          type="text"
          placeholder="Search all students, parents, numbers or emails…"
          value={search}
          onChange={(e) => changeSearch(e.target.value)}
        />
      </div>

      {loading && !students.length ? (
        <p className="prw-empty">Loading students…</p>
      ) : !filtered.length ? (
        <p className="prw-empty">
          {students.length
            ? "No students match that search."
            : `No submissions found for ${providerLabel} yet.`}
        </p>
      ) : (
        <>
        <div className="prw-table-meta">
          <span>
            Showing <strong>{firstIndex + 1}–{firstIndex + visible.length}</strong> of{" "}
            {filtered.length}
            {search.trim()
              ? ` student(s) matching “${search.trim()}” — searched across all ${students.length}`
              : " student(s)"}
          </span>
          <label className="prw-page-size">
            Rows per page
            <select
              className="prw-input"
              value={pageSize}
              onChange={(e) => changePageSize(e.target.value)}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
              <option value={ALL_ROWS}>All</option>
            </select>
          </label>
        </div>

        <div className="prw-table-wrap">
          {/* --stacked: cells here carry an email under the name and a warning
              under a number, so the row has to top-align. */}
          <table className="prw-table prw-table--stacked">
            <thead>
              <tr>
                <th>Student</th>
                <th>Parent name</th>
                <th>Parent WhatsApp</th>
                <th>Student WhatsApp</th>
                <th>Work</th>
                <th>Notes</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {visible.map((student) => {
                const editing = editingKey === student.studentKey;
                return (
                  <tr
                    key={student.studentKey}
                    className={!student.hasContact ? "prw-row--missing" : undefined}
                  >
                    <td data-label="Student">
                      {editing ? (
                        <>
                          <input
                            className="prw-input"
                            value={draft.studentName}
                            onChange={(e) => setDraft({ ...draft, studentName: e.target.value })}
                          />
                          <input
                            className="prw-input prw-input--sub"
                            type="email"
                            placeholder="Student email"
                            value={draft.email}
                            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                          />
                        </>
                      ) : (
                        <>
                          <span className="prw-student-name">{student.studentName}</span>
                          {!student.hasContact && (
                            <span className="prw-pill prw-pill--warn">No number</span>
                          )}
                          {student.partnerData?.syncedAt && (
                            <span
                              className="prw-pill prw-pill--muted"
                              title={`${providerLabel} last sent this student's contact details on ${formatSyncedAt(
                                student.partnerData.syncedAt
                              )}`}
                            >
                              From {providerLabel}
                            </span>
                          )}
                          {student.email && (
                            <span className="prw-cell-sub">{student.email}</span>
                          )}
                        </>
                      )}
                    </td>
                    <td data-label="Parent name">
                      {editing ? (
                        <>
                          <input
                            className="prw-input"
                            value={draft.parentName}
                            onChange={(e) => setDraft({ ...draft, parentName: e.target.value })}
                          />
                          <input
                            className="prw-input prw-input--sub"
                            type="email"
                            placeholder="Parent email"
                            value={draft.parentEmail}
                            onChange={(e) => setDraft({ ...draft, parentEmail: e.target.value })}
                          />
                        </>
                      ) : (
                        <>
                          {student.parentName || "—"}
                          {student.parentEmail && (
                            <span className="prw-cell-sub">{student.parentEmail}</span>
                          )}
                        </>
                      )}
                    </td>
                    <td data-label="Parent WhatsApp">
                      {editing ? (
                        <input
                          className="prw-input"
                          inputMode="tel"
                          placeholder="e.g. 01234567890"
                          value={draft.parentPhone}
                          onChange={(e) => setDraft({ ...draft, parentPhone: e.target.value })}
                        />
                      ) : (
                        <>
                          {student.parentPhone || "—"}
                          <UnusedPartnerNumber
                            inUse={student.parentPhone}
                            fromPartner={student.partnerData?.parentPhone}
                            providerLabel={providerLabel}
                          />
                        </>
                      )}
                    </td>
                    <td data-label="Student WhatsApp">
                      {editing ? (
                        <input
                          className="prw-input"
                          inputMode="tel"
                          value={draft.phone}
                          onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                        />
                      ) : (
                        <>
                          {student.phone || "—"}
                          <UnusedPartnerNumber
                            inUse={student.phone}
                            fromPartner={student.partnerData?.studentPhone}
                            providerLabel={providerLabel}
                          />
                        </>
                      )}
                    </td>
                    <td data-label="Work">
                      {student.submissionCount} submitted · {student.gradedCount} marked
                    </td>
                    <td data-label="Notes">
                      {editing ? (
                        <input
                          className="prw-input"
                          value={draft.notes}
                          onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                        />
                      ) : (
                        student.notes || "—"
                      )}
                    </td>
                    <td data-label="Actions" className="prw-actions-cell">
                      {editing ? (
                        <>
                          <button
                            type="button"
                            className="prw-icon-btn prw-icon-btn--ok"
                            title="Save"
                            disabled={saving}
                            onClick={() => saveEdit(student)}
                          >
                            <FiCheck size={14} />
                          </button>
                          <button
                            type="button"
                            className="prw-icon-btn"
                            title="Cancel"
                            onClick={cancelEdit}
                          >
                            <FiX size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="prw-icon-btn"
                            title="Edit numbers"
                            onClick={() => startEdit(student)}
                          >
                            <FiEdit2 size={14} />
                          </button>
                          {student.hasContact && (
                            <button
                              type="button"
                              className="prw-icon-btn prw-icon-btn--danger"
                              title="Remove saved numbers"
                              onClick={() => removeContact(student)}
                            >
                              <FiTrash2 size={14} />
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pagination page={safePage} totalPages={totalPages} onPageChange={goToPage} />
        </>
      )}
    </section>
  );
}
