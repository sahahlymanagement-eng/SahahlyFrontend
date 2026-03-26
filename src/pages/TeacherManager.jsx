import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import "./TeacherManager.css";
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
      alert(err.response?.data?.message || "Failed to load teachers");
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
      if (!form.name || !form.phone) return;

      await api.post("/teachers", form);

      setForm({ name: "", phone: "", email: "" });
      loadTeachers();
    } catch (err) {
      console.error("Failed to create teacher", err);
      alert(err.response?.data?.message || "Failed to create teacher");
    }
  };

  const deleteTeacher = async (id) => {
    try {
      if (!window.confirm("Delete this teacher?")) return;

      await api.delete(`/teachers/${id}`);
      loadTeachers();
    } catch (err) {
      console.error("Failed to delete teacher", err);
      alert(err.response?.data?.message || "Failed to delete teacher");
    }
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
    } catch (err) {
      console.error("Failed to update teacher", err);
      alert(err.response?.data?.message || "Failed to update teacher");
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

                <div className="tm-input-wrap">
                  <FiPhone className="tm-input-icon" size={15} />
                  <input
                    name="phone"
                    placeholder="Phone Number"
                    value={form.phone}
                    onChange={handleChange}
                    className="tm-input"
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
              <table className="tm-table">
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
                        <td>
                          <span className="tm-cell-primary">{t.name}</span>
                        </td>
                        <td>
                          <span className="tm-cell-muted">{t.phone}</span>
                        </td>
                        <td>
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