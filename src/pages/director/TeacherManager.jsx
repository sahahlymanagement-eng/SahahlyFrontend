import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import "./TeacherManager.css";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import { toast } from "react-toastify";
import {
  FiHome,
  FiUsers,
  FiPlusCircle,
  FiMenu,
  FiX,
  FiLogOut,
  FiChevronRight,
  FiEdit2,
  FiTrash2,
  FiMail,
  FiPhone,
  FiUser
} from "react-icons/fi";

export default function TeacherManager() {
  const navigate = useNavigate();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [user, setUser] = useState(null);

  const [teachers, setTeachers] = useState([]);
  const [editingId, setEditingId] = useState(null);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: ""
  });

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");

    if (!storedUser || !token) {
      navigate("/login", { replace: true });
      return;
    }

    const parsed = JSON.parse(storedUser);
    setUser(parsed);
    loadTeachers();
  }, [navigate]);

  const loadTeachers = async () => {
    try {
      const res = await api.get("/teachers");
      setTeachers(res.data || []);
    } catch (err) {
      console.error("Failed to load teachers", err);
      toast.error(err.response?.data?.message || "Failed to load teachers");
    }
  };

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
  };

  const createTeacher = async () => {
    try {
      if (!form.name || !form.phone) {
        toast.warn("Name and phone are required");
        return;
      }

      await api.post("/teachers", form);

      setForm({ name: "", phone: "", email: "" });
      loadTeachers();
      toast.success("Teacher created successfully");
    } catch (err) {
      console.error("Failed to create teacher", err);
      toast.error(err.response?.data?.message || "Failed to create teacher");
    }
  };

  const deleteTeacher = async (id) => {
    toast(
      ({ closeToast }) => (
        <div>
          <p style={{ margin: "0 0 10px" }}>Delete this teacher?</p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={async () => {
                closeToast();
                try {
                  await api.delete(`/teachers/${id}`);
                  loadTeachers();
                  toast.success("Teacher deleted successfully");
                } catch (err) {
                  console.error("Failed to delete teacher", err);
                  toast.error(err.response?.data?.message || "Failed to delete teacher");
                }
              }}
              style={{
                background: "var(--danger)",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              Delete
            </button>
            <button
              onClick={closeToast}
              style={{
                background: "var(--surface-2)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                padding: "6px 14px",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ),
      { autoClose: false }
    );
  };

  const startEdit = (teacher) => {
    setEditingId(teacher._id);

    setForm({
      name: teacher.name || "",
      phone: teacher.phone || "",
      email: teacher.email || ""
    });
  };

  const updateTeacher = async () => {
    try {
      await api.put(`/teachers/${editingId}`, form);

      setEditingId(null);
      setForm({ name: "", phone: "", email: "" });

      loadTeachers();
      toast.success("Teacher updated successfully");
    } catch (err) {
      console.error("Failed to update teacher", err);
      toast.error(err.response?.data?.message || "Failed to update teacher");
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm({ name: "", phone: "", email: "" });
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  };

  const navItems = [
    { icon: <FiHome />, label: "Dashboard", active: false, onClick: () => navigate("/director/dashboard") },
    { icon: <FiUsers />, label: "Teachers", active: true, onClick: () => {} }
  ];

  if (!user) return null;

  return (
    <div className="tm-root">
      

      {/* MAIN */}
      <main className="tm-main">

        <div className="tm-content">
          {/* FORM SECTION */}
          <section className="tm-section">
            <div className="tm-section-header">
              <div className="tm-section-title-wrap">
                <span className="tm-section-dot" />
                <h2 className="tm-section-title">
                  {editingId ? "Edit Teacher" : "Create Teacher"}
                </h2>
              </div>
            </div>

            <div className="tm-form-card">
              <div className="tm-form-grid">
                <div className="tm-input-wrap">
                  <FiUser className="tm-input-icon" size={15} />
                  <input
                    name="name"
                    placeholder="Teacher Name"
                    value={form.name}
                    onChange={handleChange}
                    className="tm-input"
                  />
                </div>

                <div className="tm-input-wrap tm-phone-wrap">
                  <PhoneInput
                    defaultCountry="eg"
                    value={`+${form.phone}`}
                    onChange={(value) =>
                      setForm((prev) => ({
                        ...prev,
                        phone: value.replace(/\D/g, "")
                      }))
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
                <div className="tm-input-wrap">
                  <FiMail className="tm-input-icon" size={15} />
                  <input
                    name="email"
                    placeholder="Email (optional)"
                    value={form.email}
                    onChange={handleChange}
                    className="tm-input"
                  />
                </div>
              </div>

              <div className="tm-form-actions">
                {editingId ? (
                  <>
                    <button className="tm-primary-btn" onClick={updateTeacher}>
                      Update
                    </button>

                    <button className="tm-secondary-btn" onClick={cancelEdit}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="tm-primary-btn" onClick={createTeacher}>
                    <FiPlusCircle size={15} />
                    <span>Save Teacher</span>
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* TABLE SECTION */}
          <section className="tm-section">
            <div className="tm-section-header">
              <div className="tm-section-title-wrap">
                <span className="tm-section-dot" />
                <h2 className="tm-section-title">Teachers List</h2>
                <span className="tm-section-count">{teachers.length}</span>
              </div>
            </div>

            <div className="tm-table-wrap">
              <table className="tm-table sah-table--cards">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {teachers.length > 0 ? (
                    teachers.map((t) => (
                      <tr key={t._id} className="tm-row">
                        <td data-label="Name">
                          <span className="tm-cell-primary">{t.name}</span>
                        </td>
                        <td data-label="Phone">
                          <span className="tm-cell-muted">{t.phone}</span>
                        </td>
                        <td data-label="Email">
                          <span className="tm-cell-muted">{t.email || "-"}</span>
                        </td>
                        <td>
                          <div className="tm-actions">
                            <button
                              className="tm-edit-btn"
                              onClick={() => startEdit(t)}
                            >
                              <FiEdit2 size={14} />
                              <span>Edit</span>
                            </button>

                            <button
                              className="tm-delete-btn"
                              onClick={() => deleteTeacher(t._id)}
                            >
                              <FiTrash2 size={14} />
                              <span>Delete</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4">
                        <div className="tm-empty-state">
                          <FiUsers size={40} />
                          <p>No teachers found</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}