import { useEffect, useState } from "react";
import api from "../api/api";
import "./QualityChecklistItemsPage.css";
import { FiEdit, FiCheckCircle, FiXCircle, FiClipboard } from "react-icons/fi";

export default function QualityChecklistItemsPage() {
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState("");
  const [fullScore, setFullScore] = useState("");
  const [order, setOrder] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const loadItems = async () => {
    try {
      const res = await api.get("/quality-checklist-items");
      setItems(res.data || []);
    } catch {
      setMessage("Failed to load checklist items");
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setFullScore("");
    setOrder("");
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      return setMessage("Title is required");
    }

    if (fullScore === "" || isNaN(Number(fullScore))) {
      return setMessage("Full score must be numeric");
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

      resetForm();
      loadItems();
    } catch (err) {
      setMessage(err.response?.data?.message || "Operation failed");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (item) => {
    setEditingId(item._id);
    setTitle(item.title);
    setFullScore(item.fullScore);
    setOrder(item.order);
  };

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

  return (
    <div className="qualityChecklistPage">
      {/* FORM SECTION */}
      <section className="qualityChecklistSection">
        <div className="qualityChecklistHeader">
          <div className="qualityChecklistTitleWrap">
            <span className="qualityChecklistDot" />
            <h2 className="qualityChecklistTitle">
              {editingId ? "Edit Checklist Item" : "Create Checklist Item"}
            </h2>
          </div>
        </div>

        <div className="qualityChecklistFormCard">
          <div className="qualityChecklistFormGroup">
            <label>Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="qualityChecklistFormGroup">
            <label>Full Score</label>
            <input
              type="number"
              value={fullScore}
              onChange={(e) => setFullScore(e.target.value)}
            />
          </div>

          <div className="qualityChecklistFormGroup">
            <label>Order</label>
            <input
              type="number"
              value={order}
              onChange={(e) => setOrder(e.target.value)}
            />
          </div>

          <div className="qualityChecklistActions">
            <button
              className="qualityChecklistPrimaryBtn"
              onClick={handleSubmit}
              disabled={loading}
            >
              {editingId ? "Update Item" : "Create Item"}
            </button>

            {editingId && (
              <button
                className="qualityChecklistSecondaryBtn"
                onClick={resetForm}
              >
                Cancel
              </button>
            )}
          </div>

          {message && (
            <div className="qualityChecklistMessage">{message}</div>
          )}
        </div>
      </section>

      {/* LIST SECTION */}
      <section className="qualityChecklistSection">
        <div className="qualityChecklistHeader">
          <div className="qualityChecklistTitleWrap">
            <span className="qualityChecklistDot" />
            <h2 className="qualityChecklistTitle">Existing Items</h2>
          </div>
        </div>

        <div className="qualityChecklistGrid">
          {items.map((item) => (
            <div key={item._id} className="qualityChecklistCard">
              <div className="qualityChecklistIconWrap">
                <FiClipboard className="qualityChecklistIcon" />
              </div>

              <h3>{item.title}</h3>

              <p>Score: {item.fullScore}</p>
              <p>Order: {item.order}</p>

              <span
                className={`qualityChecklistStatus ${
                  item.isActive ? "active" : "inactive"
                }`}
              >
                {item.isActive ? "Active" : "Inactive"}
              </span>

              <div className="qualityChecklistCardActions">
                <button onClick={() => startEdit(item)}>
                  <FiEdit /> Edit
                </button>

                <button onClick={() => toggleActive(item)}>
                  {item.isActive ? (
                    <>
                      <FiXCircle /> Deactivate
                    </>
                  ) : (
                    <>
                      <FiCheckCircle /> Activate
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}