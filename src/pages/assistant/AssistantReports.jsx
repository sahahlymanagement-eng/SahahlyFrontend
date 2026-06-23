import { useEffect, useState } from "react";
import { useParams,useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import "../manager/ManagerAssignments.css";

import { usePagination } from "../../hooks/usePagination";
import Pagination from "../../components/Pagination";

import {
  FiSend,
  FiCheckSquare,
  FiMessageSquare,
  FiRefreshCw
} from "react-icons/fi";

export default function AssistantReports() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  // const [students, setStudents] = useState([]);
  // const [loading, setLoading] = useState(false);

  const [reportCart, setReportCart] = useState({});
  const [sending, setSending] = useState(false);

  const [customPhone, setCustomPhone] = useState("");
  const [sendingCollective, setSendingCollective] = useState(false);
  
  // const [summaryMap, setSummaryMap] = useState({});
  const [summaryViewer, setSummaryViewer] = useState({ open: false, title: "", message: "" });
  // const [assignmentTitle, setAssignmentTitle] = useState("Assignment");
  // const [classroomId, setClassroomId] = useState(null);

  /* LOAD STUDENTS */
  // useEffect(() => {
  //   if (!assignmentId) return;
  //   fetchStudents();
  // }, [assignmentId]);

  // const fetchStudents = async () => {
  //   setLoading(true);
  //   try {
  //     const res = await api.get(
  //       `/assignment-submissions/${assignmentId}/students`
  //     );
  //     setStudents(res.data.students || []);
  //     setSummaryMap(res.data.summaryMap || {});
  //     setAssignmentTitle(res.data.assignmentTitle || "Assignment");
  //     setClassroomId(res.data.classroomId || null);
  //   } catch {
  //     toast.error("Failed to load students");
  //   } finally {
  //     setLoading(false);
  //   }
  // };
const { data: students, page, totalPages, loading, fetchPage, extra, setData: setStudents } =
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
  
  const [allStudents, setAllStudents] = useState([]);

useEffect(() => {
  if (!assignmentId) return;
  api.get(`/assignment-submissions/${assignmentId}/students`, {
    params: { page: 1, limit: 9999 } // fetch all
  }).then(res => setAllStudents(res.data.students || []));
}, [assignmentId]);
  
  /* HELPERS */
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
    comment: student.summary || summaryMap[student.submissionId] || ""
  });

  /* TOGGLE SINGLE STUDENT */
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

  /* SELECT ALL */
  // const selectAll = () => {
  //   const asgId = assignmentId;

  //   setReportCart((prev) => {
  //     const next = { ...prev };

  //     students.forEach((s) => {
  //       const stuId = String(getStudentId(s));

  //       if (!next[stuId]) {
  //         next[stuId] = {
  //           studentMeta: s,
  //           items: { [asgId]: buildItem(s) }
  //         };
  //       } else if (!next[stuId].items[asgId]) {
  //         next[stuId].items[asgId] = buildItem(s);
  //       }
  //     });

  //     return next;
  //   });
  // };
