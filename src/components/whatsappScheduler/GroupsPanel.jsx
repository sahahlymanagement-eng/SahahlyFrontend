import { useState } from "react";
import { FiPlus, FiTrash2, FiUsers } from "react-icons/fi";
import { toast } from "react-toastify";
import { confirmToast } from "../../utils/confirmToast";
import { GROUP_JID, formatDateTime, groupLabel } from "./recurrence";

/**
 * The group registry: what the scheduler can send to.
 *
 * This is *discovered* groups only — harvested from the Wapilot `message.any`
 * webhook plus whatever was added by hand — because Wapilot has no
 * list-all-groups API. The copy says so, so nobody wonders why a group they
 * are in is missing.
 */
export default function GroupsPanel({ groups, loading, busy, onAdd, onDelete }) {
  const [newName, setNewName] = useState("");
  const [newId, setNewId] = useState("");

  const handleAdd = async (e) => {
    e.preventDefault();
    const chatId = newId.trim();

    if (!GROUP_JID.test(chatId)) {
      toast.warn("Group id must look like 120363…@g.us");
      return;
    }

    const added = await onAdd(chatId, newName.trim());
    if (added) {
      setNewName("");
      setNewId("");
    }
  };

  const handleDelete = async (group) => {
    const ok = await confirmToast(
      `Remove ${groupLabel(group)} from the group list?`,
      {
        title: "Remove group",
        confirmLabel: "Remove",
        danger: true,
      }
    );
    if (ok) onDelete(group.chatId);
  };

  return (
    <section className="mws-card">
      <header className="mws-card-header">
        <h2 className="mws-card-title">
          <FiUsers aria-hidden="true" /> Groups
        </h2>
      </header>

      <p className="mws-hint">
        These are the groups Sahahly has discovered — harvested from the{" "}
        <code>message.any</code> webhook plus anything added by hand. It is not
        every group the connected number belongs to.
      </p>

      <form className="mws-add-group" onSubmit={handleAdd}>
        <input
          className="mws-input"
          placeholder="Group name (optional)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          aria-label="Group name"
        />
        <input
          className="mws-input mws-input--mono"
          placeholder="120363…@g.us"
          value={newId}
          onChange={(e) => setNewId(e.target.value)}
          aria-label="Group chat id"
        />
        <button type="submit" className="mws-btn mws-btn--primary" disabled={busy}>
          <FiPlus aria-hidden="true" /> Add group
        </button>
      </form>

      {loading && groups.length === 0 ? (
        <p className="mws-empty">Loading groups…</p>
      ) : groups.length === 0 ? (
        <p className="mws-empty">
          No groups yet — paste a group id above, or configure the{" "}
          <code>message.any</code> webhook so groups auto-appear.
        </p>
      ) : (
        <div className="sah-table-scroll">
          <table className="mws-table sah-table--cards">
            <thead>
              <tr>
                <th>Name</th>
                <th>Chat ID</th>
                <th>Source</th>
                <th>Last seen</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.chatId} className={g.active === false ? "mws-row--inactive" : ""}>
                  <td data-label="Name">
                    {groupLabel(g)}
                    {g.active === false && (
                      <span className="mws-badge mws-badge--muted mws-badge--inline">
                        inactive
                      </span>
                    )}
                  </td>
                  <td data-label="Chat ID">
                    <span className="mws-mono" title={g.chatId}>
                      {g.chatId}
                    </span>
                  </td>
                  <td data-label="Source">
                    <span
                      className={`mws-badge mws-badge--${
                        g.source === "webhook" ? "info" : "neutral"
                      }`}
                    >
                      {g.source || "manual"}
                    </span>
                  </td>
                  <td data-label="Last seen">{formatDateTime(g.lastSeenAt)}</td>
                  <td data-label="Actions">
                    <button
                      type="button"
                      className="mws-icon-btn mws-icon-btn--danger"
                      onClick={() => handleDelete(g)}
                      disabled={busy}
                      title="Remove group"
                      aria-label={`Remove ${groupLabel(g)}`}
                    >
                      <FiTrash2 />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
