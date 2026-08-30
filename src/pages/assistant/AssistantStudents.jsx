import { useEffect, useState, useRef } from "react";
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
import {
  phoneFieldForSave,
  stripPhoneDigits,
} from "../../utils/phoneInputFormat";

export default function AssistantStudents() {
  const { assignmentId } = useParams();
  const navigate = useNavigate();   
  // const [students, setStudents] = useState([]);
  // const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editBaseline, setEditBaseline] = useState({});
  const pageRef = useRef(1);

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
 const { data: students, page, totalPages, loading, fetchPage, setData: setStudents, extra } =
  usePagination(
    `/assignment-submissions/${assignmentId}/students`,
    {},
    10,
    "students",
    !!assignmentId
  );
  const classroomId = extra?.classroomId || null;
  pageRef.current = page;
/* EDIT */
  const startEdit = (s) => {
    const baseline = {
      name: s.name || "",
      phone: stripPhoneDigits(s.phone),
      parentName: s.parentName || "",
      parentPhone: stripPhoneDigits(s.parentPhone),
      email: s.email || "",
    };
    setEditingId(s.studentId);
    setEditBaseline(baseline);
    setEditForm(baseline);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveEdit = async (studentId) => {
    try {
      const phone = phoneFieldForSave(editForm.phone, {
        hadValue: Boolean(editBaseline.phone),
      });
      const parentPhone = phoneFieldForSave(editForm.parentPhone, {
        hadValue: Boolean(editBaseline.parentPhone),
      });

      const payload = {
        name: editForm.name,
        email: editForm.email,
        parentName: editForm.parentName,
        classroomId,
      };
      if (phone !== undefined) payload.phone = phone;
      if (parentPhone !== undefined) payload.parentPhone = parentPhone;

      const res = await api.put(`/students/google/${studentId}`, payload);

      setStudents((prev) =>
        prev.map((s) =>
          s.studentId === studentId
            ? {
                ...s,
                phone: res.data.phone,
                parentName: res.data.parentName,
                parentPhone: res.data.parentPhone,
                name: res.data.name ?? s.name,
                email: res.data.email ?? s.email,
              }
            : s
        )
      );

      setEditingId(null);
      setEditBaseline({});
      await fetchPage(pageRef.current);
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
                                      phone: stripPhoneDigits(e.target.value),
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
                                      parentPhone: stripPhoneDigits(e.target.value),
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