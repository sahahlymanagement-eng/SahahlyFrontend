import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  FiBarChart2,
  FiBookOpen,
  FiClipboard,
  FiEye,
  FiPhone,
  FiSearch,
  FiSend,
  FiUsers,
  FiX,
} from "react-icons/fi";
import api from "../../api/api";
import { usePagination } from "../../hooks/usePagination";
import usePersistedState from "../../hooks/usePersistedState";
import Pagination from "../../components/Pagination";
import ReportsWorkspace from "../../components/ReportsWorkspace";
import MonthlyParentReportWorkspace from "../../components/MonthlyParentReportWorkspace";
import TeacherExecutiveAnalysisWorkspace from "../../components/TeacherExecutiveAnalysisWorkspace";
import { SubmissionStatusBadge } from "../../utils/submissionStatusBadge";
import { computeGradePercent, displayPercent } from "../../utils/reportGradePercent";
import { useClassroomRosterSync } from "../../hooks/useClassroomRosterSync";
import { TeacherPageHeader, TeacherLoading, TeacherEmpty } from "./TeacherUI";
import "../manager/ManagerAssignments.css";
import "../../components/MonthlyParentReport.css";
import "./teacher.css";

const HUB_TABS = [
  { id: "students", label: "Students & analysis", icon: FiUsers },
  { id: "grades", label: "Grades & send report", icon: FiSend },
  { id: "parents", label: "Parent monthly reports", icon: FiClipboard },
  { id: "analysis", label: "Course analysis", icon: FiBarChart2 },
];

function formatGrade(row) {
  const grade = row?.assignedGrade ?? row?.draftGrade;
  if (grade == null) return "—";
  const pct = displayPercent(grade, row?.maxPoints);
  return `${grade}${row?.maxPoints != null ? ` / ${row.maxPoints}` : ""}${
    pct ? ` (${pct}%)` : ""
  }`;
}

