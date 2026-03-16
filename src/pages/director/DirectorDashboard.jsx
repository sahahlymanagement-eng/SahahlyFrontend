import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import "./DirectorDashboard.css";

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

      const res = await api.get("/people");

      const people = res.data || [];

      const managers = people.filter(
        p => p.roleId?.name?.trim().toLowerCase() === "manager"
      );

      const qualityManagers = people.filter(
        p => p.roleId?.name?.trim().toLowerCase() === "quality manager"
      );

      const assistants = people.filter(
        p => p.roleId?.name?.trim().toLowerCase() === "assistant"
      );

      setStats({
        managers: managers.length,
        qualityManagers: qualityManagers.length,
        assistants: assistants.length
      });

    } catch (err) {
      console.error("Failed loading stats", err);
    }

  };

  if (!user) return null;

  return (

    <div className="directorLayout">

      <div className="directorMain">

        <div className="dashboardContent">

          <h2 className="dashboardTitle">
            System Overview
          </h2>

          <div className="statsGrid">

            <div className="statCard">
              <h3>{stats.managers}</h3>
              <p>Managers</p>
            </div>

            <div className="statCard">
              <h3>{stats.qualityManagers}</h3>
              <p>Quality Managers</p>
            </div>

            <div className="statCard">
              <h3>{stats.assistants}</h3>
              <p>Assistants</p>
            </div>

          </div>

        </div>

      </div>

    </div>

  );

}