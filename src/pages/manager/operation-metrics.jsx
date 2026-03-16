import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import "./Operation-metrics.css";

export default function OperationMetrics(){

  const navigate = useNavigate();

  const [user,setUser] = useState(null);
  const [metrics,setMetrics] = useState(null);

  useEffect(()=>{

    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");

    if(!storedUser || !token){
      navigate("/login");
      return;
    }

    const parsed = JSON.parse(storedUser);

    if(parsed.roleId.name.toLowerCase() !== "manager"){
      navigate("/login");
      return;
    }

    setUser(parsed);

  },[]);


  useEffect(()=>{

    if(!user) return;

    loadMetrics();

  },[user]);


  const loadMetrics = async ()=>{

    try{

      const res = await api.get(`/manager-operation-metrics?managerId=${user.id}`);

      setMetrics(res.data);

    }catch(err){
      toast.error("Failed loading metrics");
    }

  };


  if(!metrics) return null;


  return(
    <div className="operationLayout">

      <h2>Operation Metrics</h2>

      {/* TOTAL */}
      <div className="metricCards">

        <div className="metricCard">
          <h3>{metrics.totalAssignments}</h3>
          <p>Total Assignments</p>
        </div>

        <div className="metricCard">
          <h3>{metrics.averageTurnaroundHours}</h3>
          <p>Avg Turnaround (hrs)</p>
        </div>

      </div>

      {/* STATUS */}
      <h3>Assignment Status</h3>

      <div className="statusGrid">

        {Object.entries(metrics.statusCounts).map(([k,v])=>(
          <div key={k} className="statusCard">
            <h4>{v}</h4>
            <p>{k.replace(/_/g," ")}</p>
          </div>
        ))}

      </div>


      {/* FAILED DEADLINES */}

      <h3>Failed Deadline Assistants</h3>

      <table className="metricTable">
        <thead>
          <tr>
            <th>Assistant</th>
            <th>Assignment</th>
            <th>Classroom</th>
            <th>Teacher</th>
            <th>Deadline</th>
            <th>Status</th>
          </tr>
        </thead>

        <tbody>

          {metrics.failedDeadlines.map((f,i)=>(
            <tr key={i}>
              <td>{f.assistantName}</td>
              <td>{f.assignmentTitle}</td>
              <td>{f.classroomName}</td>
              <td>{f.teacherName}</td>
              <td>{new Date(f.deadline).toLocaleString()}</td>
              <td className="danger">{f.status}</td>
            </tr>
          ))}

        </tbody>

      </table>


      {/* TURNAROUND */}

      <h3>Turnaround Time</h3>

      <table className="metricTable">
        <thead>
          <tr>
            <th>Assignment</th>
            <th>Classroom</th>
            <th>Due Date</th>
            <th>Done Date</th>
            <th>Turnaround (hrs)</th>
          </tr>
        </thead>

        <tbody>

          {metrics.turnaround.map((t,i)=>(
            <tr key={i}>
              <td>{t.assignmentTitle}</td>
              <td>{t.classroomName}</td>
              <td>{new Date(t.dueDate).toLocaleDateString()}</td>
              <td>{new Date(t.doneDate).toLocaleDateString()}</td>
              <td>{t.turnaroundHours}</td>
            </tr>
          ))}

        </tbody>

      </table>

    </div>
  );
}