export default function TeacherStudentsParents() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const [hubTab, setHubTab] = usePersistedState("teacher:students-parents:tab", "students");
  const [selectedClassroom, setSelectedClassroom] = usePersistedState(
    "teacher:students-parents:classroom",
    null
  );
  const [classroomSearch, setClassroomSearch] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [analysisRows, setAnalysisRows] = useState([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);

  const classroomParams = useMemo(
    () => ({ search: classroomSearch }),
    [classroomSearch]
  );

  const {
    data: classrooms,
    page: classroomPage,
    totalPages: classroomTotalPages,
    fetchPage: fetchClassroomPage,
  } = usePagination(
    user?.id ? `/google-classroom/teacher-courses/${user.id}` : "/google-classroom/teacher-courses/_",
    classroomParams,
    20,
    "data",
    !!user?.id
  );

  const studentParams = useMemo(
    () => ({ search: studentSearch, sortKey: "name", sortDir: "asc" }),
    [studentSearch]
  );

  const {
    data: students,
    page: studentPage,
    totalPages: studentTotalPages,
    total: studentTotal,
    loading: loadingStudents,
    fetchPage: fetchStudentPage,
  } = usePagination(
    selectedClassroom ? `/students/classroom/${selectedClassroom._id}` : "/students/classroom/_",
    studentParams,
    20,
    "data",
    !!selectedClassroom?._id
  );

  useClassroomRosterSync(selectedClassroom?._id, {
    enabled: Boolean(selectedClassroom?._id),
    autoSync: Boolean(selectedClassroom?._id),
    onSynced: () => fetchStudentPage(1),
  });

  const loadStudentAnalysis = useCallback(async (student) => {
    if (!student?._id) return;
    if (!selectedClassroom?._id) {
      toast.warn("Select a classroom first");
      return;
    }
    setSelectedStudent(student);
    setAnalysisLoading(true);
    setAnalysisRows([]);
    try {
      const { data } = await api.get(`/manager-assignments/student/${student._id}`, {
        params: { classroomId: selectedClassroom._id },
      });
      setAnalysisRows(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load student analysis");
      setAnalysisRows([]);
    } finally {
      setAnalysisLoading(false);
    }
  }, [selectedClassroom?._id]);

  useEffect(() => {
    setSelectedStudent(null);
    setAnalysisRows([]);
  }, [selectedClassroom?._id]);

  const mapReportNav = useCallback(
    (view) => {
      if (view === "assignment") setHubTab("grades");
      else if (view === "monthly") setHubTab("parents");
      else if (view === "executive") setHubTab("analysis");
      else if (view === "sent") navigate("/teacher/reports");
    },
    [navigate, setHubTab]
  );

  const analysisStats = useMemo(() => {
    const total = analysisRows.length;
    let submitted = 0;
    let missing = 0;
    let late = 0;
    let graded = 0;
    let pctSum = 0;
    let pctCount = 0;
    for (const row of analysisRows) {
      if (row.state === "TURNED_IN" || row.state === "RETURNED") submitted += 1;
      if (row.state === "NEW" || row.state === "CREATED") missing += 1;
      if (row.isLate) late += 1;
      if (row.assignedGrade != null || row.draftGrade != null) graded += 1;
      const pct = computeGradePercent(row.assignedGrade ?? row.draftGrade, row.maxPoints);
      if (pct !== "" && Number.isFinite(Number(pct))) {
        pctSum += Number(pct);
        pctCount += 1;
      }
    }
    return {
      total,
      submitted,
      missing,
      late,
      graded,
      avgPct: pctCount ? Math.round(pctSum / pctCount) : null,
    };
  }, [analysisRows]);

  return (
    <div className={`tch-page${hubTab === "students" ? "" : " tch-page--bleed"}`}>
      <TeacherPageHeader
        eyebrow="Teacher workspace"
        title="Students & Parents"
        subtitle="Review submission status and grades, open student analysis, and send editable parent reports."
        actions={
          <div className="tch-page-actions">
            <button
              type="button"
              className="tch-btn tch-btn--ghost"
              onClick={() => navigate("/teacher/submissions")}
            >
              <FiEye size={15} />
              Submission Viewer
            </button>
            <button
              type="button"
              className="tch-btn tch-btn--ghost"
              onClick={() => navigate("/teacher/courses")}
            >
              <FiBookOpen size={15} />
              Course management
            </button>
            <button
              type="button"
              className="tch-btn tch-btn--primary"
              onClick={() => navigate("/teacher/reports")}
            >
              <FiClipboard size={15} />
              Full reports
            </button>
          </div>
        }
      />

      <div className="tch-hub-tabs" role="tablist" aria-label="Students and parents sections">
        {HUB_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={hubTab === tab.id}
              className={`tch-hub-tab${hubTab === tab.id ? " tch-hub-tab--active" : ""}`}
              onClick={() => setHubTab(tab.id)}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {hubTab === "students" && (
        <div className="tch-sp-layout">
          <aside className="tch-sp-pane">
            <div className="tch-sp-pane-head">
              <h2>Classrooms</h2>
              <label className="tch-search">
                <FiSearch size={14} />
                <input
                  type="search"
                  placeholder="Search classrooms…"
                  value={classroomSearch}
                  onChange={(e) => setClassroomSearch(e.target.value)}
                />
              </label>
            </div>
            <div className="tch-sp-list">
              {(classrooms || []).map((c) => (
                <button
                  key={c._id}
                  type="button"
                  className={`tch-sp-list-item${
                    selectedClassroom?._id === c._id ? " tch-sp-list-item--active" : ""
                  }`}
                  onClick={() => setSelectedClassroom(c)}
                >
                  <span className="tch-sp-list-title">{c.name}</span>
                  {c.section ? <span className="tch-sp-list-meta">{c.section}</span> : null}
                </button>
              ))}
              {!classrooms?.length && (
                <p className="tch-sp-empty-hint">No classrooms found.</p>
              )}
            </div>
            <Pagination
              page={classroomPage}
              totalPages={classroomTotalPages}
              onPageChange={fetchClassroomPage}
            />
          </aside>

          <section className="tch-sp-pane tch-sp-pane--grow">
            {!selectedClassroom ? (
              <TeacherEmpty
                icon={<FiUsers size={28} />}
                title="Select a classroom"
                description="Pick a class to see students, parent contacts, and open analysis."
              />
            ) : (
              <>
                <div className="tch-sp-pane-head">
                  <div>
                    <h2>{selectedClassroom.name}</h2>
                    <p className="tch-sp-count">{studentTotal ?? 0} students</p>
                  </div>
                  <label className="tch-search">
                    <FiSearch size={14} />
                    <input
                      type="search"
                      placeholder="Search students…"
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                    />
                  </label>
                </div>

                {loadingStudents ? (
                  <TeacherLoading message="Loading students…" />
                ) : !students?.length ? (
                  <TeacherEmpty
                    icon={<FiUsers size={28} />}
                    title="No students yet"
                    description="Sync the Classroom roster from Course management if this list is empty."
                  />
                ) : (
                  <div className="tch-sp-student-table-wrap">
                    <table className="tch-sp-table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Parent</th>
                          <th>Contact</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {students.map((s) => (
                          <tr
                            key={s._id}
                            className={
                              selectedStudent?._id === s._id ? "tch-sp-row--active" : undefined
                            }
                            onClick={() => loadStudentAnalysis(s)}
                          >
                            <td>
                              <strong>{s.name}</strong>
                            </td>
                            <td>{s.parentName || "—"}</td>
                            <td>
                              <span className="tch-sp-phone">
                                <FiPhone size={12} />
                                {s.parentPhone || s.phone || "No phone"}
                              </span>
                            </td>
                            <td>
                              <button
                                type="button"
                                className="tch-btn tch-btn--ghost tch-btn--sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  loadStudentAnalysis(s);
                                }}
                              >
                                Analysis
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Pagination
                      page={studentPage}
                      totalPages={studentTotalPages}
                      onPageChange={fetchStudentPage}
                    />
                  </div>
                )}
              </>
            )}
          </section>

          <aside className="tch-sp-pane tch-sp-analysis">
            {!selectedStudent ? (
              <TeacherEmpty
                icon={<FiBarChart2 size={28} />}
                title="Student analysis"
                description="Click any student to see submission statuses, grades, and details."
              />
            ) : (
              <>
                <div className="tch-sp-pane-head">
                  <div>
                    <h2>{selectedStudent.name}</h2>
                    <p className="tch-sp-count">
                      {selectedStudent.parentName
                        ? `Parent: ${selectedStudent.parentName}`
                        : "Parent contact"}
                      {selectedStudent.parentPhone
                        ? ` · ${selectedStudent.parentPhone}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="tch-icon-btn"
                    aria-label="Close analysis"
                    onClick={() => {
                      setSelectedStudent(null);
                      setAnalysisRows([]);
                    }}
                  >
                    <FiX size={16} />
                  </button>
                </div>

                <div className="tch-sp-analysis-actions">
                  <button
                    type="button"
                    className="tch-btn tch-btn--primary tch-btn--sm"
                    onClick={() => setHubTab("grades")}
                  >
                    <FiSend size={14} />
                    Send report
                  </button>
                  <button
                    type="button"
                    className="tch-btn tch-btn--ghost tch-btn--sm"
                    onClick={() => navigate("/teacher/submissions")}
                  >
                    <FiEye size={14} />
                    Open submissions
                  </button>
                </div>

                {analysisLoading ? (
                  <TeacherLoading message="Loading analysis…" />
                ) : (
                  <>
                    <div className="tch-sp-stat-row">
                      <div className="tch-sp-stat">
                        <span className="tch-sp-stat-value">{analysisStats.total}</span>
                        <span className="tch-sp-stat-label">Assignments</span>
                      </div>
                      <div className="tch-sp-stat">
                        <span className="tch-sp-stat-value">{analysisStats.submitted}</span>
                        <span className="tch-sp-stat-label">Submitted</span>
                      </div>
                      <div className="tch-sp-stat">
                        <span className="tch-sp-stat-value">{analysisStats.missing}</span>
                        <span className="tch-sp-stat-label">Missing</span>
                      </div>
                      <div className="tch-sp-stat">
                        <span className="tch-sp-stat-value">
                          {analysisStats.avgPct != null ? `${analysisStats.avgPct}%` : "—"}
                        </span>
                        <span className="tch-sp-stat-label">Avg grade</span>
                      </div>
                    </div>

                    <div className="tch-sp-analysis-list">
                      {analysisRows.length === 0 ? (
                        <p className="tch-sp-empty-hint">No assignment history for this student.</p>
                      ) : (
                        analysisRows.map((row) => (
                          <article key={row._id} className="tch-sp-analysis-card">
                            <div className="tch-sp-analysis-card-top">
                              <h3>{row.title}</h3>
                              <SubmissionStatusBadge student={row} />
                            </div>
                            <dl className="tch-sp-analysis-meta">
                              <div>
                                <dt>Grade</dt>
                                <dd>{formatGrade(row)}</dd>
                              </div>
                              <div>
                                <dt>Submitted</dt>
                                <dd>
                                  {row.submittedAt
                                    ? new Date(row.submittedAt).toLocaleString()
                                    : "—"}
                                </dd>
                              </div>
                              <div>
                                <dt>Due</dt>
                                <dd>
                                  {row.dueDateTime
                                    ? new Date(row.dueDateTime).toLocaleString()
                                    : "—"}
                                </dd>
                              </div>
                              <div>
                                <dt>Flags</dt>
                                <dd>
                                  {[
                                    row.isLate ? "Late" : null,
                                    row.isOnTime ? "On time" : null,
                                    row.isReturned ? "Returned" : null,
                                    row.hasAttachment === false ? "No attachment" : null,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "—"}
                                </dd>
                              </div>
                            </dl>
                          </article>
                        ))
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </aside>
        </div>
      )}

      {hubTab === "grades" && (
        <div className="tch-hub-embed">
          <ReportsWorkspace variant="teacher" assignmentOnly />
        </div>
      )}

      {hubTab === "parents" && (
        <div className="tch-hub-embed">
          <MonthlyParentReportWorkspace
            variant="teacher"
            onBack={() => setHubTab("students")}
            onNavigate={mapReportNav}
          />
        </div>
      )}

      {hubTab === "analysis" && (
        <div className="tch-hub-embed">
          <TeacherExecutiveAnalysisWorkspace
            variant="teacher"
            onBack={() => setHubTab("students")}
            onNavigate={mapReportNav}
          />
        </div>
      )}
    </div>
  );
}
