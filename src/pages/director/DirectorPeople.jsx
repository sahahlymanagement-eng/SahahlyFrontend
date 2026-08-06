import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import api from "../../api/api";
import "./DirectorPeople.css";
import { toast } from "react-toastify";
import { usePagination } from "../../hooks/usePagination";
import Pagination from "../../components/Pagination";

import {
  FiUsers,
  FiUserPlus,
  FiMail,
  FiPhone,
  FiSave,
  FiEdit2,
  FiTrash2,
  FiToggleLeft,
  FiToggleRight,
  FiX
} from "react-icons/fi";

import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";

export default function DirectorPeople() {
  const [roleFilter, setRoleFilter] = useState("all");
  const [selectedManagerId, setSelectedManagerId] = useState("");
  const [managers, setManagers] = useState([]);

  const paginationParams = useMemo(() => {
    const params = {};
    if (roleFilter !== "all") params.role = roleFilter;
    if (selectedManagerId) params.managerId = selectedManagerId;
    return params;
  }, [roleFilter, selectedManagerId]);

  const { data: people, page, totalPages, fetchPage, setData: setPeople } =
    usePagination("/people", paginationParams, 10);
  const [roles, setRoles] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneValue, setPhoneValue] = useState("");

  const [roleSubjectMap, setRoleSubjectMap] = useState({});
  const [selectedSubjects, setSelectedSubjects] = useState({});

  const [loading, setLoading] = useState(false);

  // Edit modal state
  const [editPerson, setEditPerson] = useState(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");

  useEffect(() => {
    loadRolesAndSubjects();
  }, []);

  useEffect(() => {
    const loadManagers = async () => {
      try {
        const res = await api.get("/people", {
          params: { page: 1, limit: 5000, role: "manager" },
        });
        setManagers(res.data?.data || []);
      } catch {
        setManagers([]);
      }
    };

    loadManagers();
  }, []);

  useEffect(() => {
    if (!people.length) return;
    loadRoleSubjectsBatch(people.map((p) => p._id));
  }, [people]);

  const loadRolesAndSubjects = async () => {
    const [rolesRes, subjectsRes] = await Promise.all([
      api.get("/roles"),
      api.get("/subjects?active=true"),
    ]);

    setRoles(rolesRes.data || []);
    setSubjects(subjectsRes.data || []);
  };

  const loadRoleSubjectsBatch = async (personIds) => {
    const res = await api.get(`/role-subject-assignments?personId=${personIds.join(",")}`);
    const assignments = res.data || [];

    const byPerson = new Map(personIds.map((id) => [id, []]));
    for (const a of assignments) {
      const personId = a.personId?._id || a.personId;
      if (!byPerson.has(personId)) byPerson.set(personId, []);
      byPerson.get(personId).push(a);
    }

    setRoleSubjectMap((prev) => ({ ...prev, ...Object.fromEntries(byPerson) }));
    setSelectedSubjects((prev) => ({
      ...prev,
      ...Object.fromEntries(
        [...byPerson].map(([personId, list]) => [personId, list.map((a) => a.subjectId?._id)])
      ),
    }));
  };

  const roleNameById = (roleId) => {
    if (!roleId) return "None";
    if (typeof roleId === "object") return roleId.name;
    return roles.find((r) => r._id === roleId)?.name || "None";
  };

  const roleNameLower = (roleId) => {
    if (!roleId) return "";
    if (typeof roleId === "object") return roleId.name.toLowerCase();
    return roleNameById(roleId).toLowerCase();
  };

  const roleCategoryLabel = (roleId) => {
    const rn = roleNameLower(roleId);
    if (rn === "teacher") return "Teacher";
    if (rn === "manager") return "Manager";
    if (rn === "assistant" || rn === "quality team") return "Assistant";
    return roleNameById(roleId) || "—";
  };

  const isAdmin = (roleId) => roleNameLower(roleId) === "admin";

  const supportsSubjects = (roleId) =>
    ["assistant", "quality team"].includes(roleNameLower(roleId));

  // ── CREATE ──────────────────────────────────────────────────────────────────

  const createPerson = async () => {
    if (!name || !email || !phoneValue) {
      toast.error("All fields are required");
      return;
    }

    try {
      setLoading(true);

      const finalPhone = phoneValue.replace(/\D/g, "");
      if (!finalPhone) {
        toast.error("Please enter a valid phone number");
        return;
      }

      await api.post("/people", { name, email, phone: finalPhone });

      setName("");
      setEmail("");
      setPhoneValue("");

      toast.success("Person created successfully");
      await fetchPage(1);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to create person");
    } finally {
      setLoading(false);
    }
  };

  // ── EDIT ─────────────────────────────────────────────────────────────────────

  const openEdit = (person) => {
    setEditPerson(person);
    setEditName(person.name || "");
    setEditEmail(person.email || "");
    setEditPhone("+" + person.phone || "");
  };

  const closeEdit = () => {
    setEditPerson(null);
    setEditName("");
    setEditEmail("");
    setEditPhone("");
  };

  // Escape closes the edit modal, and the page behind must not scroll under it.
  useEffect(() => {
    if (!editPerson) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeEdit();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [editPerson]);

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
        phone: finalPhone
      });

      toast.success("Person updated successfully");
      closeEdit();
      await fetchPage(1);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to update person");
    } finally {
      setLoading(false);
    }
  };

  // ── DELETE ────────────────────────────────────────────────────────────────────

  const deletePerson = (person) => {
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
                  toast.success("Person deleted successfully");
                  const shouldGoBack =
                    page > 1 && Array.isArray(people) && people.length === 1;
                  await fetchPage(shouldGoBack ? page - 1 : page);
                } catch (err) {
                  toast.error(err.response?.data?.message || "Failed to delete person");
                } finally {
                  setLoading(false);
                }
              }}
              style={{ background: "var(--danger)", color: "#fff", border: "none", borderRadius: "6px", padding: "6px 14px", cursor: "pointer" }}
            >
              Delete
            </button>
            <button
              onClick={closeToast}
              style={{ background: "var(--surface-2)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: "6px", padding: "6px 14px", cursor: "pointer" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ),
      { autoClose: false, closeOnClick: false, closeButton: false }
    );
  };

  // ── DISABLE / ENABLE ──────────────────────────────────────────────────────────

  const toggleStatus = async (person) => {
    const isDisabled = person.status === "disabled";
    const action = isDisabled ? "enable" : "disable";

    try {
      setLoading(true);
      await api.patch(`/people/${person._id}/${action}`);
      toast.success(`Person ${isDisabled ? "enabled" : "disabled"} successfully`);
      await fetchPage(1);
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${action} person`);
    } finally {
      setLoading(false);
    }
  };

  // ── ROLE ──────────────────────────────────────────────────────────────────────

  const assignRole = async (personId, roleId) => {
    try {
      setLoading(true);
      await api.patch(`/people/${personId}/assign-role`, { roleId });
      await fetchPage(1);
    } finally {
      setLoading(false);
    }
  };

  // ── SUBJECTS ──────────────────────────────────────────────────────────────────

  const toggleSubject = (personId, subjectId) => {
    setSelectedSubjects((prev) => {
      const current = prev[personId] || [];
      if (current.includes(subjectId)) {
        return { ...prev, [personId]: current.filter((id) => id !== subjectId) };
      }
      return { ...prev, [personId]: [...current, subjectId] };
    });
  };

  const saveSubjects = async (personId) => {
    try {
      setLoading(true);

      const existing = roleSubjectMap[personId]?.map((a) => a.subjectId._id) || [];
      const selected = selectedSubjects[personId] || [];
      const toAdd = selected.filter((id) => !existing.includes(id));
      const toRemove = existing.filter((id) => !selected.includes(id));

      for (const subjectId of toAdd) {
        await api.post("/role-subject-assignments", { personId, subjectId });
      }
      for (const subjectId of toRemove) {
        await api.delete("/role-subject-assignments", { data: { personId, subjectId } });
      }

      toast.success("Subjects saved");
      await loadRoleSubjectsBatch([personId]);
    } catch (err) {
      toast.error("Failed to save subjects");
    } finally {
      setLoading(false);
    }
  };

  // ── RENDER ────────────────────────────────────────────────────────────────────

  return (
    <div className="directorPeoplePage">
      <div className="peopleContainer">

        {/* HEADER */}
        <div className="peopleTopBar">
          <div className="peopleTitleBox">
            <FiUsers />
            <h2>People Management</h2>
          </div>
        </div>

        {/* FILTERS */}
        <div className="peopleFilters">
          <div className="peopleFilter">
            <label>Manager</label>
            <select
              value={selectedManagerId}
              onChange={(e) => setSelectedManagerId(e.target.value)}
            >
              <option value="">All managers</option>
              {managers.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div className="peopleFilter">
            <label>Role</label>
            <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="teacher">Teacher</option>
              <option value="manager">Manager</option>
              <option value="assistant">Assistant</option>
            </select>
          </div>
        </div>

        {/* ADD PERSON */}
        <div className="addPersonPanel">
          <div className="addPersonInputs">

            <div className="inputField">
              <label>Name</label>
              <input
                placeholder="Enter full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="inputField">
              <label>Email</label>
              <input
                placeholder="Enter email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="inputField">
              <label>Phone</label>
              <PhoneInput
                defaultCountry="eg"
                value={phoneValue}
                onChange={(value) => setPhoneValue(value)}
                className="systemPhoneInput"
                countrySelectorStyleProps={{
                  dropdownStyleProps: {
                    style: { maxHeight: "500px", height: "500px", zIndex: 9999 }
                  }
                }}
              />
            </div>

          </div>

          <button className="addPersonBtn" onClick={createPerson} disabled={loading}>
            <FiUserPlus />
            Add Person
          </button>
        </div>

        {/* GRID */}
        <div className="peopleGrid">
          {people.map((p) => {
            const supports = supportsSubjects(p.roleId);
            const assignments = roleSubjectMap[p._id] || [];
            const selected = selectedSubjects[p._id] || [];
            const admin = isAdmin(p.roleId);
            const disabled = p.status === "disabled";

            return (
              <div className={`personCard ${disabled ? "personDisabled" : ""}`} key={p._id}>

                <div className="personTop">
                  <div className="personIdentity">
                    <div className="personNameRow">
                      <h3>{p.name}</h3>
                      {p.roleId && (
                        <span className="personRoleBadge">{roleCategoryLabel(p.roleId)}</span>
                      )}
                    </div>
                    <div className="personMeta">
                      <span><FiMail /> {p.email}</span>
                      <span><FiPhone /> +{p.phone}</span>
                    </div>
                  </div>

                  <div className="roleBox">
                    <label>Role</label>
                    <select
                      value={p.roleId?._id || ""}
                      onChange={(e) => assignRole(p._id, e.target.value)}
                    >
                      <option value="">Select role</option>
                      {roles.map((r) => (
                        <option key={r._id} value={r._id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* ACTION BUTTONS — hidden for admin */}
                {!admin && (
                  <div className="personActions">

                    <button
                      className="actionBtn editBtn"
                      onClick={() => openEdit(p)}
                      title="Edit"
                    >
                      <FiEdit2 size={14} /> Edit
                    </button>

                    <button
                      className={`actionBtn toggleBtn ${disabled ? "enableBtn" : "disableBtn"}`}
                      onClick={() => toggleStatus(p)}
                      title={disabled ? "Enable" : "Disable"}
                    >
                      {disabled
                        ? <><FiToggleRight size={14} /> Enable</>
                        : <><FiToggleLeft size={14} /> Disable</>
                      }
                    </button>

                    <button
                      className="actionBtn deleteBtn"
                      onClick={() => deletePerson(p)}
                      title="Delete"
                    >
                      <FiTrash2 size={14} /> Delete
                    </button>

                  </div>
                )}

                {Array.isArray(p.subjects) && p.subjects.length > 0 && (
                  <div className="subjectsReadonlyPanel">
                    <div className="subjectsReadonlyLabel">Subjects</div>
                    <div className="assignedSubjects">
                      {p.subjects.map((s) => (
                        <span className="subjectTag" key={s._id || s.name}>
                          {s.name || s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {supports && (
                  <div className="subjectsPanel">

                    <div className="assignedSubjects">
                      {assignments.map((a) => (
                        <span className="subjectTag" key={a._id}>
                          {a.subjectId?.name}
                        </span>
                      ))}
                    </div>

                    <div className="subjectsSelector">
                      {subjects.map((s) => {
                        const checked = selected.includes(s._id);
                        return (
                          <label key={s._id} className={`subjectItem ${checked ? "active" : ""}`}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSubject(p._id, s._id)}
                            />
                            {s.name}
                          </label>
                        );
                      })}
                    </div>

                    <button className="saveSubjectsBtn" onClick={() => saveSubjects(p._id)}>
                      <FiSave /> Save Subjects
                    </button>

                  </div>
                )}

              </div>
            );
          })}
        </div>

        <Pagination page={page} totalPages={totalPages} onPageChange={fetchPage} />

        {loading && <p className="loading">Processing...</p>}
      </div>

      {/* EDIT MODAL — portalled to document.body; .director-page-inner runs a
          fade-up animation with fill-mode `both`, and the animation's final
          transform sticks around permanently, making that ancestor a
          containing block for `position: fixed` children. An in-place modal
          would anchor to the padded content column instead of the viewport
          and scroll away with the page. */}
      {editPerson &&
        createPortal(
          <div className="modalOverlay" onClick={closeEdit}>
            <div className="modalCard" onClick={(e) => e.stopPropagation()}>

              <div className="modalHeader">
                <h3>Edit Person</h3>
                <button className="modalClose" onClick={closeEdit}><FiX /></button>
              </div>

              <div className="modalBody">

                <div className="inputField">
                  <label>Name</label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Full name"
                  />
                </div>

                <div className="inputField">
                  <label>Email</label>
                  <input
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="Email"
                  />
                </div>

                <div className="inputField">
                  <label>Phone</label>
                  <PhoneInput
                    defaultCountry="eg"
                    value={editPhone}
                    onChange={(value) => setEditPhone(value)}
                    className="systemPhoneInput"
                    countrySelectorStyleProps={{
                      dropdownStyleProps: {
                        style: { maxHeight: "300px", height: "300px", zIndex: 9999 }
                      }
                    }}
                  />
                </div>

              </div>

              <div className="modalFooter">
                <button className="cancelModalBtn" onClick={closeEdit}>Cancel</button>
                <button className="saveModalBtn" onClick={saveEdit} disabled={loading}>
                  <FiSave /> Save Changes
                </button>
              </div>

            </div>
          </div>,
          document.body
        )}

    </div>
  );
}