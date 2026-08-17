import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiChevronRight } from "react-icons/fi";
import api from "../api/api";
import { toast } from "react-toastify";
import { formatCostEgp, formatCostUsd } from "../utils/markingCost";
import usePersistedState from "../hooks/usePersistedState";
import { getRoleName } from "../utils/authRoutes";
import "../pages/manager/ManagerTokenUsage.css";

const now = new Date();

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
  { id: "reports", label: "Reports & Analytics" },
];

const MANAGER_TABS = [
  { id: "classroom", label: "Classrooms" },
  { id: "assistant", label: "Assistants" },
  { id: "assignment", label: "Assignments" },
  { id: "reports", label: "Reports & Analytics" },
];

const REPORT_BREAKDOWN_OPTIONS = [
  { id: "classroom", label: "By classroom" },
  { id: "channel", label: "By channel" },
  { id: "assignment", label: "By assignment" },
  { id: "student", label: "By student" },
  { id: "trigger", label: "By trigger" },
  { id: "person", label: "By person" },
];

const UNASSIGNED_CLASSROOM_KEY = "unassigned";
const UNKNOWN_CLASSROOM_KEY = "unknown-classroom";

function classroomRowKey(classroom) {
  if (classroom?.classroomId) return String(classroom.classroomId);
  if (classroom?.classroomName === "Unknown classroom") return UNKNOWN_CLASSROOM_KEY;
  return UNASSIGNED_CLASSROOM_KEY;
}

function isUnassignedClassroomRow(classroom) {
  return !classroom?.classroomId && classroom?.classroomName !== "Unknown classroom";
}

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

function requestBarColor(percent) {
  if (percent >= 90) return "#f87171";
  if (percent >= 70) return "#fbbf24";
  return "#22c55e";
}

function RequestUsageBar({ used, limit, rangeLabel }) {
  const count = Number(used) || 0;
  const cap = limit != null && limit > 0 ? Number(limit) : null;
  const percent = cap ? Math.min(100, Math.round((count / cap) * 100)) : null;
  const fillWidth = cap ? percent : count > 0 ? 100 : 0;

  return (
    <div className="tu-request-panel">
      <div className="tu-request-panel-header">
        <div>
          <h3>AI marking requests</h3>
          <p>
            {cap
              ? `${formatNum(count)} of ${formatNum(cap)} requests used · ${rangeLabel}`
              : `${formatNum(count)} requests logged · ${rangeLabel}`}
          </p>
        </div>
        {cap ? (
          <span className="tu-request-panel-pct" style={{ color: requestBarColor(percent) }}>
            {percent}%
          </span>
        ) : (
          <span className="tu-request-panel-pct tu-request-panel-pct--open">
            {formatNum(count)}
          </span>
        )}
      </div>
      <div className="tu-request-bar" aria-hidden={!count && !cap}>
        <div
          className="tu-request-bar-fill"
          style={{
            width: `${fillWidth}%`,
            background: cap ? requestBarColor(percent) : "#3b82f6",
          }}
        />
      </div>
      {cap ? (
        <p className="tu-request-panel-foot">
          Monthly VPS budget from <code>AI_REQUEST_MONTHLY_LIMIT</code>. Each mark, batch job, or
          priority run counts as one request.
        </p>
      ) : (
        <p className="tu-request-panel-foot">
          Set <code>AI_REQUEST_MONTHLY_LIMIT</code> on the VPS backend to show a quota bar.
        </p>
      )}
    </div>
  );
}

