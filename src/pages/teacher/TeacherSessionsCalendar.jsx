import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import {
  FiCalendar,
  FiChevronLeft,
  FiChevronRight,
  FiClipboard,
  FiPlus,
  FiBookOpen,
  FiUsers,
} from "react-icons/fi";
import api from "../../api/api";
import { usePagination } from "../../hooks/usePagination";
import usePersistedState from "../../hooks/usePersistedState";
import Pagination from "../../components/Pagination";
import { TeacherPageHeader, TeacherLoading, TeacherEmpty } from "./TeacherUI";
import "./teacher.css";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfMonth(year, monthIndex) {
  return new Date(year, monthIndex, 1);
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function toKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDue(assignment) {
  if (assignment?.dueDateTime) {
    const d = new Date(assignment.dueDateTime);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const due = assignment?.dueDate;
  if (!due) return null;
  if (typeof due === "string" || due instanceof Date) {
    const d = new Date(due);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (due.year && due.month && due.day) {
    return new Date(
      due.year,
      due.month - 1,
      due.day,
      assignment?.dueTime?.hours ?? 23,
      assignment?.dueTime?.minutes ?? 59
    );
  }
  return null;
}

function parseSessionDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fetchAllAssignments(classroomId) {
  const all = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages && page <= 20) {
    const { data } = await api.get(`/manager-assignments/classroom/${classroomId}/assignments`, {
      params: { page, limit: 50 },
    });
    all.push(...(data?.data || []));
    totalPages = data?.totalPages || 1;
    page += 1;
  }
  return all;
}

export default function TeacherSessionsCalendar() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedClassroom, setSelectedClassroom] = usePersistedState(
    "teacher:sessions:classroom",
    null
  );
  const [classroomSearch, setClassroomSearch] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [selectedDayKey, setSelectedDayKey] = useState(null);
  const [newSessionDate, setNewSessionDate] = useState("");
  const [savingSession, setSavingSession] = useState(false);

  const year = cursor.getFullYear();
  const monthIndex = cursor.getMonth();
  const month = monthIndex + 1;

  const classroomParams = useMemo(
    () => ({ search: classroomSearch }),
    [classroomSearch]
  );

  const {
    data: classrooms,
    page: classroomPage,
    totalPages: classroomTotalPages,
    fetchPage: fetchClassroomPage,
  } = usePagination(
    user?.id ? `/google-classroom/teacher-courses/${user.id}` : "/google-classroom/teacher-courses/_",
    classroomParams,
    20,
    "data",
    !!user?.id
  );

  const loadEvents = useCallback(async () => {
    if (!selectedClassroom?._id) {
      setAssignments([]);
      setSessions([]);
      return;
    }
    setLoadingEvents(true);
    try {
      const [asg, attendanceRes] = await Promise.all([
        fetchAllAssignments(selectedClassroom._id),
        api.get("/reports/monthly-parent/attendance", {
          params: {
            classroomId: selectedClassroom._id,
            year,
            month,
          },
        }),
      ]);
      setAssignments(asg);
      setSessions(attendanceRes.data?.attendance?.sessions || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load calendar events");
      setAssignments([]);
      setSessions([]);
    } finally {
      setLoadingEvents(false);
    }
  }, [selectedClassroom?._id, year, month]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const eventsByDay = useMemo(() => {
    const map = {};
    const push = (key, event) => {
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(event);
    };

    for (const a of assignments) {
      const due = parseDue(a);
      if (!due) continue;
      if (due.getFullYear() !== year || due.getMonth() !== monthIndex) continue;
      push(toKey(due), {
        id: `asg-${a._id}`,
        type: "assignment",
        title: a.title || "Assignment due",
        time: due,
      });
    }

    sessions.forEach((s, idx) => {
      const d = parseSessionDate(s.date);
      if (!d) return;
      if (d.getFullYear() !== year || d.getMonth() !== monthIndex) return;
      const present = Object.values(s.map || {}).filter(Boolean).length;
      push(toKey(d), {
        id: `sess-${idx}-${s.date}`,
        type: "session",
        title: s.sourceFileName || "Class session",
        meta: `${present} present`,
        time: d,
      });
    });

    return map;
  }, [assignments, sessions, year, monthIndex]);

  const calendarCells = useMemo(() => {
    const first = startOfMonth(year, monthIndex);
    const total = daysInMonth(year, monthIndex);
    const leading = first.getDay();
    const cells = [];
    for (let i = 0; i < leading; i += 1) cells.push(null);
    for (let day = 1; day <= total; day += 1) {
      cells.push(new Date(year, monthIndex, day));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, monthIndex]);

  const selectedEvents = selectedDayKey ? eventsByDay[selectedDayKey] || [] : [];

  const addSession = async () => {
    if (!selectedClassroom?._id) {
      toast.warn("Select a classroom first");
      return;
    }
    if (!newSessionDate) {
      toast.warn("Pick a session date");
      return;
    }
    setSavingSession(true);
    try {
      const nextSessions = [
        ...sessions.map((s) => ({
          date: s.date || null,
          sourceFileName: s.sourceFileName || null,
          map: s.map || {},
          presentStudentIds: Object.entries(s.map || {})
            .filter(([, present]) => present === true)
            .map(([id]) => id),
        })),
        {
          date: newSessionDate,
          sourceFileName: "Calendar session",
          map: {},
          presentStudentIds: [],
        },
      ];
      const { data } = await api.post("/reports/monthly-parent/attendance", {
        classroomId: selectedClassroom._id,
        year,
        month,
        sessions: nextSessions,
      });
      setSessions(data.attendance?.sessions || nextSessions);
      setSelectedDayKey(newSessionDate);
      setNewSessionDate("");
      toast.success("Session added to this month");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save session");
    } finally {
      setSavingSession(false);
    }
  };

  const monthLabel = cursor.toLocaleString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="tch-page tch-page--wide">
      <TeacherPageHeader
        eyebrow="Teacher workspace"
        title="Sessions & Calendar"
        subtitle="See assignment due dates and class sessions in one calendar. Add sessions for attendance and parent reports."
        actions={
          <div className="tch-page-actions">
            <button
              type="button"
              className="tch-btn tch-btn--ghost"
              onClick={() => navigate("/teacher/students-parents")}
            >
              <FiUsers size={15} />
              Students & Parents
            </button>
            <button
              type="button"
              className="tch-btn tch-btn--ghost"
              onClick={() => navigate("/teacher/courses")}
            >
              <FiBookOpen size={15} />
              Course management
            </button>
            <button
              type="button"
              className="tch-btn tch-btn--primary"
              onClick={() => navigate("/teacher/reports")}
            >
              <FiClipboard size={15} />
              Reports
            </button>
          </div>
        }
      />

      <div className="tch-cal-layout">
        <aside className="tch-cal-side">
          <h2>Classroom</h2>
          <input
            className="tch-input"
            type="search"
            placeholder="Search classrooms…"
            value={classroomSearch}
            onChange={(e) => setClassroomSearch(e.target.value)}
          />
          <div className="tch-sp-list">
            {(classrooms || []).map((c) => (
              <button
                key={c._id}
                type="button"
                className={`tch-sp-list-item${
                  selectedClassroom?._id === c._id ? " tch-sp-list-item--active" : ""
                }`}
                onClick={() => setSelectedClassroom(c)}
              >
                <span className="tch-sp-list-title">{c.name}</span>
                {c.section ? <span className="tch-sp-list-meta">{c.section}</span> : null}
              </button>
            ))}
          </div>
          <Pagination
            page={classroomPage}
            totalPages={classroomTotalPages}
            onPageChange={fetchClassroomPage}
          />

          <div className="tch-cal-add">
            <h3>Add session</h3>
            <p>Creates an attendance session for the visible month.</p>
            <input
              className="tch-input"
              type="date"
              value={newSessionDate}
              onChange={(e) => setNewSessionDate(e.target.value)}
            />
            <button
              type="button"
              className="tch-btn tch-btn--primary"
              disabled={savingSession || !selectedClassroom}
              onClick={addSession}
            >
              <FiPlus size={15} />
              {savingSession ? "Saving…" : "Add session"}
            </button>
          </div>
        </aside>

        <section className="tch-cal-main">
          {!selectedClassroom ? (
            <TeacherEmpty
              icon={<FiCalendar size={28} />}
              title="Select a classroom"
              description="Choose a class to view due dates and sessions."
            />
          ) : (
            <>
              <div className="tch-cal-toolbar">
                <button
                  type="button"
                  className="tch-icon-btn"
                  aria-label="Previous month"
                  onClick={() => setCursor(new Date(year, monthIndex - 1, 1))}
                >
                  <FiChevronLeft size={18} />
                </button>
                <h2>{monthLabel}</h2>
                <button
                  type="button"
                  className="tch-icon-btn"
                  aria-label="Next month"
                  onClick={() => setCursor(new Date(year, monthIndex + 1, 1))}
                >
                  <FiChevronRight size={18} />
                </button>
                <button
                  type="button"
                  className="tch-btn tch-btn--ghost tch-btn--sm"
                  onClick={() =>
                    setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
                  }
                >
                  Today
                </button>
              </div>

              {loadingEvents ? (
                <TeacherLoading message="Loading calendar…" />
              ) : (
                <>
                  <div className="tch-cal-grid" role="grid" aria-label={monthLabel}>
                    {WEEKDAYS.map((d) => (
                      <div key={d} className="tch-cal-weekday">
                        {d}
                      </div>
                    ))}
                    {calendarCells.map((date, idx) => {
                      if (!date) {
                        return <div key={`empty-${idx}`} className="tch-cal-cell tch-cal-cell--muted" />;
                      }
                      const key = toKey(date);
                      const events = eventsByDay[key] || [];
                      const isToday = key === toKey(today);
                      const isSelected = key === selectedDayKey;
                      return (
                        <button
                          key={key}
                          type="button"
                          className={[
                            "tch-cal-cell",
                            isToday ? "tch-cal-cell--today" : "",
                            isSelected ? "tch-cal-cell--selected" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          onClick={() => {
                            setSelectedDayKey(key);
                            setNewSessionDate(key);
                          }}
                        >
                          <span className="tch-cal-daynum">{date.getDate()}</span>
                          <div className="tch-cal-dots">
                            {events.slice(0, 3).map((ev) => (
                              <span
                                key={ev.id}
                                className={`tch-cal-dot tch-cal-dot--${ev.type}`}
                                title={ev.title}
                              />
                            ))}
                            {events.length > 3 ? (
                              <span className="tch-cal-more">+{events.length - 3}</span>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="tch-cal-legend">
                    <span>
                      <i className="tch-cal-dot tch-cal-dot--assignment" /> Assignment due
                    </span>
                    <span>
                      <i className="tch-cal-dot tch-cal-dot--session" /> Class session
                    </span>
                  </div>

                  <div className="tch-cal-day-detail">
                    <h3>
                      {selectedDayKey
                        ? new Date(`${selectedDayKey}T12:00:00`).toLocaleDateString(undefined, {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "Select a day"}
                    </h3>
                    {!selectedDayKey ? (
                      <p className="tch-sp-empty-hint">Click a day to see due dates and sessions.</p>
                    ) : selectedEvents.length === 0 ? (
                      <p className="tch-sp-empty-hint">No events on this day. You can add a session.</p>
                    ) : (
                      <ul className="tch-cal-event-list">
                        {selectedEvents.map((ev) => (
                          <li key={ev.id} className={`tch-cal-event tch-cal-event--${ev.type}`}>
                            <strong>{ev.title}</strong>
                            <span>
                              {ev.type === "assignment" ? "Due" : "Session"}
                              {ev.meta ? ` · ${ev.meta}` : ""}
                              {ev.time
                                ? ` · ${ev.time.toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}`
                                : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
