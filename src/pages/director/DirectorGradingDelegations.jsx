import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { FiRefreshCw, FiSearch, FiTrash2, FiClock } from "react-icons/fi";
import api from "../../api/api";
import { useNow } from "../../hooks/useNow";
import "./DirectorClassroomManagers.css";
import "./DirectorGradingDelegations.css";

/**
 * Director: hand an EXTERNAL GRADING PARTNER assignment (LoginCSS, Mariam
 * Gabalawy, Dr Peter) to a manager and/or an assistant, with a deadline.
 *
 * The partner counterpart of "Assign Assistants", which does the same for
 * classroom coursework. Partner submissions carry their assignment inline as
 * the partner's own numeric id — there is no Assignment document — so the rows
 * here come from the partner's submission index rather than /assignments.
 *
 * Delegating is what makes the partner tab appear in that person's own portal,
 * scoped by the backend to exactly the assignments they were given.
 */

// One tab per grading partner. LoginCSS keeps its own backend routes, but this
// page only ever talks to /grading-delegations, which is partner-agnostic.
const GRADING_PARTNERS = [
  { slug: "logincss", label: "LoginCSS" },
  { slug: "mariamgabalawy", label: "Mariam Gabalawy" },
  { slug: "drpeter", label: "Dr Peter" },
];

