import { useEffect, useMemo, useState } from "react";
import api from "../api/api";
import { toast } from "react-toastify";
import {
  FiUsers, FiDownload, FiFileText, FiCalendar, FiArrowLeft, FiCopy, FiSend,
} from "react-icons/fi";
import { usePagination } from "../hooks/usePagination";
import Pagination from "./Pagination";
import "./MonthlyParentReport.css";

function currentYearMonth() {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export default function MonthlyParentReportWorkspace({
  variant = "manager",
  onBack,
}) {
  const isTeacher = variant === "teacher";
  const [user, setUser] = useState(null);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [previewStudent, setPreviewStudent] = useState(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState(() => new Set());
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [classroomSearch, setClassroomSearch] = useState("");
  const [monthOptions, setMonthOptions] = useState([]);
  const [{ year, month }, setYearMonth] = useState(currentYearMonth);
  const [report, setReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
    api.get("/reports/monthly-parent/months")
      .then(({ data }) => setMonthOptions(data.months || []))
      .catch(() => {
        const now = new Date();
        setMonthOptions([{
          year: now.getFullYear(),
          month: now.getMonth() + 1,
          label: now.toLocaleString("en", { month: "long", year: "numeric" }),
        }]);
      });
  }, []);

  const classroomParams = useMemo(() => {
    if (isTeacher) return { search: classroomSearch };
    return { personId: user?.id, search: classroomSearch };
  }, [isTeacher, user?.id, classroomSearch]);

  const classroomsUrl = isTeacher
    ? user?.id
      ? `/google-classroom/teacher-courses/${user.id}`
      : "/google-classroom/teacher-courses/_"
    : "/students/my-classrooms";

  const {
    data: classrooms,
    page: classroomPage,
    totalPages: classroomTotalPages,
    fetchPage: fetchClassroomPage,
  } = usePagination(classroomsUrl, classroomParams, 20, "data", !!user?.id);

  useEffect(() => {
    if (!selectedClassroom?._id) {
      setStudents([]);
      setPreviewStudent(null);
      setSelectedStudentIds(new Set());
      return;
    }
    setLoadingStudents(true);
    api.get("/reports/monthly-parent/students", {
      params: { classroomId: selectedClassroom._id },
    })
      .then(({ data }) => setStudents(data.students || []))
      .catch(() => toast.error("Failed to load students"))
      .finally(() => setLoadingStudents(false));
  }, [selectedClassroom?._id]);

  useEffect(() => {
    if (!selectedClassroom?._id || !previewStudent?._id) {
      setReport(null);
      return;
    }
    setLoadingReport(true);
    api.get("/reports/monthly-parent/preview", {
      params: {
        classroomId: selectedClassroom._id,
        studentId: previewStudent._id,
        year,
        month,
      },
    })
      .then(({ data }) => setReport(data.report))
      .catch((err) => {
        setReport(null);
        toast.error(err.response?.data?.message || "Failed to load report preview");
      })
      .finally(() => setLoadingReport(false));
  }, [selectedClassroom?._id, previewStudent?._id, year, month]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => String(s.name || "").toLowerCase().includes(q));
  }, [students, studentSearch]);

  const selectedMonthLabel = useMemo(() => {
    const match = monthOptions.find((m) => m.year === year && m.month === month);
    return match?.label || `${month}/${year}`;
  }, [monthOptions, year, month]);

  const selectedCount = selectedStudentIds.size;
  const selectedWithParentPhone = useMemo(
    () => students.filter(
      (s) => selectedStudentIds.has(String(s._id)) && s.parentPhone
    ).length,
    [students, selectedStudentIds]
  );

  const previewHasParentPhone = Boolean(previewStudent?.parentPhone);

  const toggleStudentSelection = (studentId) => {
    const id = String(studentId);
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedStudentIds((prev) => {
      const next = new Set(prev);
      filteredStudents.forEach((s) => next.add(String(s._id)));
      return next;
    });
  };

  const clearSelection = () => setSelectedStudentIds(new Set());

  const downloadPdf = async () => {
    if (!selectedClassroom?._id || !previewStudent?._id) return;
    setDownloading(true);
    try {
      const res = await api.get("/reports/monthly-parent/pdf", {
        params: {
          classroomId: selectedClassroom._id,
          studentId: previewStudent._id,
          year,
          month,
        },
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${previewStudent.name || "student"}_${selectedMonthLabel.replace(/\s+/g, "_")}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("PDF downloaded");
    } catch {
      toast.error("Failed to download PDF");
    } finally {
      setDownloading(false);
    }
  };

  const sendWhatsApp = async (studentIds) => {
    if (!selectedClassroom?._id || !studentIds.length) return;

    const withoutPhone = students.filter(
      (s) => studentIds.includes(String(s._id)) && !s.parentPhone
    );
    if (withoutPhone.length) {
      toast.warn(
        `${withoutPhone.length} student(s) skipped — no parent phone on file`
      );
    }

    const idsToSend = studentIds.filter((id) => {
      const student = students.find((s) => String(s._id) === String(id));
      return student?.parentPhone;
    });

    if (!idsToSend.length) {
      toast.error("No selected students have a parent phone number");
      return;
    }

    setSendingWhatsApp(true);
    try {
      const payload = {
        classroomId: selectedClassroom._id,
        year,
        month,
      };

      if (idsToSend.length === 1) {
        payload.studentId = idsToSend[0];
      } else {
        payload.studentIds = idsToSend;
      }

      const { data } = await api.post("/reports/monthly-parent/send-whatsapp", payload);
      const sent = data.sent ?? 0;
      const failed = data.failed ?? 0;
      if (sent > 0) {
        toast.success(`Sent to ${sent} parent(s) on WhatsApp${failed ? ` (${failed} failed)` : ""}`);
      } else {
        toast.error("Failed to send reports on WhatsApp");
      }
      if (idsToSend.length > 1) clearSelection();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to send on WhatsApp");
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const sendPreviewToParent = () => {
    if (!previewStudent?._id) return;
    sendWhatsApp([String(previewStudent._id)]);
  };

  const sendBulkToParents = () => {
    sendWhatsApp([...selectedStudentIds]);
  };

  const copyParentMessage = async () => {
    if (!report?.parentMessage) return;
    try {
      await navigator.clipboard.writeText(report.parentMessage);
      toast.success("Parent message copied");
    } catch {
      toast.error("Could not copy message");
    }
  };

  if (!user) return null;

  return (
    <div className="mpr-root">
      <header className="mpr-header">
        <div className="mpr-header-left">
          <button type="button" className="mpr-back-btn" onClick={onBack}>
            <FiArrowLeft size={14} /> Assignment Reports
          </button>
          <div>
            <h1 className="mpr-title">Monthly Parent Reports</h1>
            <p className="mpr-subtitle">
              Branded PDF progress report with summary message for parents
            </p>
          </div>
        </div>
        <div className="mpr-header-actions">
          {selectedCount > 0 && (
            <button
              type="button"
              className="mpr-btn mpr-btn--whatsapp"
              onClick={sendBulkToParents}
              disabled={sendingWhatsApp || selectedWithParentPhone === 0}
            >
              <FiSend size={14} />
              {sendingWhatsApp
                ? "Sending…"
                : `Send to ${selectedWithParentPhone} Parent${selectedWithParentPhone !== 1 ? "s" : ""}`}
            </button>
          )}
          {report && previewStudent && (
            <>
              <button
                type="button"
                className="mpr-btn mpr-btn--ghost"
                onClick={copyParentMessage}
              >
                <FiCopy size={14} /> Copy Summary
              </button>
              <button
                type="button"
                className="mpr-btn mpr-btn--primary"
                onClick={downloadPdf}
                disabled={downloading}
              >
                <FiDownload size={14} />
                {downloading ? "Generating…" : "Download PDF"}
              </button>
              <button
                type="button"
                className="mpr-btn mpr-btn--whatsapp"
                onClick={sendPreviewToParent}
                disabled={sendingWhatsApp || !previewHasParentPhone}
                title={previewHasParentPhone ? "Send PDF to parent WhatsApp" : "No parent phone on file"}
              >
                <FiSend size={14} />
                {sendingWhatsApp ? "Sending…" : "Send to Parent WhatsApp"}
              </button>
            </>
          )}
        </div>
      </header>

      <div className="mpr-content">
        <div className="mpr-layout">
          <section className="mpr-panel">
            <p className="mpr-panel-label"><FiUsers size={13} /> Classroom</p>
            {!selectedClassroom ? (
              <>
                <input
                  className="mpr-search"
                  placeholder="Search classrooms…"
                  value={classroomSearch}
                  onChange={(e) => setClassroomSearch(e.target.value)}
                />
                <div className="mpr-scroll">
                  {classrooms.map((c) => (
                    <button
                      key={c._id}
                      type="button"
                      className="mpr-card"
                      onClick={() => {
                        setSelectedClassroom(c);
                        setPreviewStudent(null);
                        setSelectedStudentIds(new Set());
                        setReport(null);
                      }}
                    >
                      <span className="mpr-card-title">{c.name}</span>
                      {c.section && <span className="mpr-card-meta">{c.section}</span>}
                    </button>
                  ))}
                </div>
                <Pagination
                  page={classroomPage}
                  totalPages={classroomTotalPages}
                  onPageChange={fetchClassroomPage}
                />
              </>
            ) : (
              <div className="mpr-selected-pill">
                <span>{selectedClassroom.name}</span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedClassroom(null);
                    setPreviewStudent(null);
                    setSelectedStudentIds(new Set());
                    setReport(null);
                  }}
                >
                  change
                </button>
              </div>
            )}
          </section>

          {selectedClassroom && (
            <section className="mpr-panel mpr-panel--students">
              <div className="mpr-panel-head">
                <p className="mpr-panel-label"><FiUsers size={13} /> Students</p>
                <div className="mpr-panel-tools">
                  <button type="button" className="mpr-tool-btn" onClick={selectAllFiltered}>
                    Select all
                  </button>
                  <button
                    type="button"
                    className="mpr-tool-btn"
                    onClick={clearSelection}
                    disabled={selectedCount === 0}
                  >
                    Clear
                  </button>
                </div>
              </div>
              {selectedCount > 0 && (
                <p className="mpr-selection-hint">
                  {selectedCount} selected · {selectedWithParentPhone} with parent phone
                </p>
              )}
              <input
                className="mpr-search"
                placeholder="Search students…"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
              />
              {loadingStudents && <p className="mpr-muted">Loading students…</p>}
              <div className="mpr-scroll">
                {filteredStudents.map((s) => {
                  const id = String(s._id);
                  const isSelected = selectedStudentIds.has(id);
                  const isPreview = previewStudent?._id === s._id;
                  return (
                    <div
                      key={s._id}
                      className={`mpr-student-row ${isPreview ? "mpr-student-row--preview" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="mpr-student-check"
                        checked={isSelected}
                        onChange={() => toggleStudentSelection(s._id)}
                        aria-label={`Select ${s.name}`}
                      />
                      <button
                        type="button"
                        className="mpr-student-name"
                        onClick={() => setPreviewStudent(s)}
                      >
                        <span>{s.name || "—"}</span>
                        {!s.parentPhone && (
                          <span className="mpr-student-warn">No parent phone</span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {selectedClassroom && (
            <section className="mpr-panel mpr-panel--month">
              <p className="mpr-panel-label"><FiCalendar size={13} /> Month</p>
              <select
                className="mpr-select"
                value={`${year}-${month}`}
                onChange={(e) => {
                  const [y, m] = e.target.value.split("-").map(Number);
                  setYearMonth({ year: y, month: m });
                }}
              >
                {monthOptions.map((opt) => (
                  <option key={`${opt.year}-${opt.month}`} value={`${opt.year}-${opt.month}`}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="mpr-month-hint">
                Reports use assignments due in the selected month.
              </p>
            </section>
          )}
        </div>

        {previewStudent && (
          <section className="mpr-preview">
            <p className="mpr-preview-title">
              Preview — {previewStudent.name} · {selectedMonthLabel}
            </p>
            {loadingReport && <p className="mpr-muted">Building report preview…</p>}
            {!loadingReport && !report && (
              <p className="mpr-muted">No report data for this month.</p>
            )}
            {report && (
              <>
                <div className="mpr-kpi-grid">
                  <div className="mpr-kpi">
                    <span className="mpr-kpi-label">Overall</span>
                    <strong>{report.kpis.overallAverage ?? "—"}%</strong>
                  </div>
                  <div className="mpr-kpi">
                    <span className="mpr-kpi-label">Homework</span>
                    <strong>{report.kpis.homeworkAverage ?? "—"}%</strong>
                  </div>
                  <div className="mpr-kpi">
                    <span className="mpr-kpi-label">Quiz</span>
                    <strong>{report.kpis.quizAverage ?? "—"}%</strong>
                  </div>
                  <div className="mpr-kpi">
                    <span className="mpr-kpi-label">Submission</span>
                    <strong>{report.kpis.submissionRate}%</strong>
                  </div>
                  <div className={`mpr-kpi mpr-kpi--risk mpr-kpi--${report.kpis.risk?.tone || "gray"}`}>
                    <span className="mpr-kpi-label">Risk</span>
                    <strong>{report.kpis.risk?.label}</strong>
                  </div>
                </div>

                <div className="mpr-message-box">
                  <div className="mpr-message-head">
                    <FiFileText size={15} />
                    <span>Summary message for parents</span>
                  </div>
                  <p className="mpr-message-text">{report.parentMessage}</p>
                </div>

                <div className="mpr-preview-grid">
                  <div>
                    <h3>Strengths</h3>
                    <ul>{report.strengths.map((s) => <li key={s}>{s}</li>)}</ul>
                  </div>
                  <div>
                    <h3>Areas for improvement</h3>
                    <ul>{report.improvements.map((s) => <li key={s}>{s}</li>)}</ul>
                  </div>
                </div>

                <p className="mpr-footnote">
                  {report.assignmentCount} assignment(s) due in {selectedMonthLabel}.
                  Download the PDF or send to parent WhatsApp for the full branded report.
                </p>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
