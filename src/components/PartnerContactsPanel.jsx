import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import {
  FiAlertTriangle,
  FiCheck,
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

/**
 * The partner student contact directory.
 *
 * This panel exists because a grading partner sends us a student NAME and
 * nothing else — no phone number, and its API has no contacts endpoint. Without
 * a number here, no parent-facing partner report can be delivered at all, which
 * is why the header leads with how many students are still missing one.
 *
 * Students are discovered from the partner's own submissions, so the list is
 * always exactly the people who have handed work in. Rows are matched to stored
 * contacts by a normalized form of the name (the backend's
 * utils/partnerStudentKey.js), so "Ahmed  Hassan" and "ahmed hassan" are one
 * person.
 */
export default function PartnerContactsPanel({ slug, providerLabel, onContactsChanged }) {
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState([]);
  const [unnamed, setUnnamed] = useState(0);
  const [search, setSearch] = useState("");
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
        (s.phone || "").includes(q)
    );
  }, [students, search]);

  const missingCount = students.filter((s) => !s.hasContact).length;

  const startEdit = (student) => {
    setEditingKey(student.studentKey);
    setDraft({
      studentName: student.studentName || "",
      parentName: student.parentName || "",
      parentPhone: student.parentPhone || "",
      phone: student.phone || "",
      notes: student.notes || "",
    });
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setDraft({});
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
      `Remove the saved numbers for ${student.studentName}? Their reports can no longer be sent.`
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
            {providerLabel} sends us a student name but never a phone number, so parent
            reports can only go to numbers saved here.
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
        Import accepts any spreadsheet with a student-name column. Headings like{" "}
        <code>Student Name</code>, <code>Parent Name</code>, <code>Parent Phone</code>,{" "}
        <code>Student Phone</code> and <code>Notes</code> are recognised in any order and
        any capitalisation. Rows with no phone number are reported back, not imported.
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
          placeholder="Search students, parents or numbers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
        <div className="prw-table-wrap">
          <table className="prw-table">
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
              {filtered.map((student) => {
                const editing = editingKey === student.studentKey;
                return (
                  <tr
                    key={student.studentKey}
                    className={!student.hasContact ? "prw-row--missing" : undefined}
                  >
                    <td data-label="Student">
                      {editing ? (
                        <input
                          className="prw-input"
                          value={draft.studentName}
                          onChange={(e) => setDraft({ ...draft, studentName: e.target.value })}
                        />
                      ) : (
                        <>
                          <span className="prw-student-name">{student.studentName}</span>
                          {!student.hasContact && (
                            <span className="prw-pill prw-pill--warn">No number</span>
                          )}
                        </>
                      )}
                    </td>
                    <td data-label="Parent name">
                      {editing ? (
                        <input
                          className="prw-input"
                          value={draft.parentName}
                          onChange={(e) => setDraft({ ...draft, parentName: e.target.value })}
                        />
                      ) : (
                        student.parentName || "—"
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
                        student.parentPhone || "—"
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
                        student.phone || "—"
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
      )}
    </section>
  );
}
