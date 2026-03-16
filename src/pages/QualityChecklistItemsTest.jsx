import { useEffect, useState } from "react";
import api from "../api/api";

export default function QualityChecklistItemsTest() {
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState("");
  const [fullScore, setFullScore] = useState("");
  const [order, setOrder] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  /* ================= LOAD ITEMS ================= */

  const loadItems = async () => {
    try {
      const res = await api.get("/quality-checklist-items");
      setItems(res.data || []);
    } catch (err) {
      setMessage("Failed to load items");
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  /* ================= CREATE OR UPDATE ================= */

  const handleSubmit = async () => {
    if (!title.trim()) {
      return setMessage("Title is required");
    }

    if (fullScore === "" || isNaN(Number(fullScore))) {
      return setMessage("Full score must be a number");
    }

    try {
      setLoading(true);
      setMessage("");

      const payload = {
        title,
        fullScore: Number(fullScore),
        order: Number(order) || 0,
      };

      if (editingId) {
        await api.patch(`/quality-checklist-items/${editingId}`, payload);
        setMessage("Item updated successfully");
      } else {
        await api.post("/quality-checklist-items", payload);
        setMessage("Item created successfully");
      }

      // reset form
      setTitle("");
      setFullScore("");
      setOrder("");
      setEditingId(null);

      loadItems();
    } catch (err) {
      setMessage(err.response?.data?.message || "Operation failed");
    } finally {
      setLoading(false);
    }
  };

  /* ================= EDIT ================= */

  const startEdit = (item) => {
    setEditingId(item._id);
    setTitle(item.title);
    setFullScore(item.fullScore);
    setOrder(item.order);
  };

  /* ================= ACTIVATE / DEACTIVATE ================= */

  const toggleActive = async (item) => {
    try {
      if (item.isActive) {
        await api.patch(`/quality-checklist-items/${item._id}/deactivate`);
      } else {
        await api.patch(`/quality-checklist-items/${item._id}/activate`);
      }

      loadItems();
    } catch {
      setMessage("Status update failed");
    }
  };

  /* ================= UI ================= */

  return (
    <div style={{ padding: 30, maxWidth: 900 }}>
      <h2>🧪 Quality Checklist Items (Global)</h2>

      {/* FORM */}
      <div style={{ border: "1px solid #ccc", padding: 20, marginBottom: 30 }}>
        <h3>{editingId ? "Edit Item" : "Create New Item"}</h3>

        <div style={{ marginBottom: 10 }}>
          <label>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label>Full Score</label>
          <input
            type="number"
            value={fullScore}
            onChange={(e) => setFullScore(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label>Order</label>
          <input
            type="number"
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>

        <button onClick={handleSubmit} disabled={loading}>
          {editingId ? "Update Item" : "Create Item"}
        </button>

        {editingId && (
          <button
            onClick={() => {
              setEditingId(null);
              setTitle("");
              setFullScore("");
              setOrder("");
            }}
            style={{ marginLeft: 10 }}
          >
            Cancel
          </button>
        )}
      </div>

      {/* LIST */}
      <h3>Existing Items</h3>

      {items.length === 0 && <p>No checklist items created yet.</p>}

      {items.map((item) => (
        <div
          key={item._id}
          style={{
            border: "1px solid #ddd",
            padding: 15,
            marginBottom: 10,
            background: item.isActive ? "#fff" : "#f5f5f5",
          }}
        >
          <strong>{item.title}</strong>

          <p>
            Full Score: {item.fullScore} | Order: {item.order}
          </p>

          <p>
            Status:{" "}
            <span style={{ color: item.isActive ? "green" : "red" }}>
              {item.isActive ? "Active" : "Inactive"}
            </span>
          </p>

          <button onClick={() => startEdit(item)}>Edit</button>

          <button
            onClick={() => toggleActive(item)}
            style={{ marginLeft: 10 }}
          >
            {item.isActive ? "Deactivate" : "Activate"}
          </button>
        </div>
      ))}

      {message && (
        <div style={{ marginTop: 20 }}>
          <strong>{message}</strong>
        </div>
      )}
    </div>
  );
}
