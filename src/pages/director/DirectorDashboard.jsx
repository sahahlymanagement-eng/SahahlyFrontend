import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import "./DirectorDashboard.css";
import { FiUserCheck, FiShield, FiUsers } from "react-icons/fi";
import { toast } from "react-toastify";

export default function DirectorDashboard() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);

  const [stats, setStats] = useState({
    managers: 0,
    qualityManagers: 0,
    assistants: 0
  });

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");

    if (!storedUser || !token) {
      navigate("/login", { replace: true });
      return;
    }

    const parsed = JSON.parse(storedUser);

    if (parsed?.roleId?.name?.toLowerCase() !== "admin") {
      navigate("/login", { replace: true });
      return;
    }

    setUser(parsed);
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    loadStats();
  }, [user]);

  const loadStats = async () => {
    try {
      const res = await api.get("/people", { params: { page: 1, limit: 5000 } });
      const people = res.data.data || [];

      const managers = people.filter(
        (p) => p.roleId?.name?.trim().toLowerCase() === "manager"
      );

      const qualityManagers = people.filter(
        (p) => p.roleId?.name?.trim().toLowerCase() === "quality manager"
      );

      const assistants = people.filter(
        (p) => p.roleId?.name?.trim().toLowerCase() === "assistant"
      );

      setStats({
        managers: managers.length,
        qualityManagers: qualityManagers.length,
        assistants: assistants.length
      });
    } catch (err) {
      console.error("Failed loading stats", err);
      toast.error(err.response?.data?.message || "Failed to load dashboard stats");
    }
  };

  if (!user) return null;

  const totalPeople =
    stats.managers + stats.qualityManagers + stats.assistants;
  
  return (
    <div className="directorDashboardPage">
      <section className="directorDashSection">
        <div className="directorDashSectionHeader">
          <div className="directorDashTitleWrap">
            <span className="directorDashDot" />
            <h2 className="directorDashTitle">System Overview</h2>
          </div>

          <div className="directorDashCount">
            Total Staff: {totalPeople}
          </div>
        </div>

        <div className="directorDashStatsGrid">
          <div className="directorDashStatCard">
            <div className="directorDashIconWrap">
              <FiUserCheck className="directorDashIcon" />
            </div>
            <h3>{stats.managers}</h3>
            <p>Managers</p>
          </div>

          <div className="directorDashStatCard">
            <div className="directorDashIconWrap">
              <FiShield className="directorDashIcon" />
            </div>
            <h3>{stats.qualityManagers}</h3>
            <p>Quality Managers</p>
          </div>

          <div className="directorDashStatCard">
            <div className="directorDashIconWrap">
              <FiUsers className="directorDashIcon" />
            </div>
            <h3>{stats.assistants}</h3>
            <p>Assistants</p>
          </div>
        </div>
      </section>

      <section className="directorDashSection">
        <div className="directorDashSectionHeader">
          <div className="directorDashTitleWrap">
            <span className="directorDashDot" />
            <h2 className="directorDashTitle">Summary</h2>
          </div>
        </div>

        <div className="directorDashSummaryCard">
          <div className="directorDashSummaryRow">
            <span className="directorDashSummaryLabel">Managers</span>
            <span className="directorDashSummaryValue">{stats.managers}</span>
          </div>

          <div className="directorDashSummaryRow">
            <span className="directorDashSummaryLabel">Quality Managers</span>
            <span className="directorDashSummaryValue">
              {stats.qualityManagers}
            </span>
          </div>

          <div className="directorDashSummaryRow">
            <span className="directorDashSummaryLabel">Assistants</span>
            <span className="directorDashSummaryValue">{stats.assistants}</span>
          </div>

          <div className="directorDashSummaryRow directorDashSummaryTotal">
            <span className="directorDashSummaryLabel">Total Staff</span>
            <span className="directorDashSummaryValue">{totalPeople}</span>
          </div>
        </div>
      </section>
    </div>
  );
}