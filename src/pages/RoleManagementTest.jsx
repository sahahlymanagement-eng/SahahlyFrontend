import { useEffect, useState } from "react";
import api from "../api/api";

export default function RoleManagementTest() {
  const [roles, setRoles] = useState([]);
  const [roleName, setRoleName] = useState("");
  const [roleDesc, setRoleDesc] = useState("");
  const [selectedRole, setSelectedRole] = useState(null);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    const res = await api.get("/roles");
    setRoles(Array.isArray(res.data) ? res.data : []);
  };

  const createRole = async () => {
    if (!roleName.trim()) return alert("Role name is required");

    try {
      setLoading(true);

      const res = await api.post("/roles", {
        name: roleName,
        description: roleDesc,
      });

      setResponse(res.data);
      setRoleName("");
      setRoleDesc("");
      loadRoles();
    } catch (err) {
      console.error("Create role failed", err);
      alert("Create role failed — check backend logs");
    } finally {
      setLoading(false);
    }
  };

  const deactivateRole = async (role) => {
    try {
      setLoading(true);

      const res = await api.delete(`/roles/${role._id}`);
      setResponse(res.data);
      loadRoles();
    } catch (err) {
      console.error("Delete role failed", err);
      alert("Delete role failed — check backend logs");
    } finally {
      setLoading(false);
    }
  };

  const toggleRoleStatus = async (role) => {
    try {
      setLoading(true);

      const res = await api.put(`/roles/${role._id}`, {
        isActive: !role.isActive,
      });

      setResponse(res.data);
      loadRoles();
    } catch (err) {
      console.error("Update role failed", err);
      alert("Update role failed — check backend logs");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 30 }}>
      <h2>Role Management Test</h2>

      <hr />

      {/* CREATE ROLE */}
      <h3>1️⃣ Create Role</h3>

      <input
        placeholder="Role name (e.g. Teacher)"
        value={roleName}
        onChange={(e) => setRoleName(e.target.value)}
      />
      <br />
      <input
        placeholder="Description (optional)"
        value={roleDesc}
        onChange={(e) => setRoleDesc(e.target.value)}
      />
      <br />
      <button onClick={createRole} disabled={loading}>
        Create Role
      </button>

      <hr />

      {/* LIST ROLES */}
      <h3>2️⃣ Roles List</h3>

      {roles.length === 0 && <p>No roles found.</p>}

      <ul>
        {roles.map((r) => (
          <li key={r._id} style={{ marginBottom: 10 }}>
            <strong>{r.name}</strong>{" "}
            {r.isActive ? (
              <span style={{ color: "green" }}>(active)</span>
            ) : (
              <span style={{ color: "red" }}>(inactive)</span>
            )}
            <br />
            {r.description && <em>{r.description}</em>}
            <br />
            <button onClick={() => toggleRoleStatus(r)} disabled={loading}>
              {r.isActive ? "Deactivate" : "Activate"}
            </button>{" "}
            <button onClick={() => deactivateRole(r)} disabled={loading}>
              Soft Delete
            </button>
          </li>
        ))}
      </ul>

      <hr />

      {/* RESPONSE */}
      {loading && <p>Processing…</p>}

      {response && (
        <>
          <h3>Response</h3>
          <pre>{JSON.stringify(response, null, 2)}</pre>
        </>
      )}
    </div>
  );
}
