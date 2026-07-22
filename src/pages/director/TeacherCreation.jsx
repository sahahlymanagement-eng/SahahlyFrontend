import { useEffect, useState } from "react";
import api from "../../api/api";
import "./TeacherCreation.css";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";
import {
  FiUser,
  FiMail,
  FiPhone,
  FiPlusCircle,
  FiEdit2,
  FiTrash2,
  FiUsers,
  FiToggleLeft,
  FiToggleRight,
  FiSave,
  FiX
} from "react-icons/fi";
import { toast } from "react-toastify";

export default function TeacherCreation() {
  const [teachers, setTeachers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [teacherRoleId, setTeacherRoleId] = useState(null);
  const [loading, setLoading] = useState(false);

  // Create form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Edit modal
  const [editPerson, setEditPerson] = useState(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      const [rolesRes, peopleRes] = await Promise.all([
        api.get("/roles"),
        api.get("/people", { params: { page: 1, limit: 5000 } }),
      ]);

      const allRoles = rolesRes.data || [];
      setRoles(allRoles);

      const teacherRole = allRoles.find(
        (r) => r.name.toLowerCase() === "teacher"
      );
      setTeacherRoleId(teacherRole?._id || null);

      const allPeople = peopleRes.data.data || [];
      const teacherPeople = allPeople.filter((p) => {
        const roleId =
          typeof p.roleId === "object" ? p.roleId?._id : p.roleId;
        return roleId === teacherRole?._id;
      });
      setTeachers(teacherPeople);
    } catch (err) {
      toast.error("Failed to load data");
    }
  };

  // ── CREATE ────────────────────────────────────────────────────────────────

  const createTeacher = async () => {
    if (!name || !email || !phone) {
      toast.error("All fields are required");
      return;
    }

    const finalPhone = phone.replace(/\D/g, "");
    if (!finalPhone) {
      toast.error("Please enter a valid phone number");
      return;
    }

    if (!teacherRoleId) {
      toast.error('No "Teacher" role found. Please create it first.');
      return;
    }

    try {
      setLoading(true);

      // 1. Create the person
      const createRes = await api.post("/people", {
        name,
        email,
        phone: finalPhone,
      });

      const newPersonId = createRes.data?._id;

      // 2. Assign teacher role
      await api.patch(`/people/${newPersonId}/assign-role`, {
        roleId: teacherRoleId,
      });

      toast.success("Teacher created successfully");
      setName("");
      setEmail("");
      setPhone("");
      await loadInitialData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create teacher");
    } finally {
      setLoading(false);
    }
  };

  // ── EDIT ──────────────────────────────────────────────────────────────────

  const openEdit = (person) => {
    setEditPerson(person);
    setEditName(person.name || "");
    setEditEmail(person.email || "");
    setEditPhone("+" + (person.phone || ""));
  };

  const closeEdit = () => {
    setEditPerson(null);
    setEditName("");
    setEditEmail("");
    setEditPhone("");
  };

  const saveEdit = async () => {
    if (!editName || !editEmail || !editPhone) {
      toast.error("All fields are required");
      return;
    }

    const finalPhone = editPhone.replace(/\D/g, "");
    if (!finalPhone) {
      toast.error("Please enter a valid phone number");
      return;
    }

    try {
      setLoading(true);
      await api.patch(`/people/${editPerson._id}`, {
        name: editName,
        email: editEmail,
        phone: finalPhone,
      });

      toast.success("Teacher updated successfully");
      closeEdit();
      await loadInitialData();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update teacher");
    } finally {
      setLoading(false);
    }
  };

  // ── DELETE ────────────────────────────────────────────────────────────────

  const deleteTeacher = (person) => {
    toast(
      ({ closeToast }) => (
        <div>
          <p style={{ margin: "0 0 10px" }}>
            Delete <strong>{person.name}</strong>? This cannot be undone.
          </p>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={async () => {
                closeToast();
                try {
                  setLoading(true);
                  await api.delete(`/people/${person._id}`);
                  toast.success("Teacher deleted successfully");
                  await loadInitialData();
                } catch (err) {
                  toast.error(
                    err.response?.data?.message || "Failed to delete teacher"
                  );
                } finally {
                  setLoading(false);
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
      { autoClose: false, closeOnClick: false, closeButton: false }
    );
  };

  // ── TOGGLE STATUS ─────────────────────────────────────────────────────────

  const toggleStatus = async (person) => {
    const isDisabled = person.status === "disabled";
    const action = isDisabled ? "enable" : "disable";

    try {
      setLoading(true);
      await api.patch(`/people/${person._id}/${action}`);
      toast.success(`Teacher ${isDisabled ? "enabled" : "disabled"} successfully`);
      await loadInitialData();
    } catch (err) {
      toast.error(
        err.response?.data?.message || `Failed to ${action} teacher`
      );
    } finally {
      setLoading(false);
    }
  };

  // ── RENDER ────────────────────────────────────────────────────────────────

  return (
    <div className="tc-root">
      <main className="tc-main">
        <div className="tc-content">

          {/* FORM SECTION */}
          <section className="tc-section">
            <div className="tc-section-header">
              <div className="tc-section-title-wrap">
                <span className="tc-section-dot" />
                <h2 className="tc-section-title">Add Teacher</h2>
              </div>
            </div>

            <div className="tc-form-card">
              <div className="tc-form-grid">

                <div className="tc-input-wrap">
                  <FiUser className="tc-input-icon" size={15} />
                  <input
                    placeholder="Full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="tc-input"
                  />
                </div>

                <div className="tc-input-wrap">
                  <FiMail className="tc-input-icon" size={15} />
                  <input
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="tc-input"
                  />
                </div>

                <div className="tc-input-wrap tc-phone-wrap">
                  <PhoneInput
                    defaultCountry="eg"
                    value={phone}
                    onChange={(value) => setPhone(value)}
                    className="tc-phone-input"
                    countrySelectorStyleProps={{
                      dropdownStyleProps: {
                        style: { maxHeight: "350px", zIndex: 9999 },
                      },
                    }}
                  />
                </div>

              </div>

              <div className="tc-form-actions">
                <button
                  className="tc-primary-btn"
                  onClick={createTeacher}
                  disabled={loading}
                >
                  <FiPlusCircle size={15} />
                  <span>Add Teacher</span>
                </button>
              </div>
            </div>
          </section>

          {/* TABLE SECTION */}
          <section className="tc-section">
            <div className="tc-section-header">
              <div className="tc-section-title-wrap">
                <span className="tc-section-dot" />
                <h2 className="tc-section-title">Teachers</h2>
                <span className="tc-section-count">{teachers.length}</span>
              </div>
            </div>

            <div className="tc-table-wrap">
              {/* Scroller sits inside the rounded box: .tc-table-wrap uses
                  overflow:hidden to clip its radius and can't also scroll. */}
              <div className="sah-table-scroll">
              <table className="tc-table sah-table--cards">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.length > 0 ? (
                    teachers.map((t) => {
                      const disabled = t.status === "disabled";
                      return (
                        <tr key={t._id} className={`tc-row ${disabled ? "tc-row-disabled" : ""}`}>
                          <td data-label="Name">
                            <span className="tc-cell-primary">{t.name}</span>
                          </td>
                          <td data-label="Email">
                            <span className="tc-cell-muted">{t.email}</span>
                          </td>
                          <td data-label="Phone">
                            <span className="tc-cell-muted">+{t.phone}</span>
                          </td>
                          <td data-label="Status">
                            <span className={`tc-status-badge ${disabled ? "tc-badge-disabled" : "tc-badge-active"}`}>
                              {disabled ? "Disabled" : "Active"}
                            </span>
                          </td>
                          <td>
                            <div className="tc-actions">
                              <button
                                className="tc-edit-btn"
                                onClick={() => openEdit(t)}
                                title="Edit"
                              >
                                <FiEdit2 size={14} />
                                <span>Edit</span>
                              </button>

                              <button
                                className={`tc-toggle-btn ${disabled ? "tc-enable-btn" : "tc-disable-btn"}`}
                                onClick={() => toggleStatus(t)}
                                title={disabled ? "Enable" : "Disable"}
                              >
                                {disabled
                                  ? <><FiToggleRight size={14} /><span>Enable</span></>
                                  : <><FiToggleLeft size={14} /><span>Disable</span></>
                                }
                              </button>

                              <button
                                className="tc-delete-btn"
                                onClick={() => deleteTeacher(t)}
                                title="Delete"
                              >
                                <FiTrash2 size={14} />
                                <span>Delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="5">
                        <div className="tc-empty-state">
                          <FiUsers size={38} />
                          <p>No teachers yet. Add one above.</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>
          </section>

        </div>
      </main>

      {/* EDIT MODAL */}
      {editPerson && (
        <div className="tc-modal-overlay" onClick={closeEdit}>
          <div className="tc-modal-card" onClick={(e) => e.stopPropagation()}>

            <div className="tc-modal-header">
              <h3>Edit Teacher</h3>
              <button className="tc-modal-close" onClick={closeEdit}>
                <FiX />
              </button>
            </div>

            <div className="tc-modal-body">

              <div className="tc-input-field">
                <label>Name</label>
                <div className="tc-input-wrap">
                  <FiUser className="tc-input-icon" size={15} />
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Full name"
                    className="tc-input"
                  />
                </div>
              </div>

              <div className="tc-input-field">
                <label>Email</label>
                <div className="tc-input-wrap">
                  <FiMail className="tc-input-icon" size={15} />
                  <input
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="Email address"
                    className="tc-input"
                  />
                </div>
              </div>

              <div className="tc-input-field">
                <label>Phone</label>
                <PhoneInput
                  defaultCountry="eg"
                  value={editPhone}
                  onChange={(value) => setEditPhone(value)}
                  className="tc-phone-input"
                  countrySelectorStyleProps={{
                    dropdownStyleProps: {
                      style: { maxHeight: "300px", zIndex: 9999 },
                    },
                  }}
                />
              </div>

            </div>

            <div className="tc-modal-footer">
              <button className="tc-cancel-btn" onClick={closeEdit}>
                Cancel
              </button>
              <button
                className="tc-save-btn"
                onClick={saveEdit}
                disabled={loading}
              >
                <FiSave size={14} /> Save Changes
              </button>
            </div>

          </div>
        </div>
      )}

      {loading && <p className="tc-loading">Processing...</p>}
    </div>
  );
}