/** "2026-07-30T14:00" for a datetime-local input, in the browser's own zone. */
function toLocalInputValue(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function DirectorGradingDelegations() {
  // Drives the overdue styling on delegate tags without a clock read in render.
  const now = useNow();

  const [partner, setPartner] = useState(GRADING_PARTNERS[0].slug);
  const [search, setSearch] = useState("");

  const [assignments, setAssignments] = useState([]);
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Per-assignment form state, keyed by the partner's numeric assignment id.
  const [rowManager, setRowManager] = useState({});
  const [rowAssistant, setRowAssistant] = useState({});
  const [rowDeadline, setRowDeadline] = useState({});

  const partnerLabel =
    GRADING_PARTNERS.find((p) => p.slug === partner)?.label || partner;

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/grading-delegations/${partner}/assignments`);
      setAssignments(data?.assignments || []);
    } catch (err) {
      setAssignments([]);
      toast.error(
        err.response?.data?.message || `Failed to load ${partner} assignments`
      );
    } finally {
      setLoading(false);
    }
  }, [partner]);

  useEffect(() => {
    loadAssignments();
  }, [loadAssignments]);

  // The people who can be delegated to. Loaded once — the roster does not
  // change per partner.
  useEffect(() => {
    api
      .get("/people", { params: { page: 1, limit: 5000 } })
      .then((res) => setPeople(res.data?.data || []))
      .catch(() => toast.error("Failed to load people"));
  }, []);

  // Switching partners clears the half-filled forms: the same assignment id
  // means a different assignment under a different partner, so carrying a
  // half-typed row across would attach it to the wrong one.
  const selectPartner = (slug) => {
    if (slug === partner) return;
    setPartner(slug);
    setRowManager({});
    setRowAssistant({});
    setRowDeadline({});
  };

  const { managers, assistants } = useMemo(() => {
    const byRole = { managers: [], assistants: [] };
    for (const person of people) {
      const role = String(person.roleId?.name || "").trim().toLowerCase();
      if (role === "manager") byRole.managers.push(person);
      else if (role === "assistant") byRole.assistants.push(person);
    }
    return byRole;
  }, [people]);

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
      await loadAssignments();
      toast.success(`${partnerLabel} assignments refreshed`);
    } finally {
      setRefreshing(false);
    }
  };

  /**
   * Create (or re-date) delegations for one assignment. The manager and the
   * assistant share the assignment's single deadline — that is the deadline the
   * assignment is due by, not a per-person one.
   */
  const assign = async (assignment) => {
    const id = assignment.id;
    const deadline = rowDeadline[id];
    const targets = [
      { personId: rowManager[id], role: "manager" },
      { personId: rowAssistant[id], role: "assistant" },
    ].filter((t) => t.personId);

    if (!targets.length) {
      toast.warn("Pick a manager, an assistant, or both");
      return;
    }
    if (!deadline) {
      toast.warn("Set a deadline first");
      return;
    }

    setBusyId(id);
    try {
      // Sequential rather than parallel: two writes at most, and a failure part
      // way through leaves a message naming the person it failed for.
      for (const target of targets) {
        await api.post("/grading-delegations", {
          provider: partner,
          assignmentId: id,
          assignmentName: assignment.name || null,
          personId: target.personId,
          role: target.role,
          // datetime-local has no zone; new Date() reads it as local time, which
          // is what the director just typed.
          deadline: new Date(deadline).toISOString(),
        });
      }

      setRowManager((prev) => ({ ...prev, [id]: "" }));
      setRowAssistant((prev) => ({ ...prev, [id]: "" }));
      await loadAssignments();
      toast.success(
        `Assigned to ${targets.length} ${targets.length === 1 ? "person" : "people"}`
      );
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
      await loadAssignments();
      toast.success(`Removed ${delegation.personId?.name || "delegate"}`);
    } catch (err) {
      toast.error(err.response?.data?.message || "Remove failed");
    } finally {
      setBusyId(null);
    }
  };

  const renderDelegates = (assignment, role) => {
    const rows = (assignment.delegations || []).filter((d) => d.role === role);
    if (!rows.length) return <span className="dgd-empty">Not assigned</span>;

    return (
      <div className="dgd-tags">
        {rows.map((d) => {
          const due = d.deadline ? new Date(d.deadline) : null;
          const overdue = due && d.status !== "DONE" && due.getTime() < now;
          return (
            <span key={d._id} className={`dgd-tag dgd-tag--${role}`}>
              <strong>{d.personId?.name || "Unknown"}</strong>
              {due && (
                <span className={`dgd-tag-due ${overdue ? "dgd-tag-due--overdue" : ""}`}>
                  <FiClock size={10} aria-hidden /> {due.toLocaleString()}
                </span>
              )}
              <button
                type="button"
                className="dgd-tag-remove"
                title={`Remove ${d.personId?.name || "this delegate"}`}
                onClick={() => unassign(assignment, d)}
                disabled={busyId === assignment.id}
              >
                <FiTrash2 size={11} />
              </button>
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="dm-page">
      <div className="dm-header">
        <h2 className="dm-title">Assign Grading Partner Assignments</h2>
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

      <div className="dgd-tabs" role="tablist" aria-label="Grading partner">
        {GRADING_PARTNERS.map((p) => (
          <button
            key={p.slug}
            type="button"
            role="tab"
            aria-selected={partner === p.slug}
            className={`dgd-tab ${partner === p.slug ? "dgd-tab--active" : ""}`}
            onClick={() => selectPartner(p.slug)}
          >
            {p.label}
          </button>
        ))}
      </div>

      <p className="dgd-hint">
        A delegated manager or assistant sees <strong>only</strong> the {partnerLabel}{" "}
        assignments listed against their name, in their own {partnerLabel} tab. A
        manager may run marking there; an assistant reviews and publishes what was
        marked.
      </p>

      <div className="dm-table-box">
        <div className="sah-table-scroll">
          <table className="dm-table sah-table--cards">
            <thead>
              <tr>
                <th>Assignment</th>
                <th>Submissions</th>
                <th>Manager</th>
                <th>Assistant</th>
                <th>Assign</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="dm-empty">Loading {partnerLabel} assignments…</td>
                </tr>
              )}

              {!loading && filteredAssignments.length === 0 && (
                <tr>
                  <td colSpan={5} className="dm-empty">
                    {search.trim()
                      ? `No assignments match "${search.trim()}".`
                      : `No ${partnerLabel} assignments yet — they appear once the partner sends submissions.`}
                  </td>
                </tr>
              )}

              {!loading && filteredAssignments.map((a) => {
                // Delegation is keyed by the partner's numeric assignment id, so
                // the handful of submissions that arrived without one cannot be
                // delegated. They are still listed, to explain the gap.
                const delegatable = a.id != null;
                const busy = busyId === a.id;

                // Pre-fill the deadline with whatever is already set, so editing
                // it does not start from an empty box.
                const existingDeadline = (a.delegations || [])[0]?.deadline;
                const deadlineValue =
                  rowDeadline[a.id] ??
                  (existingDeadline ? toLocalInputValue(existingDeadline) : "");

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

                    <td data-label="Manager">{renderDelegates(a, "manager")}</td>
                    <td data-label="Assistant">{renderDelegates(a, "assistant")}</td>

                    <td data-label="Assign">
                      {!delegatable ? (
                        <span className="dgd-empty">
                          No partner assignment id — cannot be delegated
                        </span>
                      ) : (
                        <div className="dgd-assign-cell">
                          <select
                            className="dm-select"
                            value={rowManager[a.id] || ""}
                            onChange={(e) =>
                              setRowManager((prev) => ({ ...prev, [a.id]: e.target.value }))
                            }
                            disabled={busy}
                            aria-label="Manager to assign"
                          >
                            <option value="">Select manager…</option>
                            {managers.map((m) => (
                              <option key={m._id} value={m._id}>{m.name}</option>
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
                            {assistants.map((p) => (
                              <option key={p._id} value={p._id}>{p.name}</option>
                            ))}
                          </select>

                          <input
                            type="datetime-local"
                            className="dm-select dgd-deadline-input"
                            value={deadlineValue}
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

      {!loading && !people.length && (
        <p className="dm-loading">
          No people loaded — managers and assistants must exist before they can be
          delegated to.
        </p>
      )}
    </div>
  );
}
