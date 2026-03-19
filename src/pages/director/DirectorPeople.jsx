import { useEffect, useState } from "react";
import api from "../../api/api";
import "./DirectorPeople.css";

import {
  FiUsers,
  FiUserPlus,
  FiMail,
  FiPhone,
  FiSave
} from "react-icons/fi";

import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";

export default function DirectorPeople() {
  const [people, setPeople] = useState([]);
  const [roles, setRoles] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneValue, setPhoneValue] = useState("");

  const [roleSubjectMap, setRoleSubjectMap] = useState({});
  const [selectedSubjects, setSelectedSubjects] = useState({});

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    const [rolesRes, subjectsRes, peopleRes] = await Promise.all([
      api.get("/roles"),
      api.get("/subjects?active=true"),
      api.get("/people")
    ]);

    setRoles(rolesRes.data || []);
    setSubjects(subjectsRes.data || []);

    const list = peopleRes.data || [];
    setPeople(list);

    list.forEach((p) => loadRoleSubjects(p._id));
  };

  const loadRoleSubjects = async (personId) => {
    const res = await api.get(
      `/role-subject-assignments?personId=${personId}`
    );

    const assignments = res.data || [];

    setRoleSubjectMap((prev) => ({
      ...prev,
      [personId]: assignments
    }));

    setSelectedSubjects((prev) => ({
      ...prev,
      [personId]: assignments.map((a) => a.subjectId?._id)
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

  const supportsSubjects = (roleId) =>
    ["assistant", "quality team"].includes(roleNameLower(roleId));

  const createPerson = async () => {
    if (!name || !email || !phoneValue) {
      alert("All fields required");
      return;
    }

    try {
      setLoading(true);

      // library gives international number with "+"
      // database should store it WITHOUT "+"
      const finalPhone = phoneValue.replace(/\D/g, "");

      if (!finalPhone) {
        alert("Please enter a valid phone number");
        return;
      }

      await api.post("/people", {
        name,
        email,
        phone: finalPhone
      });

      setName("");
      setEmail("");
      setPhoneValue("");

      await loadInitialData();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || "Failed to create person");
    } finally {
      setLoading(false);
    }
  };

  const assignRole = async (personId, roleId) => {
    try {
      setLoading(true);

      await api.patch(`/people/${personId}/assign-role`, { roleId });

      await loadInitialData();
    } finally {
      setLoading(false);
    }
  };

  const toggleSubject = (personId, subjectId) => {
    setSelectedSubjects((prev) => {
      const current = prev[personId] || [];

      if (current.includes(subjectId)) {
        return {
          ...prev,
          [personId]: current.filter((id) => id !== subjectId)
        };
      }

      return {
        ...prev,
        [personId]: [...current, subjectId]
      };
    });
  };

  const saveSubjects = async (personId) => {
    try {
      setLoading(true);

      const existing =
        roleSubjectMap[personId]?.map((a) => a.subjectId._id) || [];

      const selected = selectedSubjects[personId] || [];

      const toAdd = selected.filter((id) => !existing.includes(id));
      const toRemove = existing.filter((id) => !selected.includes(id));

      for (const subjectId of toAdd) {
        await api.post("/role-subject-assignments", { personId, subjectId });
      }

      for (const subjectId of toRemove) {
        await api.delete("/role-subject-assignments", {
          data: { personId, subjectId }
        });
      }

      await loadRoleSubjects(personId);
    } finally {
      setLoading(false);
    }
  };

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
                  style: {
                    maxHeight: "500px",
                    height: "500px",
                    zIndex: 9999
                  }
                }
              }}
            />

          </div>

        </div>

        <button
          className="addPersonBtn"
          onClick={createPerson}
          disabled={loading}
        >
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

          return (

            <div className="personCard" key={p._id}>

              <div className="personTop">

                <div className="personIdentity">
                  <h3>{p.name}</h3>

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
                      <option key={r._id} value={r._id}>
                        {r.name}
                      </option>
                    ))}

                  </select>
                </div>

              </div>

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

                        <label
                          key={s._id}
                          className={`subjectItem ${checked ? "active" : ""}`}
                        >
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

                  <button
                    className="saveSubjectsBtn"
                    onClick={() => saveSubjects(p._id)}
                  >
                    <FiSave />
                    Save Subjects
                  </button>

                </div>

              )}

            </div>

          );

        })}

      </div>

      {loading && <p className="loading">Processing...</p>}

    </div>

  </div>
);
}