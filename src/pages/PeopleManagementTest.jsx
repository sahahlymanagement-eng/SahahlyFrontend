import { useEffect, useState } from "react";
import api from "../api/api";

export default function PeopleManagementTest() {
  const [people, setPeople] = useState([]);
  const [roles, setRoles] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [roleSubjectMap, setRoleSubjectMap] = useState({});
  const [selectedSubjects, setSelectedSubjects] = useState({});

  const [loading, setLoading] = useState(false);

  /* ================= LOAD BASE DATA ================= */

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    await Promise.all([loadRoles(), loadSubjects(), loadPeople()]);
  };

  const loadRoles = async () => {
    const res = await api.get("/roles");
    setRoles(Array.isArray(res.data) ? res.data : []);
  };

  const loadSubjects = async () => {
    const res = await api.get("/subjects?active=true");
    setSubjects(Array.isArray(res.data) ? res.data : []);
  };

  const loadPeople = async () => {
    const res = await api.get("/people");
    const list = Array.isArray(res.data) ? res.data : [];
    setPeople(list);

    // Load role-subject assignments for each person
    list.forEach((p) => loadRoleSubjects(p._id));
  };

  const loadRoleSubjects = async (personId) => {
    const res = await api.get(
      `/role-subject-assignments?personId=${personId}`
    );

    setRoleSubjectMap((prev) => ({
      ...prev,
      [personId]: Array.isArray(res.data) ? res.data : [],
    }));
  };

  /* ================= HELPERS ================= */

  const roleNameById = (roleId) =>
    roles.find((r) => r._id === roleId)?.name || "None";

  const roleNameLower = (roleId) =>
    roleNameById(roleId).trim().toLowerCase();

  const supportsSubjects = (roleId) =>
    ["assistant", "quality team"].includes(roleNameLower(roleId));

  /* ================= CREATE PERSON ================= */

  const createPerson = async () => {
    if (!name || !email || !phone) {
      alert("All fields required");
      return;
    }

    try {
      setLoading(true);
      await api.post("/people", { name, email, phone });
      setName("");
      setEmail("");
      setPhone("");
      await loadPeople();
    } catch {
      alert("Create person failed");
    } finally {
      setLoading(false);
    }
  };

  /* ================= ROLE ASSIGNMENT ================= */

  const assignRole = async (personId, roleId) => {
    try {
      setLoading(true);
      await api.patch(`/people/${personId}/assign-role`, { roleId });

      await loadPeople();

      // Reset selected subjects if role no longer supports subjects
      if (!supportsSubjects(roleId)) {
        setSelectedSubjects((prev) => ({ ...prev, [personId]: [] }));
      }
    } catch {
      alert("Assign role failed");
    } finally {
      setLoading(false);
    }
  };

  /* ================= SUBJECT ASSIGNMENT ================= */

  const saveSubjects = async (personId) => {
    try {
      setLoading(true);

      const existing =
        roleSubjectMap[personId]?.map((a) => a.subjectId._id) || [];

      const selected = selectedSubjects[personId] || [];

      const toAdd = selected.filter((id) => !existing.includes(id));
      const toRemove = existing.filter((id) => !selected.includes(id));

      for (const subjectId of toAdd) {
        await api.post("/role-subject-assignments", {
          personId,
          subjectId,
        });
      }

      for (const subjectId of toRemove) {
        await api.delete("/role-subject-assignments", {
          data: { personId, subjectId },
        });
      }

      await loadRoleSubjects(personId);
    } catch {
      alert("Saving subjects failed");
    } finally {
      setLoading(false);
    }
  };

  /* ================= UI ================= */

  return (
    <div style={{ padding: 30 }}>
      <h2>People Management (Unified)</h2>

      <hr />

      <h3>➕ Add Person</h3>
      <input
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <br />
      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <br />
      <input
        placeholder="Phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />
      <br />
      <button onClick={createPerson} disabled={loading}>
        Add Person
      </button>

      <hr />

      <h3>👥 People</h3>

      <ul>
        {people.map((p) => {
          const role = roleNameById(p.roleId);
          const supports = supportsSubjects(p.roleId);
          const assignments = roleSubjectMap[p._id] || [];

          return (
            <li key={p._id} style={{ marginBottom: 30 }}>
              <strong>{p.name}</strong>
              <br />
              {p.email} | {p.phone}
              <br />
              Role: <strong>{role}</strong>

              <br />
              <select
                value={p.roleId || ""}
                onChange={(e) => assignRole(p._id, e.target.value)}
                disabled={loading}
              >
                <option value="">-- select role --</option>
                {roles.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.name}
                  </option>
                ))}
              </select>

              {/* SUBJECTS (Assistant + Quality Team) */}
              {supports && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 10,
                    border: "1px solid #ccc",
                  }}
                >
                  <strong>{role} Subjects</strong>

                  <br />
                  <select
                    multiple
                    value={selectedSubjects[p._id] || []}
                    onChange={(e) =>
                      setSelectedSubjects((prev) => ({
                        ...prev,
                        [p._id]: Array.from(
                          e.target.selectedOptions
                        ).map((o) => o.value),
                      }))
                    }
                    style={{ width: "100%", minHeight: 120 }}
                  >
                    {subjects.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}
                      </option>
                    ))}
                  </select>

                  <br />
                  <button
                    onClick={() => saveSubjects(p._id)}
                    disabled={loading}
                  >
                    Save Subjects
                  </button>

                  <ul>
                    {assignments.map((a) => (
                      <li key={a._id}>
                        {a.subjectId?.name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {loading && <p>Processing…</p>}
    </div>
  );
}