const selectAll = () => {
  const asgId = assignmentId;

  setReportCart((prev) => {
    const next = { ...prev };

    allStudents.forEach((s) => {  // changed from students → allStudents
      const stuId = String(getStudentId(s));

      if (!next[stuId]) {
        next[stuId] = {
          studentMeta: s,
          items: { [asgId]: buildItem(s) }
        };
      } else if (!next[stuId].items[asgId]) {
        next[stuId].items[asgId] = buildItem(s);
      }
    });

    return next;
  });
};
  /* CLEAR ALL */
  const clearAll = () => setReportCart({});

  /* CHECK SELECTED */
  const isSelected = (student) => {
    const stuId = String(getStudentId(student));
    return !!reportCart?.[stuId]?.items?.[assignmentId];
  };

  /* COMMENT */
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
              comment
            }
          }
        }
      };
    });
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
        const savedSummary =
          liveStudent?.summary ||
          (submissionId ? activeSummaryMap[submissionId] : "");
        return {
          ...item,
          assignmentId: item.assignmentId || assignmentId,
          submissionId,
          comment: (item.comment || savedSummary || "").trim()
        };
      })
    }));
  };

  /* SEND NORMAL REPORT */
  const sendReport = async () => {
    if (!Object.keys(reportCart).length) {
      toast.warn("No students selected");
      return;
    }

    if (!classroomId) {
      toast.error("Missing classroom for this assignment");
      return;
    }

    let freshSummaryMap = summaryMap;
    let freshStudents = students;
    try {
      const fresh = await api.get(`/assignment-submissions/${assignmentId}/students`);
      freshSummaryMap = fresh.data.summaryMap || summaryMap;
      freshStudents = fresh.data.students || students;
      setSummaryMap(freshSummaryMap);
      setStudents(freshStudents);
    } catch {
      // use cached summaries if refresh fails
    }

    const reports = buildReportsPayload(freshSummaryMap, freshStudents);

    setSending(true);
    try {
      const res = await api.post("/manager-assignments/send-report", {
        reports,
        classroomId
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

  /* TEACHER COLLECTIVE */
  const sendTeacherCollectiveReport = async () => {
    const reports = buildReportsPayload();

    if (!reports.length) {
      toast.warn("No students selected");
      return;
    }

    setSendingCollective(true);
    try {
await api.post(
  `/assignment-submissions/${assignmentId}/students/reports`,
  {
    type: "teacher",
    reports
  }
);

      toast.success("Teacher collective report sent");
      setReportCart({});
    } catch {
      toast.error("Failed to send teacher report");
    } finally {
      setSendingCollective(false);
    }
  };

  /* CUSTOM COLLECTIVE */
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

    setSendingCollective(true);

    try {
await api.post(
  `/assignment-submissions/${assignmentId}/students/reports`,
  {
    type: "custom",
    phone: customPhone,
    reports
  }
);

      toast.success("Custom report sent");
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

  /* UI */
  return (
    <div className="ma-root">
      <main className="ma-main">

        {/* TOPBAR */}
        <header className="ma-topbar">
          <div className="ma-topbar-left">
            <h1 className="ma-topbar-title">Assignment Reports</h1>
            <span className="ma-topbar-sub">
              {allStudents.length} students
            </span>
          </div>

          <div className="ma-topbar-right">

            <button className="ma-send-btn" onClick={() => fetchPage(page)}>
              <FiRefreshCw /> Refresh
            </button>
            
            <button className="pm-back" onClick={() => navigate(-1)}>
              ← Back</button>

            <button className="ma-send-btn" onClick={selectAll}>
              Select All
            </button>

            <button className="ma-send-btn" onClick={clearAll}>
              Clear All
            </button>

            {cartCount > 0 && (
              <>
                <div className="ma-cart-pill">
                  <FiCheckSquare size={13} />
                  <span>
                    {cartCount} students · {totalItems} items
                  </span>
                </div>

                <button
                  className="ma-send-btn"
                  onClick={sendReport}
                  disabled={sending}
                >
                  <FiSend size={13} />
                  {sending ? "Sending…" : "Send Report"}
                </button>

                <button
                  className="ma-send-btn"
                  onClick={sendTeacherCollectiveReport}
                  disabled={sending || sendingCollective}
                >
                  Teacher Report
                </button>

                <input
                  className="ma-search-input"
                  placeholder="Custom phone"
                  value={customPhone}
                  onChange={(e) =>
                    setCustomPhone(e.target.value.replace(/\D/g, ""))
                  }
                />

                <button
                  className="ma-send-btn"
                  onClick={sendCustomCollectiveReport}
                  disabled={sending || sendingCollective}
                >
                  Custom Report
                </button>
              </>
            )}
          </div>
        </header>

        {/* TABLE */}
        <div className="ma-content">
          <div className="ma-table-wrap">
            <div className="ma-table-scroll">

              {loading ? (
                <p className="ma-empty-msg">Loading students...</p>
              ) : (
                <table className="ma-table">
                  <thead>
                    <tr>
                      <th></th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Status</th>
                      <th>Grade</th>
                      <th>Comment</th>
                    </tr>
                  </thead>

                  <tbody>
                    {students.map((s) => {
                      const stuId = String(getStudentId(s));
                      const asgId = assignmentId;
                      const selected = isSelected(s);

                      return (
                        <tr
                          key={stuId}
                          className={selected ? "ma-row--selected" : ""}
                          onClick={() => toggleStudent(s)}
                        >
                          <td>{selected ? "✓" : ""}</td>

                          <td style={{ color: "white" }}>{s.name}</td>
                          <td style={{ color: "white" }}>{s.email}</td>
                          <td style={{ color: "white" }}>{s.state}</td>
                          <td style={{ color: "white" }}>{s.assignedGrade ?? "-"}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            {summaryMap[s.submissionId] && (
                              <button
                                className="msv-action-btn msv-action-btn--view"
                                title="View Summary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSummaryViewer({
                                    open: true,
                                    title: `Summary - ${s.name}`,
                                    message: summaryMap[s.submissionId]
                                  });
                                }}
                              >
                                View Summary
                              </button>
                            )}
                          </td>

                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
<Pagination page={page} totalPages={totalPages} onPageChange={fetchPage} />
            </div>
          </div>
        </div>
{summaryViewer.open && (
  <div
    style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center"
    }}
    onClick={() => setSummaryViewer({ open: false, title: "", message: "" })}
  >
    <div
      style={{
        background: "#1e1e2e", borderRadius: 14, padding: 24,
        width: "min(520px, 90vw)", border: "1px solid rgba(139,92,246,0.3)",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)"
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>{summaryViewer.title}</span>
        <button
          onClick={() => setSummaryViewer({ open: false, title: "", message: "" })}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 18 }}
        >✕</button>
      </div>
      <p style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", lineHeight: 1.7, margin: 0 }}>
        {summaryViewer.message}
      </p>
    </div>
  </div>
)}
      </main>
    </div>
  );
}