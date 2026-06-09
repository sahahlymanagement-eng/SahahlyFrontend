import { useEffect, useState } from "react";
import { useParams,useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import "../manager/ManagerAssignments.css";
import {
  FiSend,
  FiCheckSquare,
  FiMessageSquare,
  FiRefreshCw
} from "react-icons/fi";

import {getSummary} from "../../utils/sharedSummary";

export default function AssistantReports() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);

  const [reportCart, setReportCart] = useState({});
  const [sending, setSending] = useState(false);

  const [customPhone, setCustomPhone] = useState("");
  const [sendingCollective, setSendingCollective] = useState(false);
  
  const summary = getSummary();
  /* LOAD STUDENTS */
  useEffect(() => {
    if (!assignmentId) return;
    fetchStudents();
  }, [assignmentId]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await api.get(
        `/assignment-submissions/${assignmentId}/students`
      );
      setStudents(res.data.students || []);
    } catch {
      toast.error("Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  /* HELPERS */
  const getStudentId = (s) => s.studentId || s._id;

  const buildItem = () => ({
    assignmentTitle: "Assignment",
    state: "",
    submittedAt: null,
    isLate: false,
    isOnTime: false,
    assignedGrade: null,
    comment: ""
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
          items: { [asgId]: buildItem() }
        };
      } else if (next[stuId].items[asgId]) {
        delete next[stuId].items[asgId];

        if (Object.keys(next[stuId].items).length === 0) {
          delete next[stuId];
        }
      } else {
        next[stuId].items[asgId] = buildItem();
      }

      return next;
    });
  };

  /* SELECT ALL */
  const selectAll = () => {
    const asgId = assignmentId;

    setReportCart((prev) => {
      const next = { ...prev };

      students.forEach((s) => {
        const stuId = String(getStudentId(s));

        if (!next[stuId]) {
          next[stuId] = {
            studentMeta: s,
            items: { [asgId]: buildItem() }
          };
        } else if (!next[stuId].items[asgId]) {
          next[stuId].items[asgId] = buildItem();
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
  const buildReportsPayload = () => {
    return Object.entries(reportCart).map(([, entry]) => ({
      name: entry.studentMeta.name,
      phone: entry.studentMeta.phone,
      parentPhone: entry.studentMeta.parentPhone,
      items: Object.values(entry.items)
    }));
  };

  /* SEND NORMAL REPORT */
  const sendReport = async () => {
    const reports = buildReportsPayload();

    if (!reports.length) {
      toast.warn("No students selected");
      return;
    }

    setSending(true);
    try {
await api.post(
  `/assignment-submissions/${assignmentId}/students/reports`,
  {
    type: "individual",
    reports
  }
);

      toast.success("Reports sent successfully");
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
              {students.length} students
            </span>
          </div>

          <div className="ma-topbar-right">
    <div>
      <p>{JSON.stringify(summary, null, 2)}</p>
    </div>
            <button className="ma-send-btn" onClick={fetchStudents}>
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
                          <td style={{ color: "white" }}>
                            {s.assignedGrade ?? "-"}
                          </td>

                          <td onClick={(e) => e.stopPropagation()}>
                            {selected && (
                              <div style={{ display: "flex", gap: 6 }}>
                                <FiMessageSquare size={12} />
                                <input
                                  value={
                                    reportCart?.[stuId]?.items?.[asgId]
                                      ?.comment || ""
                                  }
                                  onChange={(e) =>
                                    setComment(stuId, e.target.value)
                                  }
                                  placeholder="Comment..."
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

            </div>
          </div>
        </div>

      </main>
    </div>
  );
}