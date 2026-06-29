import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import "../manager/ManagerAssignments.css";
import "../manager/ManagerSubmissionViewer.css";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";

import { SubmissionStatusBadge } from "../../utils/submissionStatusBadge";
import Pagination from "../../components/Pagination";
import ReportGradesRefreshButton from "../../components/ReportGradesRefreshButton";
import {
  refreshAssignmentGrades,
  applyReportCartGradeSync,
} from "../../utils/refreshAssignmentFromClassroom";
import { computeGradePercent, parsePercentInput, displayPercent } from "../../utils/reportGradePercent";
import { parseAttendanceNamesFromFile, buildInitialAttendanceMap, attendedNamesFromMap, countPresentInMap } from "../../utils/attendanceExcel";
import ReportAttendanceSelect from "../../components/ReportAttendanceSelect";
import { fetchAllPaginated } from "../../utils/fetchAllStudents";
import { usePagination } from "../../hooks/usePagination";

import {
  FiSend,
  FiCheckSquare,
  FiMessageSquare,
} from "react-icons/fi";

export default function AssistantReports() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();

  const [reportCart, setReportCart] = useState({});
  const [sending, setSending] = useState(false);

  const [customPhone, setCustomPhone] = useState("");
  const [sendingCollective, setSendingCollective] = useState(false);

  const [summaryViewer, setSummaryViewer] = useState({ open: false, title: "", message: "" });

  const [includeAttendance, setIncludeAttendance] = useState(false);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [attendanceRoster, setAttendanceRoster] = useState([]);
  const [attendanceFileName, setAttendanceFileName] = useState("");
  const [parsingAttendance, setParsingAttendance] = useState(false);
  const [refreshingGrades, setRefreshingGrades] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);
  // const [assignmentTitle, setAssignmentTitle] = useState("Assignment");
  // const [classroomId, setClassroomId] = useState(null);

  const { data: students, page, totalPages, total, loading, fetchPage, extra, setData: setStudents } =
    usePagination(
      `/assignment-submissions/${assignmentId}/students`,
      {},
      10,
      "students",
      !!assignmentId
    );

  const summaryMap = extra.summaryMap || {};
  const assignmentTitle = extra.assignmentTitle || "Assignment";
  const classroomId = extra.classroomId || null;
  const assignmentMaxPoints = extra.maxGrade ?? null;

  const [allStudents, setAllStudents] = useState([]);

  useEffect(() => {
    if (!assignmentId) return;
    fetchAllPaginated(
      api,
      `/assignment-submissions/${assignmentId}/students`,
      {},
      "students",
      100
    ).then(setAllStudents).catch(() => setAllStudents([]));
  }, [assignmentId]);

  const getStudentId = (s) => s.studentId || s._id;

  const buildItem = (student) => ({
    assignmentTitle,
    assignmentId,
    submissionId: student.submissionId || null,
    state: student.state,
    submittedAt: student.submittedAt,
    isLate: student.isLate,
    isOnTime: student.isOnTime,
    assignedGrade: student.assignedGrade,
    percentage: computeGradePercent(student.assignedGrade, assignmentMaxPoints) || null,
    comment: student.summary || summaryMap[student.submissionId] || "",
  });

  const toggleStudent = (student) => {
    const stuId = String(getStudentId(student));
    const asgId = assignmentId;

    setReportCart((prev) => {
      const next = { ...prev };

      if (!next[stuId]) {
        next[stuId] = {
          studentMeta: student,
          items: { [asgId]: buildItem(student) }
        };
      } else if (next[stuId].items[asgId]) {
        delete next[stuId].items[asgId];

        if (Object.keys(next[stuId].items).length === 0) {
          delete next[stuId];
        }
      } else {
        next[stuId].items[asgId] = buildItem(student);
      }

      return next;
    });
  };

  const selectAll = async () => {
    if (!assignmentId) return;

    setSelectingAll(true);
    try {
      const list = await fetchAllPaginated(
        api,
        `/assignment-submissions/${assignmentId}/students`,
        {},
        "students",
        100
      );

      if (list.length === 0) {
        toast.info("No students to select");
        return;
      }

      setAllStudents(list);
      const asgId = assignmentId;

      setReportCart((prev) => {
        const next = { ...prev };

        list.forEach((s) => {
          const stuId = String(getStudentId(s));

          if (!next[stuId]) {
            next[stuId] = {
              studentMeta: s,
              items: { [asgId]: buildItem(s) },
            };
          } else if (!next[stuId].items[asgId]) {
            next[stuId].items[asgId] = buildItem(s);
          }
        });

        return next;
      });

      toast.success(`Selected all ${list.length} students`);
    } catch (err) {
      console.error("Select all students error:", err);
      toast.error("Failed to select all students");
    } finally {
      setSelectingAll(false);
    }
  };

  const clearAll = () => setReportCart({});

  const isSelected = (student) => {
    const stuId = String(getStudentId(student));
    return !!reportCart?.[stuId]?.items?.[assignmentId];
  };

  const setComment = (studentId, comment) => {
    setReportCart((prev) => {
      const entry = prev[studentId];
      if (!entry) return prev;

      return {
        ...prev,
        [studentId]: {
          ...entry,
          items: {
            ...entry.items,
            [assignmentId]: {
              ...entry.items?.[assignmentId],
              comment,
            },
          },
        },
      };
    });
  };

  const setPercentage = (studentId, percentage) => {
    setReportCart((prev) => {
      const entry = prev[studentId];
      if (!entry) return prev;

      return {
        ...prev,
        [studentId]: {
          ...entry,
          items: {
            ...entry.items,
            [assignmentId]: {
              ...entry.items?.[assignmentId],
              percentage,
            },
          },
        },
      };
    });
  };

  /* ATTENDANCE */
  const handleAttendanceToggle = (checked) => {
    setIncludeAttendance(checked);
    if (!checked) {
      setAttendanceMap({});
      setAttendanceRoster([]);
      setAttendanceFileName("");
    }
  };

  const handleAttendanceFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setParsingAttendance(true);
    try {
      const names = await parseAttendanceNamesFromFile(file);
      if (!names.length) {
        toast.warn("No student names found in that file");
        setAttendanceMap({});
        setAttendanceRoster([]);
        setAttendanceFileName("");
        return;
      }

      const roster = await fetchAllPaginated(
        api,
        `/assignment-submissions/${assignmentId}/students`,
        {},
        "students",
        100
      );

      const map = buildInitialAttendanceMap(roster, names, getStudentId);
      setAttendanceMap(map);
      setAttendanceRoster(roster);
      setAllStudents(roster);
      setAttendanceFileName(file.name);
      const present = countPresentInMap(map);
      toast.success(
        `Matched ${roster.length} student(s) — ${present} present, ${roster.length - present} absent (editable in table)`
      );
    } catch (err) {
      toast.error(err?.message || "Failed to read attendance file");
      setAttendanceMap({});
      setAttendanceRoster([]);
      setAttendanceFileName("");
    } finally {
      setParsingAttendance(false);
    }
  };

  const setStudentAttendance = (studentKey, present) => {
    setAttendanceMap((prev) => ({
      ...prev,
      [String(studentKey)]: present,
    }));
  };

  const showAttendanceColumn =
    includeAttendance && Object.keys(attendanceMap).length > 0;

  const buildAttendancePayload = () => {
    if (!includeAttendance || !Object.keys(attendanceMap).length) return undefined;
    const roster = attendanceRoster.length ? attendanceRoster : allStudents;
    const attendedNames = attendedNamesFromMap(roster, attendanceMap, getStudentId);
    return {
      enabled: true,
      attendedNames,
    };
  };

  const refreshGrades = async () => {
    if (!assignmentId) return;
    setRefreshingGrades(true);
    try {
      const { students: freshList, maxPoints } =
        await refreshAssignmentGrades(api, assignmentId, "assistant");

      setAllStudents(freshList);
      setReportCart((prev) =>
        applyReportCartGradeSync(prev, freshList, maxPoints, getStudentId)
      );
      await fetchPage(page);
      toast.success(`Synced grades, max points, and percentages for ${freshList.length} student(s)`);
    } catch {
      toast.error("Failed to refresh grades");
    } finally {
      setRefreshingGrades(false);
    }
  };

  /* BUILD PAYLOAD */
  const buildReportsPayload = (activeSummaryMap = summaryMap, activeStudents = students) => {
    const studentByKey = Object.fromEntries(
      activeStudents.map((s) => [String(getStudentId(s)), s])
    );

    return Object.entries(reportCart).map(([, entry]) => ({
      name: entry.studentMeta.name,
      phone: entry.studentMeta.phone,
      parentPhone: entry.studentMeta.parentPhone,
      items: Object.values(entry.items).map((item) => {
        const liveStudent =
          studentByKey[String(getStudentId(entry.studentMeta))] || entry.studentMeta;
        const submissionId = item.submissionId || liveStudent?.submissionId;
        const assignedGrade = liveStudent?.assignedGrade ?? item.assignedGrade;
        const savedSummary =
          liveStudent?.summary ||
          (submissionId ? activeSummaryMap[submissionId] : "");
        return {
          ...item,
          assignmentId: item.assignmentId || assignmentId,
          submissionId,
          state: liveStudent?.state ?? item.state,
          submittedAt: liveStudent?.submittedAt ?? item.submittedAt,
          isLate: liveStudent?.isLate ?? item.isLate,
          isOnTime: liveStudent?.isOnTime ?? item.isOnTime,
          assignedGrade,
          percentage:
            item.percentage ??
            (computeGradePercent(assignedGrade, assignmentMaxPoints) || null),
          comment: (item.comment || savedSummary || "").trim(),
        };
      }),
    }));
  };

  const sendReport = async () => {
    if (!Object.keys(reportCart).length) {
      toast.warn("No students selected");
      return;
    }

    if (!classroomId) {
      toast.error("Missing classroom for this assignment");
      return;
    }

    if (includeAttendance && !Object.keys(attendanceMap).length) {
      toast.warn("Upload an attendance Excel file first");
      return;
    }

    let freshSummaryMap = summaryMap;
    let freshStudents = students;
    try {
      const fresh = await api.get(`/assignment-submissions/${assignmentId}/students`);
      freshSummaryMap = fresh.data.summaryMap || summaryMap;
      freshStudents = fresh.data.students || students;
      setStudents(freshStudents);
    } catch {
      // use cached summaries if refresh fails
    }

    const reports = buildReportsPayload(freshSummaryMap, freshStudents);

    setSending(true);
    try {
      const res = await api.post("/manager-assignments/send-report", {
        reports,
        classroomId,
        attendance: buildAttendancePayload(),
      });
      const summary = res.data.summary || [];
      const succeeded = summary.filter((r) => r.status === "fulfilled").length;
      const failed = summary.filter((r) => r.status === "rejected").length;
      toast.success(`Sent to ${succeeded} student(s)${failed ? `, ${failed} failed` : ""}`);
      setReportCart({});
    } catch {
      toast.error("Failed to send reports");
    } finally {
      setSending(false);
    }
  };

  const sendTeacherCollectiveReport = async () => {
    const reports = buildReportsPayload();

    if (!reports.length) {
      toast.warn("No students selected");
      return;
    }

    if (!classroomId) {
      toast.warn("Classroom not loaded yet");
      return;
    }

    setSendingCollective(true);
    try {
      await api.post("/manager-assignments/send-teacher-collective-report", {
        reports,
        classroomId,
      });

      toast.success("Teacher collective PDF report sent");
      setReportCart({});
    } catch {
      toast.error("Failed to send teacher report");
    } finally {
      setSendingCollective(false);
    }
  };

  const sendCustomCollectiveReport = async () => {
    const reports = buildReportsPayload();

    if (!reports.length) {
      toast.warn("No students selected");
      return;
    }

    if (!customPhone.trim()) {
      toast.warn("Enter phone number");
      return;
    }

    if (!classroomId) {
      toast.warn("Classroom not loaded yet");
      return;
    }

    setSendingCollective(true);

    try {
      await api.post("/manager-assignments/send-custom-collective-report", {
        reports,
        classroomId,
        phone: customPhone,
      });

      toast.success("Custom PDF report sent");
    } catch {
      toast.error("Failed to send custom report");
    } finally {
      setSendingCollective(false);
    }
  };

  const cartCount = Object.keys(reportCart).length;

  const totalItems = Object.values(reportCart).reduce(
    (acc, e) => acc + Object.keys(e.items || {}).length,
    0
  );

  const isSending = sending || sendingCollective;

  const statusBadge = (student) => <SubmissionStatusBadge student={student} />;

  return (
    <div className="ma-root">
      <main className="ma-main">

        <header className="ma-topbar">
          <div className="ma-topbar-left">
            <h1 className="ma-topbar-title">Assignments</h1>
            <span className="ma-topbar-sub">{assignmentTitle}</span>
          </div>

          <div className="ma-topbar-right">
            <button className="msv-cancel-btn" onClick={() => navigate(-1)}>
              Back
            </button>

            {cartCount > 0 && (
              <>
                <div className="ma-cart-pill">
                  <FiCheckSquare size={13} />
                  <span>
                    {cartCount} student{cartCount !== 1 ? "s" : ""} · {totalItems} item{totalItems !== 1 ? "s" : ""}
                  </span>
                </div>

                <button className="ma-send-btn" onClick={sendReport} disabled={sending}>
                  <FiSend size={13} />
                  {sending ? "Sending…" : "Send Report"}
                </button>

                <button
                  className="ma-send-btn"
                  onClick={sendTeacherCollectiveReport}
                  disabled={isSending}
                >
                  <FiSend size={13} />
                  {sendingCollective ? "Sending…" : "Send Teacher Collective PDF"}
                </button>

                <div style={{ minWidth: "260px" }}>
                  <PhoneInput
                    defaultCountry="eg"
                    value={`+${customPhone}`}
                    onChange={(value) =>
                      setCustomPhone(value.replace(/\D/g, ""))
                    }
                    className="tm-phone-input"
                    countrySelectorStyleProps={{
                      dropdownStyleProps: {
                        style: {
                          maxHeight: "350px",
                          zIndex: 9999
                        }
                      }
                    }}
                  />
                </div>

                <button
                  className="ma-send-btn"
                  onClick={sendCustomCollectiveReport}
                  disabled={isSending}
                >
                  <FiSend size={13} />
                  {sendingCollective ? "Sending…" : "Send Custom Collective PDF"}
                </button>
              </>
            )}
          </div>
        </header>

        <div className="ma-attendance-bar">
          <label className="ma-attendance-check">
            <input
              type="checkbox"
              checked={includeAttendance}
              onChange={(e) => handleAttendanceToggle(e.target.checked)}
            />
            <span>Attendance</span>
          </label>
          {includeAttendance && (
            <div className="ma-attendance-upload">
              <label className="ma-attendance-file-btn">
                {parsingAttendance ? "Reading file…" : "Upload Excel"}
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleAttendanceFile}
                  disabled={parsingAttendance}
                  hidden
                />
              </label>
              {attendanceFileName && (
                <span className="ma-attendance-meta">
                  {attendanceFileName} · {countPresentInMap(attendanceMap)} present / {Object.keys(attendanceMap).length} students
                </span>
              )}
            </div>
          )}
        </div>

        {/* TABLE */}
        <div className="ma-content">
          <div className="ma-right-panel msv-right-panel-full">
            <div className="ma-panel">
              <div className="ma-panel-header">
                <div className="ma-panel-title-wrap">
                  <div className="ma-panel-dot" />
                  <h2 className="ma-panel-title">{assignmentTitle}</h2>
                  <span className="ma-panel-count">{total ?? students.length} students</span>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <ReportGradesRefreshButton
                    onClick={refreshGrades}
                    loading={refreshingGrades}
                  />
                  <button
                    className="ma-send-btn"
                    onClick={selectAll}
                    disabled={selectingAll || loading || !assignmentId}
                  >
                    {selectingAll ? "Selecting…" : "Select All"}
                  </button>

                  <button
                    className="ma-send-btn"
                    onClick={clearAll}
                    disabled={cartCount === 0}
                  >
                    Clear All
                  </button>
                </div>
                {cartCount > 0 && (
                  <span className="ma-panel-hint">
                    <FiCheckSquare size={12} /> {cartCount} selected for report
                  </span>
                )}
              </div>

              {loading && <p className="ma-loading-msg">Loading students…</p>}

              {!loading && students.length === 0 && (
                <p className="ma-empty-msg">No students found.</p>
              )}

              {!loading && students.length > 0 && (
                <div className="ma-table-wrap">
                  <div className="ma-table-scroll">
                    <table className="ma-table">
                      <thead>
                        <tr>
                          <th style={{ width: 44 }}></th>
                          <th>Name</th>
                          <th>Email</th>
                          <th>Status</th>
                          {showAttendanceColumn && <th>Attendance</th>}
                          <th>Submitted At</th>
                          <th>Grade</th>
                          <th>%</th>
                          <th>Comment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((s, i) => {
                          const stuId = String(getStudentId(s));
                          const asgId = assignmentId;
                          const selected = isSelected(s);

                          return (
                            <tr
                              key={stuId}
                              className={`ma-row ${selected ? "ma-row--selected" : ""}`}
                              style={{ animationDelay: `${i * 0.025}s` }}
                              onClick={() => toggleStudent(s)}
                            >
                              <td>
                                <div className={`ma-check ${selected ? "ma-check--on" : ""}`}>
                                  {selected && "✓"}
                                </div>
                              </td>
                              <td>
                                <div className="ma-avatar-cell">
                                  <div className="ma-avatar">
                                    {(s.name || s.email || "?").charAt(0).toUpperCase()}
                                  </div>
                                  <span className="ma-cell-name">
                                    {s.name || <span className="ma-cell-empty">—</span>}
                                  </span>
                                </div>
                              </td>
                              <td><span className="ma-cell-muted">{s.email || "—"}</span></td>
                              <td>{statusBadge(s)}</td>
                              {showAttendanceColumn && (
                                <td onClick={(e) => e.stopPropagation()}>
                                  <ReportAttendanceSelect
                                    present={!!attendanceMap[stuId]}
                                    onChange={(present) => setStudentAttendance(stuId, present)}
                                  />
                                </td>
                              )}
                              <td>
                                <span className="ma-cell-muted">
                                  {s.submittedAt ? new Date(s.submittedAt).toLocaleString() : "—"}
                                </span>
                              </td>
                              <td>
                                {s.assignedGrade != null
                                  ? <span className="ma-grade-pill">{s.assignedGrade}</span>
                                  : <span className="ma-cell-empty">—</span>}
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                {s.assignedGrade != null && assignmentMaxPoints ? (
                                  selected ? (
                                    <div className="ma-percent-wrap">
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        className="ma-percent-input"
                                        value={
                                          reportCart[stuId]?.items[asgId]?.percentage ??
                                          computeGradePercent(s.assignedGrade, assignmentMaxPoints)
                                        }
                                        onChange={(e) =>
                                          setPercentage(stuId, parsePercentInput(e.target.value))
                                        }
                                      />
                                      <span className="ma-percent-suffix">%</span>
                                    </div>
                                  ) : (
                                    <span className="ma-percent-readonly">
                                      {displayPercent(s.assignedGrade, assignmentMaxPoints, null) || "—"}
                                      {displayPercent(s.assignedGrade, assignmentMaxPoints, null)
                                        ? "%"
                                        : ""}
                                    </span>
                                  )
                                ) : (
                                  <span className="ma-cell-empty">—</span>
                                )}
                              </td>
                              <td onClick={(e) => e.stopPropagation()}>
                                {selected ? (
                                  <div className="ma-comment-wrap">
                                    <FiMessageSquare size={12} className="ma-comment-icon" />
                                    <input
                                      className="ma-comment-input"
                                      placeholder="Add comment…"
                                      value={reportCart[stuId]?.items[asgId]?.comment || ""}
                                      onChange={(e) => setComment(stuId, e.target.value)}
                                    />
                                  </div>
                                ) : (s.summary || summaryMap[s.submissionId]) ? (
                                  <button
                                    className="msv-action-btn msv-action-btn--view"
                                    title="View Summary"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSummaryViewer({
                                        open: true,
                                        title: `Summary – ${s.name}`,
                                        message: s.summary || summaryMap[s.submissionId]
                                      });
                                    }}
                                  >
                                    View Summary
                                  </button>
                                ) : null}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!loading && students.length > 0 && (
                <Pagination page={page} totalPages={totalPages} onPageChange={fetchPage} />
              )}
            </div>
          </div>
        </div>

        {cartCount > 0 && (
          <div className="ma-cart-bar">
            <div className="ma-cart-bar-left">
              <span className="ma-cart-label">📋 Report Ready</span>
              <span className="ma-cart-stats">
                {cartCount} student{cartCount !== 1 ? "s" : ""} · {totalItems} assignment{totalItems !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="ma-cart-students">
              {Object.values(reportCart).map((entry) => (
                <div key={getStudentId(entry.studentMeta)} className="ma-cart-chip">
                  <div className="ma-cart-chip-avatar">
                    {entry.studentMeta.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="ma-cart-chip-info">
                    <strong>{entry.studentMeta.name}</strong>
                    <span>{Object.values(entry.items).map((i) => i.assignmentTitle).join(", ")}</span>
                  </div>
                </div>
              ))}
            </div>
            <button className="ma-cart-send-btn" onClick={sendReport} disabled={sending}>
              <FiSend size={14} />
              {sending ? "Sending…" : `Send to ${cartCount} Student${cartCount !== 1 ? "s" : ""}`}
            </button>
          </div>
        )}

        {summaryViewer.open && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 1000,
              background: "rgba(0,0,0,0.6)",
              backdropFilter: "blur(4px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}
            onClick={() =>
              setSummaryViewer({ open: false, title: "", message: "" })
            }
          >
            <div
              style={{
                background: "#1e1e2e",
                borderRadius: 14,
                padding: 24,
                width: "min(520px, 90vw)",
                border: "1px solid rgba(139,92,246,0.3)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)"
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    color: "#fff",
                    fontSize: 15
                  }}
                >
                  {summaryViewer.title}
                </span>

                <button
                  onClick={() =>
                    setSummaryViewer({ open: false, title: "", message: "" })
                  }
                  style={{
                    background: "none",
                    border: "none",
                    color: "rgba(255,255,255,0.5)",
                    cursor: "pointer",
                    fontSize: 18
                  }}
                >
                  ✕
                </button>
              </div>

              <p
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.75)",
                  lineHeight: 1.7,
                  margin: 0
                }}
              >
                {summaryViewer.message}
              </p>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