function UsageTable({ columns, rows, rowKey }) {
  return (
    <div className="sah-table-scroll">
    <table className="tu-table sah-table--cards">
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
              <td
                key={col.key}
                data-label={col.label}
                className={col.numeric ? "tu-num" : undefined}
              >
                {col.render(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
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
  { key: "costUsd", label: "Cost (USD)", numeric: true, money: true, render: (r) => formatCostUsd(r.costUsd) },
  { key: "costEgp", label: "Cost (EGP)", numeric: true, money: true, render: (r) => formatCostEgp(r.costEgp) },
  { key: "requests", label: "Requests", numeric: true, render: (r) => r.requestCount },
];

function tokenColumns(showCosts) {
  return showCosts ? TOKEN_COLUMNS : TOKEN_COLUMNS.filter((c) => !c.money);
}

const REPORT_TYPE_COLUMNS = [
  { key: "type", label: "Report type", render: (r) => r.label || r.source },
  DATE_COLUMN,
  { key: "deliveries", label: "Deliveries", numeric: true, render: (r) => r.deliveryCount },
];

const REPORT_CHANNEL_COLUMNS = [
  { key: "type", label: "Report type", render: (r) => r.sourceLabel },
  { key: "channel", label: "Channel", render: (r) => r.channelLabel },
  { key: "deliveries", label: "Deliveries", numeric: true, render: (r) => r.deliveryCount },
];

function reportTypeColumns(showCosts) {
  return [...REPORT_TYPE_COLUMNS, ...tokenColumns(showCosts).filter((c) => c.key !== "requests")];
}

function reportChannelColumns(showCosts) {
  return [...REPORT_CHANNEL_COLUMNS, ...tokenColumns(showCosts).filter((c) => c.key !== "requests")];
}

function formatRole(role) {
  return role || "—";
}

function staffColumns(showRole, showCosts, showSources = false) {
  const cols = [
    { key: "name", label: "Name", render: (r) => r.personName },
  ];
  if (showRole) {
    cols.push({ key: "role", label: "Role", render: (r) => formatRole(r.personRole) });
  }
  if (showSources) {
    cols.push({
      key: "sources",
      label: "Tools",
      render: (r) => r.sourceLabels || "—",
    });
  }
  cols.push(DATE_COLUMN, ...tokenColumns(showCosts));
  return cols;
}

function assignmentColumns(showCosts) {
  return [
    { key: "name", label: "Assignment", render: (r) => r.assignmentTitle },
    { key: "classroom", label: "Classroom", render: (r) => r.classroomName || "—" },
    DATE_COLUMN,
    ...tokenColumns(showCosts),
  ];
}

function classroomAssignmentColumns(showCosts) {
  return [
    { key: "name", label: "Assignment", render: (r) => r.assignmentTitle },
    DATE_COLUMN,
    ...tokenColumns(showCosts),
  ];
}

/**
 * @param {{ apiBase: string, scope: 'manager' | 'director', embedded?: boolean }} props
 */
export default function TokenUsageView({ apiBase, scope, embedded = false }) {
  const navigate = useNavigate();
  const isDirector = scope === "director";
  const showCosts = isDirector;
  const tabs = isDirector ? TABS : MANAGER_TABS;
  const personColumns = staffColumns(isDirector, showCosts);
  const assignmentCols = assignmentColumns(showCosts);
  const classroomAssignmentCols = classroomAssignmentColumns(showCosts);
  const reportTypeCols = reportTypeColumns(showCosts);
  const reportChannelCols = reportChannelColumns(showCosts);
  const [user, setUser] = useState(null);
  const [tab, setTab] = usePersistedState(`tokenusage:${scope}:tab`, "classroom");
  const [period, setPeriod] = useState("custom");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [day, setDay] = useState("");
  const [loading, setLoading] = useState(false);
  const [byClassroom, setByClassroom] = useState(null);
  const [byAssistant, setByAssistant] = useState(null);
  const [byAssignment, setByAssignment] = useState(null);
  const [reportsAnalytics, setReportsAnalytics] = useState(null);
  const [selectedReportSource, setSelectedReportSource] = useState(null);
  const [reportBreakdown, setReportBreakdown] = useState("classroom");
  const [reportBreakdownData, setReportBreakdownData] = useState(null);
  const [selectedClassroomId, setSelectedClassroomId] = useState(null);
  const [classroomBreakdown, setClassroomBreakdown] = useState(null);
  const [classroomDetail, setClassroomDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [requestLimit, setRequestLimit] = useState(null);

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
    (c) => classroomRowKey(c) === selectedClassroomId
  );
  const isUnassignedClassroom =
    selectedClassroomId === UNASSIGNED_CLASSROOM_KEY ||
    (selectedClassroom != null && isUnassignedClassroomRow(selectedClassroom));

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!storedUser || !token) {
      navigate("/login");
      return;
    }
    const parsed = JSON.parse(storedUser);
    const role = getRoleName(parsed);
    const allowed =
      scope === "manager"
        ? role === "manager"
        : role === "admin" || role === "director";
    if (!allowed) {
      navigate("/login");
      return;
    }
    setUser(parsed);
  }, [navigate, scope]);

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
    setSelectedReportSource(null);
    setReportBreakdownData(null);
  }, [tab, period, year, month, day]);

  useEffect(() => {
    if (!user?.id || !selectedClassroomId || !classroomBreakdown) {
      setClassroomDetail(null);
      return;
    }
    loadClassroomBreakdown();
  }, [user, selectedClassroomId, classroomBreakdown, period, year, month, day]);

  useEffect(() => {
    if (!user?.id || !selectedReportSource) {
      setReportBreakdownData(null);
      return;
    }
    loadReportBreakdown();
  }, [user, selectedReportSource, reportBreakdown, period, year, month, day]);

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
        setRequestLimit(res.data?.requestLimit ?? null);
      } else if (tab === "assistant") {
        const res = await api.get(`${apiBase}/by-assistant`, { params });
        setByAssistant(res.data);
        setRequestLimit(res.data?.requestLimit ?? null);
      } else if (tab === "assignment") {
        const res = await api.get(`${apiBase}/by-assignment`, { params });
        setByAssignment(res.data);
        setRequestLimit(res.data?.requestLimit ?? null);
      } else {
        const res = await api.get(`${apiBase}/reports-analytics`, { params });
        setReportsAnalytics(res.data);
        setRequestLimit(null);
      }
    } catch {
      toast.error("Failed to load token usage");
    } finally {
      setLoading(false);
    }
  };

  const loadReportBreakdown = async () => {
    setDetailLoading(true);
    try {
      const res = await api.get(`${apiBase}/reports-analytics/breakdown`, {
        params: queryParams({
          source: selectedReportSource,
          groupBy: reportBreakdown,
        }),
      });
      setReportBreakdownData(res.data);
    } catch {
      toast.error("Failed to load report breakdown");
    } finally {
      setDetailLoading(false);
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
      if (res.data?.requestLimit != null) {
        setRequestLimit(res.data.requestLimit);
      }
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
    if (tab === "reports" && selectedReportSource) {
      setSelectedReportSource(null);
      setReportBreakdownData(null);
      return;
    }
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
    if (tab === "assignment") return byAssignment?.grandTotal ?? 0;
    if (tab === "reports") {
      if (reportBreakdownData) return reportBreakdownData.grandTotal ?? 0;
      return reportsAnalytics?.grandTotal ?? 0;
    }
    return 0;
  })();

  const grandCostUsd = (() => {
    if (tab === "classroom") {
      if (classroomDetail) return classroomDetail.grandCostUsd ?? 0;
      if (selectedClassroom) return selectedClassroom.costUsd ?? 0;
      return byClassroom?.grandCostUsd ?? 0;
    }
    if (tab === "assistant") return byAssistant?.grandCostUsd ?? 0;
    if (tab === "assignment") return byAssignment?.grandCostUsd ?? 0;
    if (tab === "reports") {
      if (reportBreakdownData) return reportBreakdownData.grandCostUsd ?? 0;
      return reportsAnalytics?.grandCostUsd ?? 0;
    }
    return 0;
  })();

  const grandCostEgp = (() => {
    if (tab === "classroom") {
      if (classroomDetail) return classroomDetail.grandCostEgp ?? 0;
      if (selectedClassroom) return selectedClassroom.costEgp ?? 0;
      return byClassroom?.grandCostEgp ?? 0;
    }
    if (tab === "assistant") return byAssistant?.grandCostEgp ?? 0;
    if (tab === "assignment") return byAssignment?.grandCostEgp ?? 0;
    if (tab === "reports") {
      if (reportBreakdownData) return reportBreakdownData.grandCostEgp ?? 0;
      return reportsAnalytics?.grandCostEgp ?? 0;
    }
    return 0;
  })();

  const grandRequestCount = (() => {
    if (tab === "classroom") {
      if (classroomDetail) return classroomDetail.grandRequestCount ?? 0;
      if (selectedClassroom) return selectedClassroom.requestCount ?? 0;
      return byClassroom?.grandRequestCount ?? 0;
    }
    if (tab === "assistant") return byAssistant?.grandRequestCount ?? 0;
    if (tab === "assignment") return byAssignment?.grandRequestCount ?? 0;
    if (tab === "reports") {
      if (reportBreakdownData) return reportBreakdownData.grandDeliveries ?? 0;
      return reportsAnalytics?.grandDeliveries ?? 0;
    }
    return 0;
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

  const inReportsFlow = tab === "reports" && selectedReportSource;
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
    if (tab === "reports" && reportsAnalytics && !selectedReportSource) {
      return {
        count: reportsAnalytics.types?.length ?? 0,
        label: "Report types",
      };
    }
    if (tab === "reports" && reportBreakdownData) {
      return {
        count: reportBreakdownData.rows?.length ?? 0,
        label: REPORT_BREAKDOWN_OPTIONS.find((o) => o.id === reportBreakdown)?.label || "Rows",
      };
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
      ? "Organization-wide Sahahly and Claude token usage across all classrooms."
      : "Track Sahahly and Claude tokens used in your classrooms.";

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

      {inReportsFlow && (
        <button type="button" className="tu-back-btn" onClick={handleBack}>
          <FiArrowLeft size={16} />
          Back to report types
        </button>
      )}

      <div className="tu-summary">
        <div className="tu-summary-card">
          <h3 className="tu-num">{formatNum(grandTotal)}</h3>
          <span>Total tokens</span>
        </div>
        {showCosts && (
          <>
            <div className="tu-summary-card">
              <h3 className="tu-num">{formatCostUsd(grandCostUsd)}</h3>
              <span>Est. cost (USD)</span>
            </div>
            <div className="tu-summary-card">
              <h3 className="tu-num">{formatCostEgp(grandCostEgp)}</h3>
              <span>Est. cost (EGP)</span>
            </div>
          </>
        )}
        {summarySecondary && (
          <div className="tu-summary-card">
            <h3>{summarySecondary.count}</h3>
            <span>{summarySecondary.label}</span>
          </div>
        )}
        <div className="tu-summary-card">
          <h3 className="tu-num">{formatNum(grandRequestCount)}</h3>
          <span>{tab === "reports" ? "Report deliveries" : "Marking requests"}</span>
        </div>
      </div>

      {!loading && tab !== "reports" && (
        <RequestUsageBar
          used={grandRequestCount}
          limit={requestLimit}
          rangeLabel={rangeLabel}
        />
      )}

      {loading && <div className="tu-loading">Loading…</div>}

      {!loading && tab === "classroom" && !inClassroomFlow && (
        <>
          {!byClassroom?.classrooms?.length ? (
            <div className="tu-empty">
              No token usage recorded for this period. Usage is tracked when{" "}
              {isDirector ? "managers and assistants" : "assistants"} run AI marking
              (standard, batch, or priority) on assignments.
            </div>
          ) : (
            <div className="tu-click-list">
              {byClassroom.classrooms.map((c) => {
                const key = classroomRowKey(c);
                const unassigned = isUnassignedClassroomRow(c);
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
                        {unassigned
                          ? "Paper Marking, Manual Correction, and other marks with no classroom"
                          : null}
                        {unassigned ? " · " : null}
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
                      <span className="tu-num">
                        {formatNum(c.totalTokens)} tokens
                        {showCosts ? (
                          <>
                            {" · "}
                            {formatCostUsd(c.costUsd)}
                            {" · "}
                            {formatCostEgp(c.costEgp)}
                          </>
                        ) : null}
                      </span>
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
            <p>
              {isUnassignedClassroom
                ? `AI marking that was not tied to a classroom or assignment · ${rangeLabel}`
                : `How would you like to break down token usage? · ${rangeLabel}`}
            </p>
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
                {isUnassignedClassroom
                  ? isDirector
                    ? "See who used Paper Marking, Manual Correction, or other unassigned marking"
                    : "See which assistants used Paper Marking or other unassigned marking"
                  : isDirector
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
                {isUnassignedClassroom
                  ? "These marks usually have no assignment — shown as “No assignment”"
                  : "See token usage broken down by assignment"}
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
              {isUnassignedClassroom
                ? classroomBreakdown === "assistant"
                  ? `Who used Single marking (no classroom) · ${rangeLabel}`
                  : `Single marking by assignment · ${rangeLabel}`
                : <>
                    Token usage per{" "}
                    {classroomBreakdown === "assistant"
                      ? (isDirector ? "staff member" : "assistant")
                      : "assignment"}{" "}
                    · {rangeLabel}
                  </>}
            </p>
          </div>
          {detailLoading && <div className="tu-loading">Loading breakdown…</div>}
          {!detailLoading && !classroomDetail?.rows?.length && (
            <div className="tu-empty">
              {isUnassignedClassroom
                ? "No Single marking usage for this period."
                : "No usage in this classroom for this period."}
            </div>
          )}
          {!detailLoading && classroomDetail?.rows?.length > 0 && (
            <UsageTable
              columns={
                classroomBreakdown === "assistant"
                  ? staffColumns(isDirector, showCosts, isUnassignedClassroom)
                  : classroomAssignmentCols
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
              columns={assignmentCols}
              rows={byAssignment.assignments}
              rowKey={(r) => String(r.assignmentId)}
            />
          )}
        </>
      )}

      {!loading && tab === "reports" && !selectedReportSource && (
        <>
          {!reportsAnalytics?.types?.length ? (
            <div className="tu-empty">
              No report or analytics activity recorded for this period. Deliveries are logged when
              monthly parent reports, executive teacher reports, 12h teacher submission
              WhatsApp reports, collective WhatsApp reports, or question bank AI scans run.
            </div>
          ) : (
            <>
              {reportsAnalytics.byChannel?.length > 0 && (
                <div className="tu-detail" style={{ marginBottom: 24 }}>
                  <div className="tu-detail-header">
                    <h2>By report type and channel</h2>
                    <p>Email vs WhatsApp and other channels · {rangeLabel}</p>
                  </div>
                  <UsageTable
                    columns={reportChannelCols}
                    rows={reportsAnalytics.byChannel}
                    rowKey={(r) => `${r.source}-${r.reportChannel || "none"}`}
                  />
                </div>
              )}
              <div className="tu-detail-header" style={{ marginBottom: 12 }}>
                <h2>Report types</h2>
                <p>Click a report type for a detailed breakdown · {rangeLabel}</p>
              </div>
              <div className="tu-click-list">
                {reportsAnalytics.types.map((t) => (
                  <button
                    key={t.source}
                    type="button"
                    className="tu-click-row"
                    onClick={() => setSelectedReportSource(t.source)}
                  >
                    <div className="tu-click-row-main">
                      <h3>{t.label}</h3>
                      <span>
                        {t.deliveryCount} deliveries
                        {" · "}
                        <span
                          className="tu-date-cell"
                          title={usageDateTitle(t.firstUsedAt, t.lastUsedAt)}
                        >
                          {formatUsageDate(t.firstUsedAt, t.lastUsedAt)}
                        </span>
                      </span>
                    </div>
                    <div className="tu-click-row-meta">
                      <span className="tu-num">
                        {formatNum(t.totalTokens)} tokens
                        {showCosts ? (
                          <>
                            {" · "}
                            {formatCostUsd(t.costUsd)}
                          </>
                        ) : null}
                      </span>
                      <FiChevronRight size={18} />
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {!loading && tab === "reports" && selectedReportSource && (
        <div className="tu-detail">
          <div className="tu-detail-header">
            <h2>
              {reportsAnalytics?.types?.find((t) => t.source === selectedReportSource)?.label ||
                reportBreakdownData?.sourceLabel ||
                selectedReportSource}
            </h2>
            <p>Detailed breakdown · {rangeLabel}</p>
          </div>
          <div className="tu-breakdown-picker">
            {REPORT_BREAKDOWN_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className={`tu-breakdown-btn ${reportBreakdown === opt.id ? "tu-breakdown-btn--active" : ""}`}
                onClick={() => setReportBreakdown(opt.id)}
              >
                <span className="tu-breakdown-btn-title">{opt.label}</span>
              </button>
            ))}
          </div>
          {detailLoading && <div className="tu-loading">Loading breakdown…</div>}
          {!detailLoading && !reportBreakdownData?.rows?.length && (
            <div className="tu-empty">No deliveries for this report type in the selected period.</div>
          )}
          {!detailLoading && reportBreakdownData?.rows?.length > 0 && (
            <UsageTable
              columns={reportBreakdownColumns(reportBreakdown, showCosts)}
              rows={reportBreakdownData.rows}
              rowKey={(r) => reportBreakdownRowKey(r, reportBreakdown)}
            />
          )}
        </div>
      )}
    </main>
  );
}

function reportBreakdownColumns(groupBy, showCosts = true) {
  const nameCol = (() => {
    if (groupBy === "classroom") {
      return { key: "name", label: "Classroom", render: (r) => r.classroomName || "—" };
    }
    if (groupBy === "channel") {
      return { key: "name", label: "Channel", render: (r) => r.channelLabel || "—" };
    }
    if (groupBy === "assignment") {
      return { key: "name", label: "Assignment", render: (r) => r.assignmentTitle || "—" };
    }
    if (groupBy === "student") {
      return { key: "name", label: "Student", render: (r) => r.studentName || "—" };
    }
    if (groupBy === "trigger") {
      return { key: "name", label: "Trigger", render: (r) => r.reportTrigger || "—" };
    }
    return { key: "name", label: "Person", render: (r) => r.personName || "Automated" };
  })();

  return [
    nameCol,
    DATE_COLUMN,
    { key: "deliveries", label: "Deliveries", numeric: true, render: (r) => r.deliveryCount },
    ...tokenColumns(showCosts).filter((c) => c.key !== "requests"),
  ];
}

function reportBreakdownRowKey(row, groupBy) {
  if (groupBy === "classroom") return String(row.classroomId || row.classroomName || "unknown");
  if (groupBy === "channel") return String(row.reportChannel || "none");
  if (groupBy === "assignment") return String(row.assignmentId || row.assignmentTitle || "unknown");
  if (groupBy === "student") return String(row.studentId || row.studentName || "unknown");
  if (groupBy === "trigger") return String(row.reportTrigger || "none");
  return String(row.personId || row.personName || "automated");
}
