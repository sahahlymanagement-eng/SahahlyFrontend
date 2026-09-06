import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { FiRefreshCw, FiSearch, FiTrash2, FiClock } from "react-icons/fi";
import api from "../../api/api";
import { useNow } from "../../hooks/useNow";
import "../director/DirectorClassroomManagers.css";
import "../director/DirectorGradingDelegations.css";

/**
 * A provider-manager's own "assign assistants" tab — the counterpart of the
 * director's Assign Grading Partner Assignments page (DirectorGradingDelegations),
 * but scoped down to what a manager may actually do:
 *
 *   - only the assignments THEY hold a whole-assignment manager delegation on
 *     (never another manager's assignments, never the director's full list)
 *   - assigning is by CLASS within an assignment, not the whole assignment —
 *     the director hands a manager a whole assignment; a manager hands an
 *     assistant one class within it (see routes/gradingDelegations.js
 *     POST /:provider/assignments/:assignmentId/assistants)
 *
 * Deliberately a top-level tab rather than something buried inside one
 * assignment's submission view — same reasoning as the director's own page:
 * assigning people to work is a distinct task from grading itself.
 */
export default function ManagerGradingAssistants({ slug, label }) {
  const now = useNow();

  const [assignments, setAssignments] = useState([]);
  const [classesByAssignment, setClassesByAssignment] = useState({}); // assignmentId -> [{groupId, groupName}]
  const [assistantPool, setAssistantPool] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");

  // Per-assignment form state, keyed by the partner's numeric assignment id.
  const [rowAssistant, setRowAssistant] = useState({});
  const [rowClass, setRowClass] = useState({});
  const [rowDeadline, setRowDeadline] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [assignmentsRes, poolRes] = await Promise.all([
        api.get(`/grading/${slug}/submissions/assignments`),
        api.get(`/grading-delegations/${slug}/assistants-pool`),
      ]);

      // Only assignments where THIS caller holds their own whole-assignment
      // manager delegation — resolveGradingScope already narrows the whole
      // response to the caller's own assignments, this just excludes any
      // where they happen to hold an assistant row instead.
      const mine = (assignmentsRes.data?.assignments || []).filter(
        (a) => a.myDelegation?.role === "manager"
      );
      setAssignments(mine);
      setAssistantPool(poolRes.data?.data || []);

      // Classes are fetched PER assignment (not once for the whole list) —
      // GET /classes with no assignmentId returns the union of classes across
      // every assignment in scope, which would let a manager offer a class
      // from assignment A while assigning on assignment B.
      const classPairs = await Promise.all(
        mine
          .filter((a) => a.id != null)
          .map(async (a) => {
            try {
              const { data } = await api.get(`/grading/${slug}/classes`, {
                params: { assignmentId: a.id },
              });
              return [a.id, data?.classes || []];
            } catch {
              return [a.id, []];
            }
          })
      );
      setClassesByAssignment(Object.fromEntries(classPairs));
    } catch (err) {
      setAssignments([]);
      toast.error(err.response?.data?.message || `Failed to load ${label} assignments`);
    } finally {
      setLoading(false);
    }
  }, [slug, label]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredAssignments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return assignments;
    return assignments.filter(
      (a) =>
        String(a.name || "").toLowerCase().includes(q) ||
        String(a.id ?? "").includes(q)
    );
  }, [assignments, search]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
      toast.success(`${label} assignments refreshed`);
    } finally {
      setRefreshing(false);
    }
  };

  const assign = async (assignment) => {
    const id = assignment.id;
    const personId = rowAssistant[id];
    const classroomGroupId = rowClass[id];
    const deadline = rowDeadline[id];

    if (!personId) return toast.warn("Pick an assistant");
    if (!classroomGroupId) return toast.warn("Pick a class");
    if (!deadline) return toast.warn("Set a deadline first");

    setBusyId(id);
    try {
      await api.post(`/grading-delegations/${slug}/assignments/${id}/assistants`, {
        personId,
        classroomGroupId: Number(classroomGroupId),
        // datetime-local has no zone; new Date() reads it as local time.
        deadline: new Date(deadline).toISOString(),
      });
      setRowAssistant((prev) => ({ ...prev, [id]: "" }));
      setRowClass((prev) => ({ ...prev, [id]: "" }));
      await load();
      toast.success("Assistant assigned to class");
    } catch (err) {
      toast.error(err.response?.data?.message || "Assignment failed");
    } finally {
      setBusyId(null);
    }
  };

  const unassign = async (assignment, delegation) => {
    setBusyId(assignment.id);
    try {
      await api.delete(`/grading-delegations/${delegation._id}`);
      await load();
      toast.success(`Removed ${delegation.name || "assistant"}`);
    } catch (err) {
      toast.error(err.response?.data?.message || "Remove failed");
    } finally {
      setBusyId(null);
    }
  };

  const classNameFor = (assignmentId, groupId) => {
    const classes = classesByAssignment[assignmentId] || [];
    return classes.find((c) => c.groupId === groupId)?.groupName || (groupId == null ? "Whole assignment" : `Class #${groupId}`);
  };

  return (
    <div className="dm-page">
      <div className="dm-header">
        <h2 className="dm-title">Assign Assistants — {label}</h2>
        <div className="dm-toolbar">
          <div className="dm-search">
            <FiSearch size={16} aria-hidden />
            <input
              type="search"
              placeholder="Search assignments…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search assignments"
            />
          </div>
          <button
            type="button"
            className="dm-refresh"
            onClick={handleRefresh}
            disabled={refreshing || loading}
          >
            <FiRefreshCw size={15} className={refreshing ? "dm-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <p className="dgd-hint">
        Only assignments you were delegated as manager appear here. Assign an assistant
        to ONE CLASS within an assignment — they will see only that class's submissions
        in their own {label} tab, and may view/edit results but not run marking.
      </p>

      <div className="dm-table-box">
        <div className="sah-table-scroll">
          <table className="dm-table sah-table--cards">
            <thead>
              <tr>
                <th>Assignment</th>
                <th>Submissions</th>
                <th>Assigned Assistants</th>
                <th>Assign</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="dm-empty">Loading {label} assignments…</td>
                </tr>
              )}

              {!loading && filteredAssignments.length === 0 && (
                <tr>
                  <td colSpan={4} className="dm-empty">
                    {search.trim()
                      ? `No assignments match "${search.trim()}".`
                      : `No assignments delegated to you yet — ask a director to assign you one.`}
                  </td>
                </tr>
              )}

              {!loading && filteredAssignments.map((a) => {
                const busy = busyId === a.id;
                const classes = classesByAssignment[a.id] || [];
                const team = a.teamDelegations || [];

                return (
                  <tr key={a.id ?? "__none__"}>
                    <td data-label="Assignment">
                      <span className="dgd-name">{a.name || "Unassigned"}</span>
                      {a.id != null && <span className="dgd-id">#{a.id}</span>}
                    </td>

                    <td data-label="Submissions">
                      <span className="dm-current">{a.graded ?? 0}</span>
                      <span className="dgd-of"> / {a.count ?? 0} graded</span>
                    </td>

                    <td data-label="Assigned Assistants">
                      {!team.length ? (
                        <span className="dgd-empty">Not assigned</span>
                      ) : (
                        <div className="dgd-tags">
                          {team.map((d) => {
                            const due = d.deadline ? new Date(d.deadline) : null;
                            const overdue = due && d.status !== "DONE" && due.getTime() < now;
                            return (
                              <span key={d._id} className="dgd-tag dgd-tag--assistant">
                                <strong>{d.name || "Unknown"}</strong>
                                <span style={{ fontSize: 11, color: "var(--muted)" }}>
                                  {classNameFor(a.id, d.classroomGroupId)}
                                </span>
                                {due && (
                                  <span className={`dgd-tag-due ${overdue ? "dgd-tag-due--overdue" : ""}`}>
                                    <FiClock size={10} aria-hidden /> {due.toLocaleString()}
                                  </span>
                                )}
                                <button
                                  type="button"
                                  className="dgd-tag-remove"
                                  title={`Remove ${d.name || "this assistant"}`}
                                  onClick={() => unassign(a, d)}
                                  disabled={busy}
                                >
                                  <FiTrash2 size={11} />
                                </button>
                              </span>
                            );
                          })}
                        </div>
                      )}
                    </td>

                    <td data-label="Assign">
                      {a.id == null ? (
                        <span className="dgd-empty">No assignment id — cannot be assigned</span>
                      ) : (
                        <div className="dgd-assign-cell">
                          <select
                            className="dm-select"
                            value={rowClass[a.id] || ""}
                            onChange={(e) =>
                              setRowClass((prev) => ({ ...prev, [a.id]: e.target.value }))
                            }
                            disabled={busy}
                            aria-label="Class to assign"
                          >
                            <option value="">Select class…</option>
                            {classes.map((c) => (
                              <option key={c.groupId} value={c.groupId}>{c.groupName}</option>
                            ))}
                          </select>

                          <select
                            className="dm-select"
                            value={rowAssistant[a.id] || ""}
                            onChange={(e) =>
                              setRowAssistant((prev) => ({ ...prev, [a.id]: e.target.value }))
                            }
                            disabled={busy}
                            aria-label="Assistant to assign"
                          >
                            <option value="">Select assistant…</option>
                            {assistantPool.map((p) => (
                              <option key={p._id} value={p._id}>{p.name}</option>
                            ))}
                          </select>

                          <input
                            type="datetime-local"
                            className="dm-select dgd-deadline-input"
                            value={rowDeadline[a.id] || ""}
                            onChange={(e) =>
                              setRowDeadline((prev) => ({ ...prev, [a.id]: e.target.value }))
                            }
                            disabled={busy}
                            aria-label="Deadline"
                          />

                          <button
                            type="button"
                            className="dm-assign"
                            onClick={() => assign(a)}
                            disabled={busy}
                          >
                            {busy ? "Saving…" : "Assign"}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!loading && !assistantPool.length && (
        <p className="dm-loading">
          No "Assistant - {label}" accounts exist yet — a director must create one
          before you can assign it here.
        </p>
      )}
    </div>
  );
}
