import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiChevronRight } from "react-icons/fi";
import api from "../api/api";
import { toast } from "react-toastify";
import "../pages/manager/ManagerTokenUsage.css";

const MONTHS = [
  { value: "", label: "All months" },
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

const PRESETS = [
  { id: "day", label: "Today" },
  { id: "week", label: "Last 7 days" },
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
];

const TABS = [
  { id: "classroom", label: "Classrooms" },
  { id: "assistant", label: "Staff" },
  { id: "assignment", label: "Assignments" },
];

const MANAGER_TABS = [
  { id: "classroom", label: "Classrooms" },
  { id: "assistant", label: "Assistants" },
  { id: "assignment", label: "Assignments" },
];

const now = new Date();

function formatNum(n) {
  return Number(n || 0).toLocaleString();
}

function isSameCalendarDay(a, b) {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function formatShortDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Single day or range when usage spans multiple days in the filtered period. */
function formatUsageDate(firstUsedAt, lastUsedAt) {
  if (!lastUsedAt) return "—";
  if (!firstUsedAt || isSameCalendarDay(firstUsedAt, lastUsedAt)) {
    return formatShortDate(lastUsedAt);
  }
  const first = new Date(firstUsedAt).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const last = formatShortDate(lastUsedAt);
  return `${first} – ${last}`;
}

function usageDateTitle(firstUsedAt, lastUsedAt) {
  if (!lastUsedAt) return undefined;
  if (!firstUsedAt || isSameCalendarDay(firstUsedAt, lastUsedAt)) {
    return new Date(lastUsedAt).toLocaleString();
  }
  return `${new Date(firstUsedAt).toLocaleString()} – ${new Date(lastUsedAt).toLocaleString()}`;
}

function daysInMonth(year, month) {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

function buildYearOptions() {
  const current = now.getFullYear();
  const years = [];
  for (let y = current; y >= current - 5; y -= 1) {
    years.push({ value: String(y), label: String(y) });
  }
  return years;
}

function describeRange({ period, year, month, day }) {
  if (period === "all") return "All time";
  if (period === "week") return "Last 7 days";
  if (period === "day" && !year) return "Today";

  const monthLabel = MONTHS.find((m) => m.value === month)?.label;

  if (year && month && day) return `${monthLabel} ${day}, ${year}`;
  if (year && month) return `${monthLabel} ${year}`;
  if (year) return `Year ${year}`;
  if (period === "month") return "This month";
  return "Selected period";
}

function UsageTable({ columns, rows, rowKey }) {
  return (
    <table className="tu-table">
      <thead>
        <tr>
          {columns.map((col) => (
            <th key={col.key}>{col.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)}>
            {columns.map((col) => (
              <td key={col.key} className={col.numeric ? "tu-num" : undefined}>
                {col.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const DATE_COLUMN = {
  key: "date",
  label: "Date",
  render: (r) => (
    <span className="tu-date-cell" title={usageDateTitle(r.firstUsedAt, r.lastUsedAt)}>
      {formatUsageDate(r.firstUsedAt, r.lastUsedAt)}
    </span>
  ),
};

const TOKEN_COLUMNS = [
  { key: "input", label: "Input", numeric: true, render: (r) => formatNum(r.inputTokens) },
  { key: "output", label: "Output", numeric: true, render: (r) => formatNum(r.outputTokens) },
  { key: "total", label: "Total", numeric: true, render: (r) => formatNum(r.totalTokens) },
  { key: "requests", label: "Requests", numeric: true, render: (r) => r.requestCount },
];

function formatRole(role) {
  return role || "—";
}

function staffColumns(showRole) {
  const cols = [
    { key: "name", label: "Name", render: (r) => r.personName },
  ];
  if (showRole) {
    cols.push({ key: "role", label: "Role", render: (r) => formatRole(r.personRole) });
  }
  cols.push(DATE_COLUMN, ...TOKEN_COLUMNS);
  return cols;
}

const ASSIGNMENT_COLUMNS = [
  { key: "name", label: "Assignment", render: (r) => r.assignmentTitle },
  { key: "classroom", label: "Classroom", render: (r) => r.classroomName || "—" },
  DATE_COLUMN,
  ...TOKEN_COLUMNS,
];

const CLASSROOM_ASSIGNMENT_COLUMNS = [
  { key: "name", label: "Assignment", render: (r) => r.assignmentTitle },
  DATE_COLUMN,
  ...TOKEN_COLUMNS,
];

/**
 * @param {{ apiBase: string, scope: 'manager' | 'director', embedded?: boolean }} props
 */
export default function TokenUsageView({ apiBase, scope, embedded = false }) {
  const navigate = useNavigate();
  const requiredRole = scope === "manager" ? "manager" : "admin";
  const isDirector = scope === "director";
  const tabs = isDirector ? TABS : MANAGER_TABS;
  const personColumns = staffColumns(isDirector);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("classroom");
  const [period, setPeriod] = useState("custom");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [day, setDay] = useState("");
  const [loading, setLoading] = useState(false);
  const [byClassroom, setByClassroom] = useState(null);
  const [byAssistant, setByAssistant] = useState(null);
  const [byAssignment, setByAssignment] = useState(null);
  const [selectedClassroomId, setSelectedClassroomId] = useState(null);
  const [classroomBreakdown, setClassroomBreakdown] = useState(null);
  const [classroomDetail, setClassroomDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const yearOptions = useMemo(() => buildYearOptions(), []);
  const dayOptions = useMemo(() => {
    const max = daysInMonth(Number(year), Number(month));
    const options = [{ value: "", label: "All days" }];
    for (let d = 1; d <= max; d += 1) {
      options.push({ value: String(d), label: String(d) });
    }
    return options;
  }, [year, month]);

  const rangeLabel = describeRange({ period, year, month, day });

  const selectedClassroom = byClassroom?.classrooms?.find(
    (c) => String(c.classroomId) === selectedClassroomId
  );

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!storedUser || !token) {
      navigate("/login");
      return;
    }
    const parsed = JSON.parse(storedUser);
    if (parsed.roleId?.name?.toLowerCase() !== requiredRole) {
      navigate("/login");
      return;
    }
    setUser(parsed);
  }, [navigate, requiredRole]);

  useEffect(() => {
    if (!user?.id) return;
    loadData();
  }, [user, tab, period, year, month, day]);

  useEffect(() => {
    if (!day) return;
    const max = daysInMonth(Number(year), Number(month));
    if (Number(day) > max) setDay("");
  }, [year, month, day]);

  useEffect(() => {
    setSelectedClassroomId(null);
    setClassroomBreakdown(null);
    setClassroomDetail(null);
  }, [tab, period, year, month, day]);

  useEffect(() => {
    if (!user?.id || !selectedClassroomId || !classroomBreakdown) {
      setClassroomDetail(null);
      return;
    }
    loadClassroomBreakdown();
  }, [user, selectedClassroomId, classroomBreakdown, period, year, month, day]);

  const queryParams = (extra = {}) => {
    const params = { ...extra };
    if (scope === "manager") {
      params.managerId = user.id;
    }
    if (period === "all" || period === "week") {
      params.period = period;
      return params;
    }
    if (year) {
      params.period = "custom";
      params.year = year;
      if (month) params.month = month;
      if (day) params.day = day;
      return params;
    }
    params.period = period;
    return params;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const params = queryParams();
      if (tab === "classroom") {
        const res = await api.get(`${apiBase}/by-classroom`, { params });
        setByClassroom(res.data);
      } else if (tab === "assistant") {
        const res = await api.get(`${apiBase}/by-assistant`, { params });
        setByAssistant(res.data);
      } else {
        const res = await api.get(`${apiBase}/by-assignment`, { params });
        setByAssignment(res.data);
      }
    } catch {
      toast.error("Failed to load token usage");
    } finally {
      setLoading(false);
    }
  };

  const loadClassroomBreakdown = async () => {
    setDetailLoading(true);
    try {
      const res = await api.get(`${apiBase}/classroom-breakdown`, {
        params: queryParams({
          classroomId: selectedClassroomId,
          groupBy: classroomBreakdown,
        }),
      });
      setClassroomDetail(res.data);
    } catch {
      toast.error("Failed to load classroom breakdown");
    } finally {
      setDetailLoading(false);
    }
  };

  const applyPreset = (presetId) => {
    setPeriod(presetId);
    if (presetId === "all" || presetId === "week") {
      setYear("");
      setMonth("");
      setDay("");
      return;
    }
    if (presetId === "day") {
      setYear(String(now.getFullYear()));
      setMonth(String(now.getMonth() + 1));
      setDay(String(now.getDate()));
      setPeriod("custom");
      return;
    }
    if (presetId === "month") {
      setYear(String(now.getFullYear()));
      setMonth(String(now.getMonth() + 1));
      setDay("");
      setPeriod("custom");
    }
  };

  const handleYearChange = (value) => {
    setYear(value);
    setPeriod("custom");
    if (!value) {
      setMonth("");
      setDay("");
    }
  };

  const handleMonthChange = (value) => {
    setMonth(value);
    setPeriod("custom");
    if (!value) setDay("");
  };

  const handleDayChange = (value) => {
    setDay(value);
    setPeriod("custom");
  };

  const handleBack = () => {
    if (classroomBreakdown) {
      setClassroomBreakdown(null);
      setClassroomDetail(null);
      return;
    }
    setSelectedClassroomId(null);
  };

  const grandTotal = (() => {
    if (tab === "classroom") {
      if (classroomDetail) return classroomDetail.grandTotal ?? 0;
      if (selectedClassroom) return selectedClassroom.totalTokens ?? 0;
      return byClassroom?.grandTotal ?? 0;
    }
    if (tab === "assistant") return byAssistant?.grandTotal ?? 0;
    return byAssignment?.grandTotal ?? 0;
  })();

  const activePreset =
    period === "all"
      ? "all"
      : period === "week"
        ? "week"
        : period === "custom" &&
            year &&
            month &&
            day === String(now.getDate()) &&
            year === String(now.getFullYear()) &&
            month === String(now.getMonth() + 1)
          ? "day"
          : period === "custom" &&
              year &&
              month &&
              !day &&
              year === String(now.getFullYear()) &&
              month === String(now.getMonth() + 1)
            ? "month"
            : null;

  const inClassroomFlow = tab === "classroom" && selectedClassroomId;
  const inClassroomPicker = inClassroomFlow && !classroomBreakdown;
  const inClassroomBreakdown = inClassroomFlow && classroomBreakdown;

  const summarySecondary = (() => {
    if (tab === "classroom" && !inClassroomFlow && byClassroom) {
      return { count: byClassroom.classrooms?.length ?? 0, label: "Classrooms with usage" };
    }
    if (tab === "assistant" && byAssistant) {
      return {
        count: byAssistant.assistants?.length ?? 0,
        label: isDirector ? "Staff with usage" : "Assistants with usage",
      };
    }
    if (tab === "assignment" && byAssignment) {
      return { count: byAssignment.assignments?.length ?? 0, label: "Assignments with usage" };
    }
    if (inClassroomBreakdown && classroomDetail) {
      return {
        count: classroomDetail.rows?.length ?? 0,
        label: classroomBreakdown === "assistant"
          ? (isDirector ? "Staff" : "Assistants")
          : "Assignments",
      };
    }
    return null;
  })();

  const subtitle =
    scope === "director"
      ? "Organization-wide Gemini and Claude token usage across all classrooms."
      : "Track Gemini and Claude tokens used in your classrooms.";

  return (
    <main className={`tu-main ${embedded ? "tu-main--embedded" : ""}`}>
      <div className="tu-topbar">
        <h1>AI Token Usage</h1>
        <p>{subtitle}</p>
      </div>

      <div className="tu-toolbar">
        <div className="tu-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`tu-tab ${tab === t.id ? "tu-tab--active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tu-filters">
        <div className="tu-presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`tu-period-btn ${activePreset === p.id ? "tu-period-btn--active" : ""}`}
              onClick={() => applyPreset(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="tu-date-selects">
          <label className="tu-date-field">
            <span>Year</span>
            <select value={year} onChange={(e) => handleYearChange(e.target.value)}>
              <option value="">All years</option>
              {yearOptions.map((y) => (
                <option key={y.value} value={y.value}>
                  {y.label}
                </option>
              ))}
            </select>
          </label>

          <label className="tu-date-field">
            <span>Month</span>
            <select
              value={month}
              onChange={(e) => handleMonthChange(e.target.value)}
              disabled={!year}
            >
              {MONTHS.map((m) => (
                <option key={m.value || "all"} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="tu-date-field">
            <span>Date</span>
            <select
              value={day}
              onChange={(e) => handleDayChange(e.target.value)}
              disabled={!year || !month}
            >
              {dayOptions.map((d) => (
                <option key={d.value || "all"} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="tu-range-label">Showing: {rangeLabel}</p>
      </div>

      {inClassroomFlow && (
        <button type="button" className="tu-back-btn" onClick={handleBack}>
          <FiArrowLeft size={16} />
          {classroomBreakdown ? "Change breakdown" : "Back to classrooms"}
        </button>
      )}

      <div className="tu-summary">
        <div className="tu-summary-card">
          <h3 className="tu-num">{formatNum(grandTotal)}</h3>
          <span>Total tokens</span>
        </div>
        {summarySecondary && (
          <div className="tu-summary-card">
            <h3>{summarySecondary.count}</h3>
            <span>{summarySecondary.label}</span>
          </div>
        )}
      </div>

      {loading && <div className="tu-loading">Loading…</div>}

      {!loading && tab === "classroom" && !inClassroomFlow && (
        <>
          {!byClassroom?.classrooms?.length ? (
            <div className="tu-empty">
              No token usage recorded for this period. Usage is tracked when{" "}
              {isDirector ? "managers and assistants" : "assistants"} run AI marking on
              assignments.
            </div>
          ) : (
            <div className="tu-click-list">
              {byClassroom.classrooms.map((c) => {
                const key = String(c.classroomId);
                return (
                  <button
                    key={key}
                    type="button"
                    className="tu-click-row"
                    onClick={() => setSelectedClassroomId(key)}
                  >
                    <div className="tu-click-row-main">
                      <h3>{c.classroomName}</h3>
                      <span>
                        {c.requestCount} marking requests
                        {" · "}
                        <span
                          className="tu-date-cell"
                          title={usageDateTitle(c.firstUsedAt, c.lastUsedAt)}
                        >
                          {formatUsageDate(c.firstUsedAt, c.lastUsedAt)}
                        </span>
                      </span>
                    </div>
                    <div className="tu-click-row-meta">
                      <span className="tu-num">{formatNum(c.totalTokens)} tokens</span>
                      <FiChevronRight size={18} />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {!loading && inClassroomPicker && selectedClassroom && (
        <div className="tu-detail">
          <div className="tu-detail-header">
            <h2>{selectedClassroom.classroomName}</h2>
            <p>How would you like to break down token usage? · {rangeLabel}</p>
          </div>
          <div className="tu-breakdown-picker">
            <button
              type="button"
              className="tu-breakdown-btn"
              onClick={() => setClassroomBreakdown("assistant")}
            >
              <span className="tu-breakdown-btn-title">
                {isDirector ? "Per staff member" : "Per assistant"}
              </span>
              <span className="tu-breakdown-btn-desc">
                {isDirector
                  ? "See which managers and assistants used tokens in this classroom"
                  : "See which assistants used tokens in this classroom"}
              </span>
            </button>
            <button
              type="button"
              className="tu-breakdown-btn"
              onClick={() => setClassroomBreakdown("assignment")}
            >
              <span className="tu-breakdown-btn-title">Per Assignment</span>
              <span className="tu-breakdown-btn-desc">
                See token usage broken down by assignment
              </span>
            </button>
          </div>
        </div>
      )}

      {!loading && inClassroomBreakdown && (
        <div className="tu-detail">
          <div className="tu-detail-header">
            <h2>{classroomDetail?.classroomName || selectedClassroom?.classroomName}</h2>
            <p>
              Token usage per{" "}
              {classroomBreakdown === "assistant"
                ? (isDirector ? "staff member" : "assistant")
                : "assignment"}{" "}
              ·{" "}
              {rangeLabel}
            </p>
          </div>
          {detailLoading && <div className="tu-loading">Loading breakdown…</div>}
          {!detailLoading && !classroomDetail?.rows?.length && (
            <div className="tu-empty">No usage in this classroom for this period.</div>
          )}
          {!detailLoading && classroomDetail?.rows?.length > 0 && (
            <UsageTable
              columns={
                classroomBreakdown === "assistant"
                  ? personColumns
                  : CLASSROOM_ASSIGNMENT_COLUMNS
              }
              rows={classroomDetail.rows}
              rowKey={(r) =>
                classroomBreakdown === "assistant"
                  ? String(r.personId)
                  : String(r.assignmentId || r.assignmentTitle)
              }
            />
          )}
        </div>
      )}

      {!loading && tab === "assistant" && (
        <>
          {!byAssistant?.assistants?.length ? (
            <div className="tu-empty">No token usage recorded for this period.</div>
          ) : (
            <UsageTable
              columns={personColumns}
              rows={byAssistant.assistants}
              rowKey={(r) => String(r.personId)}
            />
          )}
        </>
      )}

      {!loading && tab === "assignment" && (
        <>
          {!byAssignment?.assignments?.length ? (
            <div className="tu-empty">No token usage recorded for this period.</div>
          ) : (
            <UsageTable
              columns={ASSIGNMENT_COLUMNS}
              rows={byAssignment.assignments}
              rowKey={(r) => String(r.assignmentId)}
            />
          )}
        </>
      )}
    </main>
  );
}
