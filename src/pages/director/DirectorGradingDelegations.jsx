import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { FiRefreshCw, FiSearch, FiTrash2, FiClock } from "react-icons/fi";
import Select from "react-select";
import api from "../../api/api";
import { useNow } from "../../hooks/useNow";
import { selectStyles } from "../../utils/selectTheme";
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
  // Manager/assistant here are always SAHAHLY accounts now — a provider
  // account is only ever assigned through the sub-group defaults box below.
  const [rowManager, setRowManager] = useState({});
  const [rowAssistant, setRowAssistant] = useState({});
  const [rowDeadline, setRowDeadline] = useState({});

  // Box B — "{Partner} Sahahly accounts defaults": whole-assignment, computed
  // deadline (due date + 1 day), Sahahly manager/assistant accounts only. The
  // partner counterpart of ManagerDashboard's "Classroom defaults": any BRAND
  // NEW assignment for that provider auto-assigns these people.
  const [providerDefaults, setProviderDefaults] = useState({});
  const [defaultManagersSelected, setDefaultManagersSelected] = useState([]);
  const [defaultAssistantsSelected, setDefaultAssistantsSelected] = useState([]);
  const [defaultsLoading, setDefaultsLoading] = useState(false);
  const [defaultsSaving, setDefaultsSaving] = useState(false);

  // Box A — "{Partner} Provider accounts defaults": ONE sub-group (merged by
  // display name, e.g. every "1A"), no deadline, provider manager/assistant
  // accounts only. Any brand new (assignment, group) pairing matching that
  // sub-group auto-assigns these people. Reloaded per partner tab, since the
  // group catalog is provider-specific.
  const [groupCatalog, setGroupCatalog] = useState([]); // [{groupKey, groupName, assignmentCount}]
  const [groupCatalogLoading, setGroupCatalogLoading] = useState(false);
  const [groupDefaultsMap, setGroupDefaultsMap] = useState({}); // { [groupKey]: {managers, assistants} }
  const [selectedDefaultGroupKey, setSelectedDefaultGroupKey] = useState("");
  const [defaultGroupManagersSelected, setDefaultGroupManagersSelected] = useState([]);
  const [defaultGroupAssistantsSelected, setDefaultGroupAssistantsSelected] = useState([]);
  const [groupDefaultsSaving, setGroupDefaultsSaving] = useState(false);

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

  // Provider defaults, for every partner tab at once — loaded once, same as
  // the people roster, since switching tabs shouldn't re-fetch.
  const loadProviderDefaults = useCallback(async () => {
    try {
      setDefaultsLoading(true);
      const { data } = await api.get("/grading-partner-defaults", {
        params: { providers: GRADING_PARTNERS.map((p) => p.slug).join(",") },
      });
      setProviderDefaults(data || {});
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load provider defaults");
    } finally {
      setDefaultsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProviderDefaults();
  }, [loadProviderDefaults]);

  // Re-derive the two selects whenever the active partner tab or the loaded
  // defaults change — same reload-on-key-change pattern as the assign forms.
  useEffect(() => {
    const bucket = providerDefaults[partner] || { managers: [], assistants: [] };
    const toOption = (r) => ({
      value: r.personId?._id || r.personId,
      label: r.personId?.name || "Person",
    });
    setDefaultManagersSelected((bucket.managers || []).map(toOption).filter((o) => o.value));
    setDefaultAssistantsSelected((bucket.assistants || []).map(toOption).filter((o) => o.value));
  }, [partner, providerDefaults]);

  const saveProviderDefaults = async () => {
    try {
      setDefaultsSaving(true);
      const { data } = await api.put(`/grading-partner-defaults/${partner}`, {
        managerIds: defaultManagersSelected.map((o) => o.value),
        assistantIds: defaultAssistantsSelected.map((o) => o.value),
      });
      setProviderDefaults((prev) => ({
        ...prev,
        [partner]: data?.defaults || { managers: [], assistants: [] },
      }));
      toast.success(
        defaultManagersSelected.length || defaultAssistantsSelected.length
          ? `${partnerLabel} Sahahly defaults saved — new assignments will auto-assign these people`
          : `${partnerLabel} Sahahly defaults cleared`
      );
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save provider defaults");
    } finally {
      setDefaultsSaving(false);
    }
  };

  // Box A — the sub-group catalog + whatever defaults are already set for
  // each, for the CURRENT partner tab only (unlike Box B, which is loaded for
  // every tab up front — a provider's group catalog can be large, and
  // switching tabs is rare enough not to bother pre-fetching all of them).
  const loadGroupDefaults = useCallback(async () => {
    setGroupCatalogLoading(true);
    try {
      const { data } = await api.get(`/grading-partner-group-defaults/${partner}/groups`);
      const groups = data?.groups || [];
      setGroupCatalog(groups);

      if (groups.length) {
        const { data: defaultsData } = await api.get("/grading-partner-group-defaults", {
          params: { provider: partner, groupKeys: groups.map((g) => g.groupKey).join(",") },
        });
        setGroupDefaultsMap(defaultsData || {});
      } else {
        setGroupDefaultsMap({});
      }
    } catch (err) {
      setGroupCatalog([]);
      setGroupDefaultsMap({});
      toast.error(err.response?.data?.message || `Failed to load ${partnerLabel} groups`);
    } finally {
      setGroupCatalogLoading(false);
    }
  }, [partner, partnerLabel]);

  useEffect(() => {
    loadGroupDefaults();
  }, [loadGroupDefaults]);

  // Re-derive the two selects whenever the chosen sub-group or the loaded
  // defaults change.
  useEffect(() => {
    const bucket = groupDefaultsMap[selectedDefaultGroupKey] || { managers: [], assistants: [] };
    const toOption = (r) => ({
      value: r.personId?._id || r.personId,
      label: r.personId?.name || "Person",
    });
    setDefaultGroupManagersSelected((bucket.managers || []).map(toOption).filter((o) => o.value));
    setDefaultGroupAssistantsSelected((bucket.assistants || []).map(toOption).filter((o) => o.value));
  }, [selectedDefaultGroupKey, groupDefaultsMap]);

  const saveGroupDefaults = async () => {
    const group = groupCatalog.find((g) => g.groupKey === selectedDefaultGroupKey);
    if (!group) return;
    try {
      setGroupDefaultsSaving(true);
      const { data } = await api.put(
        `/grading-partner-group-defaults/${partner}/${group.groupKey}`,
        {
          groupName: group.groupName,
          managerIds: defaultGroupManagersSelected.map((o) => o.value),
          assistantIds: defaultGroupAssistantsSelected.map((o) => o.value),
        }
      );
      setGroupDefaultsMap((prev) => ({
        ...prev,
        [group.groupKey]: data?.defaults || { managers: [], assistants: [] },
      }));
      toast.success(
        defaultGroupManagersSelected.length || defaultGroupAssistantsSelected.length
          ? `${group.groupName} defaults saved — new assignments to this group will auto-assign these accounts`
          : `${group.groupName} defaults cleared`
      );
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save group defaults");
    } finally {
      setGroupDefaultsSaving(false);
    }
  };

  // Switching partners clears the half-filled forms: the same assignment id
  // means a different assignment under a different partner, so carrying a
  // half-typed row across would attach it to the wrong one. The sub-group
  // picker (Box A) is provider-specific too, so its pick and half-filled
  // selects don't carry over either.
  const selectPartner = (slug) => {
    if (slug === partner) return;
    setPartner(slug);
    setRowManager({});
    setRowAssistant({});
    setRowDeadline({});
    setSelectedDefaultGroupKey("");
  };

  // Two separate pools, never overlapping:
  //   - Sahahly accounts: literal role name "manager"/"assistant" — used by
  //     the manual assign-a-specific-assignment table AND Box B (whole
  //     assignment, computed deadline).
  //   - Provider accounts: the dedicated "Manager - <this partner>"/
  //     "Assistant - <this partner>" role — used ONLY by Box A (one
  //     sub-group, no deadline). Those roles carry a different literal name
  //     (gradingProvider/gradingRole instead), so the plain name check alone
  //     would never surface them here. A provider account is deliberately NOT
  //     offered in the manual table any more — see Box A's hint text for why.
  const { sahahlyManagers, sahahlyAssistants, providerManagers, providerAssistants } = useMemo(() => {
    const out = { sahahlyManagers: [], sahahlyAssistants: [], providerManagers: [], providerAssistants: [] };
    for (const person of people) {
      const roleName = String(person.roleId?.name || "").trim().toLowerCase();
      const gradingRole = person.roleId?.gradingRole || null;
      const isDedicatedForThisPartner =
        gradingRole && person.roleId?.gradingProvider === partner;

      if (roleName === "manager") out.sahahlyManagers.push(person);
      else if (roleName === "assistant") out.sahahlyAssistants.push(person);

      if (isDedicatedForThisPartner && gradingRole === "manager") out.providerManagers.push(person);
      else if (isDedicatedForThisPartner && gradingRole === "assistant") out.providerAssistants.push(person);
    }
    return out;
  }, [people, partner]);

  const managerOptions = useMemo(
    () => sahahlyManagers.map((m) => ({ value: m._id, label: m.name })),
    [sahahlyManagers]
  );
  const assistantOptions = useMemo(
    () => sahahlyAssistants.map((p) => ({ value: p._id, label: p.name })),
    [sahahlyAssistants]
  );
  const providerManagerOptions = useMemo(
    () => providerManagers.map((m) => ({ value: m._id, label: m.name })),
    [providerManagers]
  );
  const providerAssistantOptions = useMemo(
    () => providerAssistants.map((p) => ({ value: p._id, label: p.name })),
    [providerAssistants]
  );

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

      <section className="dgd-defaults" aria-label={`${partnerLabel} provider accounts defaults`}>
        <div className="dgd-defaults-header">
          <span className="dgd-defaults-dot" />
          <h2 className="dgd-defaults-title">{partnerLabel} Provider accounts defaults</h2>
        </div>
        <p className="dgd-defaults-hint">
          Pick a sub-group (e.g. every class displayed as <strong>1A</strong>, merged across
          schools) and a default {partnerLabel} manager and/or assistant <strong>provider
          account</strong> for it. Any <strong>new</strong> assignment sent to that sub-group
          auto-assigns them — with <strong>no deadline</strong>, since a provider account works
          off whatever {partnerLabel} sends. Use the table below for a Sahahly account on one
          specific assignment instead.
        </p>
        <div className="dgd-defaults-grid">
          <div className="dgd-defaults-field">
            <label htmlFor="dgd-default-group">Sub-group</label>
            <Select
              inputId="dgd-default-group"
              styles={{ ...selectStyles, menuPortal: (b) => ({ ...b, zIndex: 9999 }) }}
              menuPortalTarget={document.body}
              menuPosition="fixed"
              placeholder={groupCatalogLoading ? "Loading groups…" : "Select sub-group…"}
              options={groupCatalog.map((g) => ({
                value: g.groupKey,
                label: `${g.groupName} (${g.assignmentCount} assignment${g.assignmentCount === 1 ? "" : "s"})`,
              }))}
              value={
                selectedDefaultGroupKey
                  ? {
                      value: selectedDefaultGroupKey,
                      label:
                        groupCatalog.find((g) => g.groupKey === selectedDefaultGroupKey)?.groupName ||
                        selectedDefaultGroupKey,
                    }
                  : null
              }
              onChange={(opt) => setSelectedDefaultGroupKey(opt?.value || "")}
              isClearable
              isDisabled={groupCatalogLoading}
            />
          </div>
          <div className="dgd-defaults-field">
            <label htmlFor="dgd-default-group-managers">Default manager account(s)</label>
            <Select
              inputId="dgd-default-group-managers"
              styles={{ ...selectStyles, menuPortal: (b) => ({ ...b, zIndex: 9999 }) }}
              menuPortalTarget={document.body}
              menuPosition="fixed"
              placeholder={
                selectedDefaultGroupKey ? "Select manager account(s)…" : "Choose a sub-group first"
              }
              options={providerManagerOptions}
              value={defaultGroupManagersSelected}
              onChange={(opts) => setDefaultGroupManagersSelected(opts || [])}
              isMulti
              isDisabled={!selectedDefaultGroupKey}
              closeMenuOnSelect={false}
            />
          </div>
          <div className="dgd-defaults-field">
            <label htmlFor="dgd-default-group-assistants">Default assistant account(s)</label>
            <Select
              inputId="dgd-default-group-assistants"
              styles={{ ...selectStyles, menuPortal: (b) => ({ ...b, zIndex: 9999 }) }}
              menuPortalTarget={document.body}
              menuPosition="fixed"
              placeholder={
                selectedDefaultGroupKey ? "Select assistant account(s)…" : "Choose a sub-group first"
              }
              options={providerAssistantOptions}
              value={defaultGroupAssistantsSelected}
              onChange={(opts) => setDefaultGroupAssistantsSelected(opts || [])}
              isMulti
              isDisabled={!selectedDefaultGroupKey}
              closeMenuOnSelect={false}
            />
          </div>
          <button
            type="button"
            className="dm-assign dgd-defaults-save"
            disabled={!selectedDefaultGroupKey || groupDefaultsSaving || groupCatalogLoading}
            onClick={saveGroupDefaults}
          >
            {groupDefaultsSaving ? "Saving…" : "Save defaults"}
          </button>
        </div>
        {!groupCatalogLoading && !groupCatalog.length && (
          <p className="dgd-defaults-current">
            No {partnerLabel} groups with a submission yet — a sub-group appears here once it
            has at least one, same as the Grading tab's "By School"/"By Group" pickers.
          </p>
        )}
        {selectedDefaultGroupKey &&
          (defaultGroupManagersSelected.length > 0 || defaultGroupAssistantsSelected.length > 0) && (
            <p className="dgd-defaults-current">
              Currently:{" "}
              {[...defaultGroupManagersSelected, ...defaultGroupAssistantsSelected]
                .map((o) => o.label)
                .join(", ")}
            </p>
          )}
      </section>

      <section className="dgd-defaults" aria-label={`${partnerLabel} Sahahly accounts defaults`}>
        <div className="dgd-defaults-header">
          <span className="dgd-defaults-dot" />
          <h2 className="dgd-defaults-title">{partnerLabel} Sahahly accounts defaults</h2>
        </div>
        <p className="dgd-defaults-hint">
          Pick a default Sahahly manager and/or assistant for {partnerLabel}. Any <strong>new</strong>{" "}
          {partnerLabel} assignment (the whole thing, not one sub-group) is auto-assigned to
          them, with a deadline one day past what the partner sent. You can still assign a
          specific assignment to a specific Sahahly account below.
        </p>
        <div className="dgd-defaults-grid">
          <div className="dgd-defaults-field">
            <label htmlFor="dgd-default-managers">Default manager(s)</label>
            <Select
              inputId="dgd-default-managers"
              styles={{ ...selectStyles, menuPortal: (b) => ({ ...b, zIndex: 9999 }) }}
              menuPortalTarget={document.body}
              menuPosition="fixed"
              placeholder="Select manager(s)…"
              options={managerOptions}
              value={defaultManagersSelected}
              onChange={(opts) => setDefaultManagersSelected(opts || [])}
              isMulti
              isDisabled={defaultsLoading}
              closeMenuOnSelect={false}
            />
          </div>
          <div className="dgd-defaults-field">
            <label htmlFor="dgd-default-assistants">Default assistant(s)</label>
            <Select
              inputId="dgd-default-assistants"
              styles={{ ...selectStyles, menuPortal: (b) => ({ ...b, zIndex: 9999 }) }}
              menuPortalTarget={document.body}
              menuPosition="fixed"
              placeholder="Select assistant(s)…"
              options={assistantOptions}
              value={defaultAssistantsSelected}
              onChange={(opts) => setDefaultAssistantsSelected(opts || [])}
              isMulti
              isDisabled={defaultsLoading}
              closeMenuOnSelect={false}
            />
          </div>
          <button
            type="button"
            className="dm-assign dgd-defaults-save"
            disabled={defaultsSaving || defaultsLoading}
            onClick={saveProviderDefaults}
          >
            {defaultsSaving ? "Saving…" : "Save defaults"}
          </button>
        </div>
        {(defaultManagersSelected.length > 0 || defaultAssistantsSelected.length > 0) && (
          <p className="dgd-defaults-current">
            Currently:{" "}
            {[...defaultManagersSelected, ...defaultAssistantsSelected]
              .map((o) => o.label)
              .join(", ")}
          </p>
        )}
      </section>

      <p className="dgd-hint">
        A delegated manager or assistant sees <strong>only</strong> the {partnerLabel}{" "}
        assignments listed against their name, in their own {partnerLabel} tab. A
        manager may run marking there; an assistant reviews and publishes what was
        marked. The table below is for Sahahly accounts only — a provider account is
        assigned automatically through the sub-group defaults above.
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
                            {sahahlyManagers.map((m) => (
                              <option key={m._id} value={m._id}>
                                {m.name}
                              </option>
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
                            {sahahlyAssistants.map((p) => (
                              <option key={p._id} value={p._id}>
                                {p.name}
                              </option>
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
