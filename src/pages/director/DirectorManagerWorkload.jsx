import { useEffect, useMemo, useState } from "react";
import api from "../../api/api";
import "./DirectorManagerWorkload.css";
import { toast } from "react-toastify";

import {
  FiBarChart2,
  FiUser,
  FiMail,
  FiHome,
  FiCheckCircle,
  FiShield,
  FiAlertTriangle,
  FiSearch,
} from "react-icons/fi";

export default function DirectorManagerWorkload() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.get("/director/manager-workload");
      setData(res.data?.managers || []);
    } catch (err) {
      console.error(err);
      toast.error(
        err.response?.data?.message || "Failed to load manager workload"
      );
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data;

    return data.filter(
      (m) =>
        m.name?.toLowerCase().includes(q) ||
        m.email?.toLowerCase().includes(q)
    );
  }, [search, data]);

  return (
    <div className="managerWorkloadPage">
      <div className="pageHeader">
        <div className="headerLeft">
          <div className="headerIcon">
            <FiBarChart2 />
          </div>

          <div>
            <h2>Manager Workload</h2>
            <p>Overview of manager classroom assignments and completed tasks</p>
          </div>
        </div>
      </div>

      <div className="searchBar">
        <FiSearch />
        <input
          placeholder="Search manager..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <p className="loading">Loading workload...</p>}

      {!loading && !filtered.length && (
        <p className="loading">
          {search
            ? `No managers match "${search}".`
            : "No managers found."}
        </p>
      )}

      <div className="workloadGrid">
        {filtered.map((m) => (
          <div className="managerCard" key={m.managerId}>
            <div className="managerTop">
              <div className="managerAvatar">
                <FiUser />
              </div>

              <div className="managerInfo">
                <h3>{m.name}</h3>
                <p>
                  <FiMail />
                  <span>{m.email}</span>
                </p>
              </div>
            </div>

            <div className="metricsRow">
              <div className="metricBox">
                <div className="metricIcon">
                  <FiHome />
                </div>
                <div>
                  <span>{m.classroomCount}</span>
                  <p>Classrooms</p>
                </div>
              </div>

              <div className="metricBox">
                <div className="metricIcon">
                  <FiBarChart2 />
                </div>
                <div>
                  <span>{m.totalAssignments}</span>
                  <p>Total Assignments</p>
                </div>
              </div>

              <div className="metricBox">
                <div className="metricIcon">
                  <FiCheckCircle />
                </div>
                <div>
                  <span>{m.totalCompleted}</span>
                  <p>Completed</p>
                </div>
              </div>
            </div>

            <div className="statusGrid">
              <div className="statusItem done">
                <div className="statusTitle">
                  <FiCheckCircle />
                  <span>Done</span>
                </div>
                <strong>{m.doneCount}</strong>
              </div>

              <div className="statusItem quality">
                <div className="statusTitle">
                  <FiShield />
                  <span>Done by Quality</span>
                </div>
                <strong>{m.doneByQualityCount}</strong>
              </div>

              <div className="statusItem late">
                <div className="statusTitle">
                  <FiAlertTriangle />
                  <span>Quality Late</span>
                </div>
                <strong>{m.doneByQualityLateCount}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
