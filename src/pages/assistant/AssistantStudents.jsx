import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { FiEdit2, FiCheck, FiX, FiRefreshCw, FiUsers } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

import "../manager/ManagerStudents.css";
import { usePagination } from "../../hooks/usePagination";
import Pagination from "../../components/Pagination";

export default function AssistantStudents() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();   
  // const [students, setStudents] = useState([]);
  // const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  // useEffect(() => {
  //   if (!assignmentId) return;
  //   fetchStudents();
  // }, [assignmentId]);

// const fetchStudents = async () => 
//   { setLoading(true); 
//     try { 
//       const res = await api.get( `/assignment-submissions/${assignmentId}/students` ); 
//       setStudents(res.data.students || []); 
//     } 
//     catch { 
//       toast.error("Failed to load students"); 
//     } finally { setLoading(false); } };
 const { data: students, page, totalPages, loading, fetchPage, setData: setStudents } =
  usePagination(
    `/assignment-submissions/${assignmentId}/students`,
    {},
    10,
    "students",
    !!assignmentId
  );
/* EDIT */
  const startEdit = (s) => {
    setEditingId(s.studentId);
    setEditForm({
      name: s.name || "",
      phone: s.phone || "",
      parentName: s.parentName || "",
      parentPhone: s.parentPhone || "",
      email: s.email || "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (studentId) => {
    try {
      const payload = {
        ...editForm,
        phone: editForm.phone?.replace(/\D/g, ""),
        parentPhone: editForm.parentPhone?.replace(/\D/g, "")
      };

      const res = await api.put(`/students/google/${studentId}`, payload);

setStudents((prev) =>
  prev.map((s) =>
    s.studentId === studentId
      ? { ...s, ...res.data }
      : s
  )
);

      setEditingId(null);
      toast.success("Student updated");
    } catch {
      toast.error("Failed to update student");
    }
  };

  return (
    <div className="ms-root">

      <main className="ms-main">

        {/* TOPBAR */}
        <header className="ms-topbar">
          <div className="ms-topbar-left">
            <h1 className="ms-topbar-title">Assignment Students</h1>
            <span className="ms-topbar-sub">
              Editable student details for this assignment
            </span>
          </div>

          <div className="ms-topbar-right">
              <button
                className="ma-send-btn"
                onClick={() => navigate(-1)}
                style={{ marginRight: "8px" }}
              >
                ← Back
              </button>
            
            <button className="ma-send-btn" onClick={() => fetchPage(page)}>
              <FiRefreshCw /> Refresh
            </button>

            <div className="ms-total-pill">
              <FiUsers size={13} />
              <span>{students.length} students</span>
            </div>
          </div>
        </header>

        {/* TABLE */}
        <div className="ms-content">
          <div className="ms-table-wrap">
            <div className="ms-table-scroll">

              {loading ? (
                <p className="ms-empty-state">Loading...</p>
              ) : (
                <div className="sah-table-scroll">
                <table className="ms-table sah-table--cards">

                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Name</th>
                      <th>Phone</th>
                      <th>Parent Name</th>
                      <th>Parent Phone</th>
                      <th>Email</th>
                    </tr>
                  </thead>

                  <tbody>
                    {students.map((s, i) => {
                      const isEditing = editingId === s.studentId;

                      return (
                        <tr key={s.studentId} className="ms-row">

                          <td data-label="#">{(page - 1) * 10 + i + 1}</td>

                          {isEditing ? (
                            <>
                              <td data-label="Name">
                                <input
                                  className="ms-edit-input"
                                  value={editForm.name}
                                  onChange={(e) =>
                                    setEditForm((p) => ({
                                      ...p,
                                      name: e.target.value
                                    }))
                                  }
                                />
                              </td>

                              <td data-label="Phone">
                                <input
                                  className="ms-edit-input"
                                  value={editForm.phone}
                                  onChange={(e) =>
                                    setEditForm((p) => ({
                                      ...p,
                                      phone: e.target.value
                                    }))
                                  }
                                />
                              </td>

                              <td data-label="Parent Name">
                                <input
                                  className="ms-edit-input"
                                  value={editForm.parentName}
                                  onChange={(e) =>
                                    setEditForm((p) => ({
                                      ...p,
                                      parentName: e.target.value
                                    }))
                                  }
                                />
                              </td>

                              <td data-label="Parent Phone">
                                <input
                                  className="ms-edit-input"
                                  value={editForm.parentPhone}
                                  onChange={(e) =>
                                    setEditForm((p) => ({
                                      ...p,
                                      parentPhone: e.target.value
                                    }))
                                  }
                                />
                                </td>
                                <td data-label="Email">
                                 <input
                                  className="ms-edit-input"
                                  value={editForm.email}
                                  onChange={(e) =>
                                    setEditForm((p) => ({
                                      ...p,
                                      email: e.target.value
                                    }))
                                  }
                                />
                              </td>

                              <td>
                                <div className="ms-action-wrap">
                                  <button
                                    className="ms-save-btn"
                                    onClick={() => saveEdit(s.studentId)}
                                  >
                                    <FiCheck size={12} /> Save
                                  </button>

                                  <button
                                    className="ms-cancel-btn"
                                    onClick={cancelEdit}
                                  >
                                    <FiX size={12} /> Cancel
                                  </button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td data-label="Name">
                                <div className="ms-avatar-cell">
                                  <div className="ms-avatar">
                                    {(s.name || "?").charAt(0).toUpperCase()}
                                  </div>
                                  <span className="ms-cell-name">
                                    {s.name || "—"}
                                  </span>
                                </div>
                              </td>

                            <td data-label="Phone" style={{ color: "white" }}>{s.phone || "—"}</td>
                            <td data-label="Parent Name" style={{ color: "white" }}>{s.parentName || "—"}</td>
                            <td data-label="Parent Phone" style={{ color: "white" }}>{s.parentPhone || "—"}</td>
                            <td data-label="Email" style={{ color: "white" }}>{s.email || "—"}</td>

                              <td>
                                <div className="ms-action-wrap">
                                  <button
                                    className="ms-edit-btn"
                                    onClick={() => startEdit(s)}
                                  >
                                    <FiEdit2 size={11} /> Edit
                                  </button>
                                </div>
                              </td>
                            </>
                          )}

                        </tr>
                      );
                    })}
                  </tbody>

                </table>
                </div>

              )}
<Pagination page={page} totalPages={totalPages} onPageChange={fetchPage} />
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}