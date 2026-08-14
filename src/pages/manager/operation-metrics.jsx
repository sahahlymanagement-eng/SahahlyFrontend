import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import "./operation-metrics.css";
import DashboardPeriodFilter from "../../components/DashboardPeriodFilter";
import { useDashboardPeriod } from "../../hooks/useDashboardPeriod";

export default function OperationMetrics() {
  const navigate = useNavigate();
  const period = useDashboardPeriod();
  const [user, setUser] = useState(null);
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");

    if (!storedUser || !token) {
      navigate("/login");
      return;
    }

    const parsed = JSON.parse(storedUser);

    if (parsed.roleId.name.toLowerCase() !== "manager") {
      navigate("/login");
      return;
    }

    setUser(parsed);
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    loadMetrics();
  }, [user, period.params.from, period.params.to]);

  const loadMetrics = async () => {
    try {
      const res = await api.get(`/manager-operation-metrics`, {
        params: { managerId: user.id, ...period.params },
      });
      setMetrics(res.data);
    } catch (err) {
      toast.error("Failed loading metrics");
    }
  };

  const periodFilter = (
    <DashboardPeriodFilter
      from={period.from}
      to={period.to}
      setFrom={period.setFrom}
      setTo={period.setTo}
      resetToThisMonth={period.resetToThisMonth}
      monthLabel={period.monthLabel}
    />
  );

  if (!metrics) {
    return (
      <div className="operationLayout">
        <h2>Operation Metrics</h2>
        {periodFilter}
        <p>Loading…</p>
      </div>
    );
  }

  return (
    <div className="operationLayout">
      <h2>Operation Metrics</h2>
      {periodFilter}

      <div className="metricCards">
        <div className="metricCard">
          <h3>{metrics.totalAssignments}</h3>
          <p>Total Assignments</p>
        </div>

        <div className="metricCard">
          <h3>{metrics.averageTurnaroundHours}</h3>
          <p>Avg Turnaround (hrs)</p>
        </div>

        <div className="metricCard">
          <h3>{(metrics.failedDeadlines || []).length}</h3>
          <p>Failed Deadlines</p>
        </div>
      </div>

      <h3>Status Breakdown</h3>
      <div className="statusGrid">
        {Object.entries(metrics.statusCounts || {}).map(([status, count]) => (
          <div className="statusCard" key={status}>
            <h3>{count}</h3>
            <p>{status}</p>
          </div>
        ))}
      </div>

      <h3>Failed Deadlines</h3>
      <table className="metricTable sah-table--cards">
        <thead>
          <tr>
            <th>Assistant</th>
            <th>Assignment</th>
            <th>Classroom</th>
            <th>Teacher</th>
            <th>Deadline</th>
          </tr>
        </thead>
        <tbody>
          {(metrics.failedDeadlines || []).length === 0 ? (
            <tr>
              <td colSpan={5}>No failed deadlines in this period.</td>
            </tr>
          ) : (
            (metrics.failedDeadlines || []).map((item, i) => (
              <tr key={i}>
                <td data-label="Assistant">{item.assistantName}</td>
                <td data-label="Assignment">{item.assignmentTitle}</td>
                <td data-label="Classroom">{item.classroomName}</td>
                <td data-label="Teacher">{item.teacherName}</td>
                <td data-label="Deadline" className="danger">
                  {item.deadline
                    ? new Date(item.deadline).toLocaleString()
                    : "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h3>Turnaround</h3>
      <table className="metricTable sah-table--cards">
        <thead>
          <tr>
            <th>Assignment</th>
            <th>Classroom</th>
            <th>Teacher</th>
            <th>Due</th>
            <th>Done</th>
            <th>Hours</th>
          </tr>
        </thead>
        <tbody>
          {(metrics.turnaround || []).length === 0 ? (
            <tr>
              <td colSpan={6}>No completed assignments in this period.</td>
            </tr>
          ) : (
            (metrics.turnaround || []).map((item, i) => (
              <tr key={i}>
                <td data-label="Assignment">{item.assignmentTitle}</td>
                <td data-label="Classroom">{item.classroomName}</td>
                <td data-label="Teacher">{item.teacherName}</td>
                <td data-label="Due">
                  {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "—"}
                </td>
                <td data-label="Done">
                  {item.doneDate
                    ? new Date(item.doneDate).toLocaleDateString()
                    : "—"}
                </td>
                <td data-label="Hours">{item.turnaroundHours}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
