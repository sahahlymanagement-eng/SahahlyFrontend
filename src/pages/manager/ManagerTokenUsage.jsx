import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FiArrowLeft, FiChevronRight } from "react-icons/fi";
import api from "../../api/api";
import { toast } from "react-toastify";
import ManagerSidebar from "../../components/ManagerSidebar";
import "./ManagerTokenUsage.css";

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

const now = new Date();

function formatNum(n) {
  return Number(n || 0).toLocaleString();
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

const ASSISTANT_COLUMNS = [
  { key: "name", label: "Assistant", render: (r) => r.personName },
  { key: "input", label: "Input", numeric: true, render: (r) => formatNum(r.inputTokens) },
  { key: "output", label: "Output", numeric: true, render: (r) => formatNum(r.outputTokens) },
  { key: "total", label: "Total", numeric: true, render: (r) => formatNum(r.totalTokens) },
  { key: "requests", label: "Requests", numeric: true, render: (r) => r.requestCount },
];

const CLASSROOM_COLUMNS = [
  { key: "name", label: "Classroom", render: (r) => r.classroomName },
  { key: "input", label: "Input", numeric: true, render: (r) => formatNum(r.inputTokens) },
  { key: "output", label: "Output", numeric: true, render: (r) => formatNum(r.outputTokens) },
  { key: "total", label: "Total", numeric: true, render: (r) => formatNum(r.totalTokens) },
  { key: "requests", label: "Requests", numeric: true, render: (r) => r.requestCount },
];

export default function ManagerTokenUsage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("classroom");
  const [period, setPeriod] = useState("custom");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [day, setDay] = useState("");
  const [loading, setLoading] = useState(false);
  const [byClassroom, setByClassroom] = useState(null);
  const [byAssistant, setByAssistant] = useState(null);
  const [selectedClassroomId, setSelectedClassroomId] = useState(null);
  const [selectedAssistantId, setSelectedAssistantId] = useState(null);
  const [assistantClassrooms, setAssistantClassrooms] = useState(null);
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

  const selectedAssistant = byAssistant?.assistants?.find(
    (a) => String(a.personId) === selectedAssistantId
  );

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!storedUser || !token) {
      navigate("/login");
      return;
    }
    const parsed = JSON.parse(storedUser);
    if (parsed.roleId?.name?.toLowerCase() !== "manager") {
      navigate("/login");
      return;
    }
    setUser(parsed);
  }, [navigate]);

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
    setSelectedAssistantId(null);
    setAssistantClassrooms(null);
  }, [tab, period, year, month, day]);

  useEffect(() => {
    if (!user?.id || !selectedAssistantId) {
      setAssistantClassrooms(null);
      return;
    }
    loadAssistantClassrooms();
  }, [user, selectedAssistantId, period, year, month, day]);

  const queryParams = (extra = {}) => {
    const params = { managerId: user.id, ...extra };
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
        const res = await api.get("/manager-token-usage/by-classroom", { params });
        setByClassroom(res.data);
      } else {
        const res = await api.get("/manager-token-usage/by-assistant", { params });
        setByAssistant(res.data);
      }
    } catch {
      toast.error("Failed to load token usage");
    } finally {
      setLoading(false);
    }
  };

  const loadAssistantClassrooms = async () => {
    setDetailLoading(true);
    try {
      const res = await api.get("/manager-token-usage/assistant-classrooms", {
        params: queryParams({ personId: selectedAssistantId }),
      });
      setAssistantClassrooms(res.data);
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

  const grandTotal =
    tab === "classroom"
      ? selectedClassroom
        ? selectedClassroom.totalTokens
        : byClassroom?.grandTotal ?? 0
      : selectedAssistantId && assistantClassrooms
        ? assistantClassrooms.grandTotal
        : byAssistant?.grandTotal ?? 0;

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

  const inClassroomDetail = tab === "classroom" && selectedClassroomId && selectedClassroom;
  const inAssistantDetail = tab === "assistant" && selectedAssistantId;

  return (
    <div className="tu-root">
      <ManagerSidebar />
      <main className="tu-main">
        <div className="tu-topbar">
          <h1>AI Token Usage</h1>
          <p>Track Gemini and Claude tokens used by assistants in your classrooms.</p>
        </div>

        <div className="tu-toolbar">
          <div className="tu-tabs">
            <button
              type="button"
              className={`tu-tab ${tab === "classroom" ? "tu-tab--active" : ""}`}
              onClick={() => setTab("classroom")}
            >
              By Classroom
            </button>
            <button
              type="button"
              className={`tu-tab ${tab === "assistant" ? "tu-tab--active" : ""}`}
              onClick={() => setTab("assistant")}
            >
              By Assistant
            </button>
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

        {(inClassroomDetail || inAssistantDetail) && (
          <button
            type="button"
            className="tu-back-btn"
            onClick={() => {
              setSelectedClassroomId(null);
              setSelectedAssistantId(null);
              setAssistantClassrooms(null);
            }}
          >
            <FiArrowLeft size={16} />
            Back to {tab === "classroom" ? "classrooms" : "assistants"}
          </button>
        )}

        <div className="tu-summary">
          <div className="tu-summary-card">
            <h3 className="tu-num">{formatNum(grandTotal)}</h3>
            <span>Total tokens</span>
          </div>
          {!inClassroomDetail && !inAssistantDetail && tab === "classroom" && byClassroom && (
            <div className="tu-summary-card">
              <h3>{byClassroom.classrooms?.length ?? 0}</h3>
              <span>Classrooms with usage</span>
            </div>
          )}
          {!inClassroomDetail && !inAssistantDetail && tab === "assistant" && byAssistant && (
            <div className="tu-summary-card">
              <h3>{byAssistant.assistants?.length ?? 0}</h3>
              <span>Assistants with usage</span>
            </div>
          )}
          {inClassroomDetail && (
            <div className="tu-summary-card">
              <h3>{selectedClassroom.assistants?.length ?? 0}</h3>
              <span>Assistants in classroom</span>
            </div>
          )}
          {inAssistantDetail && assistantClassrooms && (
            <div className="tu-summary-card">
              <h3>{assistantClassrooms.classrooms?.length ?? 0}</h3>
              <span>Classrooms for assistant</span>
            </div>
          )}
        </div>

        {loading && <div className="tu-loading">Loading…</div>}

        {!loading && tab === "classroom" && !inClassroomDetail && (
          <>
            {!byClassroom?.classrooms?.length ? (
              <div className="tu-empty">
                No token usage recorded for this period. Usage is tracked when assistants
                run AI marking on assignments.
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
                        <span>{c.assistants?.length ?? 0} assistants</span>
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

        {!loading && tab === "classroom" && inClassroomDetail && (
          <div className="tu-detail">
            <div className="tu-detail-header">
              <h2>{selectedClassroom.classroomName}</h2>
              <p>Token usage per assistant in this classroom · {rangeLabel}</p>
            </div>
            {!selectedClassroom.assistants?.length ? (
              <div className="tu-empty">No assistant usage in this classroom for this period.</div>
            ) : (
              <UsageTable
                columns={ASSISTANT_COLUMNS}
                rows={selectedClassroom.assistants}
                rowKey={(r) => String(r.personId)}
              />
            )}
          </div>
        )}

        {!loading && tab === "assistant" && !inAssistantDetail && (
          <>
            {!byAssistant?.assistants?.length ? (
              <div className="tu-empty">No token usage recorded for this period.</div>
            ) : (
              <div className="tu-click-list">
                {byAssistant.assistants.map((a) => {
                  const key = String(a.personId);
                  return (
                    <button
                      key={key}
                      type="button"
                      className="tu-click-row"
                      onClick={() => setSelectedAssistantId(key)}
                    >
                      <div className="tu-click-row-main">
                        <h3>{a.personName}</h3>
                        <span>{a.classroomCount} classrooms</span>
                      </div>
                      <div className="tu-click-row-meta">
                        <span className="tu-num">{formatNum(a.totalTokens)} tokens</span>
                        <FiChevronRight size={18} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {!loading && tab === "assistant" && inAssistantDetail && (
          <div className="tu-detail">
            <div className="tu-detail-header">
              <h2>{assistantClassrooms?.personName || selectedAssistant?.personName}</h2>
              <p>Token usage per classroom for this assistant · {rangeLabel}</p>
            </div>
            {detailLoading && <div className="tu-loading">Loading classroom breakdown…</div>}
            {!detailLoading && !assistantClassrooms?.classrooms?.length ? (
              <div className="tu-empty">No classroom usage for this assistant in this period.</div>
            ) : (
              !detailLoading && (
                <UsageTable
                  columns={CLASSROOM_COLUMNS}
                  rows={assistantClassrooms.classrooms}
                  rowKey={(r) => String(r.classroomId)}
                />
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
}
