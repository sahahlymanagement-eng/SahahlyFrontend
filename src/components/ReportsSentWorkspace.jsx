import { useCallback, useEffect, useState } from "react";
import api from "../api/api";
import { toast } from "react-toastify";
import {
  FiArrowLeft,
  FiBarChart2,
  FiCalendar,
  FiClock,
  FiRefreshCw,
  FiSend,
} from "react-icons/fi";
import { isDirectorLikeVariant } from "../utils/directorLikeAccess";
import Pagination from "./Pagination";
import "../pages/manager/ManagerAssignments.css";

function formatSentAt(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function recipientPillClass(recipientType) {
  if (recipientType === "parent") return "ma-sent-pill ma-sent-pill--parent";
  if (recipientType === "teacher") return "ma-sent-pill ma-sent-pill--teacher";
  return "ma-sent-pill ma-sent-pill--custom";
}

export default function ReportsSentWorkspace({ variant = "manager", onBack, onNavigate }) {
  const isDirector = isDirectorLikeVariant(variant);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [latest, setLatest] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem("user");
    if (stored) setUser(JSON.parse(stored));
  }, []);

  const fetchHistory = useCallback(async (pageNum = 1) => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data } = await api.get("/reports/sent-history", {
        params: {
          personId: user.id,
          variant,
          page: pageNum,
          limit: 20,
        },
      });
      setItems(data.items || []);
      setLatest(data.latest || null);
      setPage(data.page || pageNum);
      setTotalPages(data.totalPages || 0);
      setTotal(data.total || 0);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load sent reports");
      setItems([]);
      setLatest(null);
    } finally {
      setLoading(false);
    }
  }, [user?.id, variant]);

  useEffect(() => {
    if (user?.id) fetchHistory(1);
  }, [user?.id, fetchHistory]);

  const pageTitle =
    variant === "teacher" || variant === "assistant" || isDirector
      ? "Reports"
      : "Assignments";

  return (
    <main className="ma-main">
      <header className="ma-topbar">
        <div className="ma-topbar-left">
          <button type="button" className="ma-back-link" onClick={onBack}>
            <FiArrowLeft size={14} /> Back
          </button>
          <h1 className="ma-topbar-title">{pageTitle}</h1>
          <span className="ma-topbar-sub">
            Review what was already sent so you do not duplicate reports.
          </span>
          <div className="ma-report-tabs" style={{ marginTop: 10 }}>
            <button type="button" className="ma-report-tab" onClick={() => onNavigate?.("assignment")}>
              Assignment Reports
            </button>
            <button type="button" className="ma-report-tab" onClick={() => onNavigate?.("monthly")}>
              <FiCalendar size={12} /> Monthly Parent Reports
            </button>
            <button type="button" className="ma-report-tab" onClick={() => onNavigate?.("executive")}>
              <FiBarChart2 size={12} /> Teacher Executive Analysis
            </button>
            <button type="button" className="ma-report-tab ma-report-tab--active">
              <FiSend size={12} /> Reports Sent
            </button>
          </div>
        </div>
        <div className="ma-topbar-right">
          <button
            type="button"
            className="ma-send-btn ma-send-btn--ghost"
            onClick={() => fetchHistory(page)}
            disabled={loading}
          >
            <FiRefreshCw size={13} />
            {loading ? "Loading…" : "Refresh"}
          </button>
        </div>
      </header>

      <div className="ma-content">
        {latest && (
          <section className="ma-sent-latest-card">
            <div className="ma-sent-latest-head">
              <FiClock size={16} />
              <h2>Most recent send</h2>
            </div>
            <p className="ma-sent-latest-summary">{latest.summary}</p>
            <div className="ma-sent-latest-meta">
              <span>{formatSentAt(latest.sentAt)}</span>
              {latest.classroomName && <span>{latest.classroomName}</span>}
              <span className={recipientPillClass(latest.recipientType)}>
                {latest.recipientLabel}
              </span>
            </div>
            {latest.assignmentTitles?.length > 0 && (
              <ul className="ma-sent-assignment-list">
                {latest.assignmentTitles.map((title) => (
                  <li key={title}>{title}</li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="ma-sent-history-section">
          <div className="ma-sent-history-head">
            <h2>Send history</h2>
            <span className="ma-sent-history-count">{total} record{total !== 1 ? "s" : ""}</span>
          </div>

          {loading && items.length === 0 ? (
            <p className="ma-empty-state">Loading sent reports…</p>
          ) : items.length === 0 ? (
            <p className="ma-empty-state">No reports sent yet for your classrooms.</p>
          ) : (
            <div className="ma-sent-table-wrap">
              <table className="ma-sent-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Type</th>
                    <th>To</th>
                    <th>Classroom</th>
                    <th>Assignments / period</th>
                    <th>Counts</th>
                    <th>Sent by</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id}>
                      <td data-label="When">{formatSentAt(row.sentAt)}</td>
                      <td data-label="Type">{row.reportTypeLabel}</td>
                      <td data-label="To">
                        <span className={recipientPillClass(row.recipientType)}>
                          {row.recipientLabel}
                        </span>
                      </td>
                      <td data-label="Classroom">{row.classroomName || "—"}</td>
                      <td data-label="Content">
                        {row.periodLabel ? (
                          <span>{row.periodLabel}</span>
                        ) : row.assignmentTitles?.length ? (
                          <span title={row.assignmentTitles.join(", ")}>
                            {row.assignmentTitles.slice(0, 2).join(", ")}
                            {row.assignmentTitles.length > 2
                              ? ` +${row.assignmentTitles.length - 2} more`
                              : ""}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-label="Counts">
                        {row.sentCount > 0 && `${row.sentCount} sent`}
                        {row.skippedCount > 0 &&
                          `${row.sentCount > 0 ? ", " : ""}${row.skippedCount} skipped`}
                        {row.teacherNotified && (
                          <span className="ma-sent-teacher-note" title="Teacher was notified">
                            {" "}
                            · teacher notified
                          </span>
                        )}
                      </td>
                      <td data-label="Sent by">{row.sentByPersonName || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <Pagination page={page} totalPages={totalPages} onPageChange={fetchHistory} />
          )}
        </section>
      </div>
    </main>
  );
}
