import { useEffect, useMemo, useState } from "react";
import api from "../../api/api";
import "./DirectorManagerWorkload.css";

import {
  FiBarChart2,
  FiUser,
  FiMail,
  FiHome,
  FiCheckCircle,
  FiShield,
  FiAlertTriangle,
  FiSearch
} from "react-icons/fi";

export default function DirectorManagerWorkload() {

const [data,setData] = useState([]);
const [loading,setLoading] = useState(false);
const [search,setSearch] = useState("");

useEffect(()=>{
loadData();
},[]);

const loadData = async () => {

try{

setLoading(true);

const [peopleRes, classroomManagersRes] = await Promise.all([
api.get("/people"),
api.get("/classroom-managers")
]);

const people = peopleRes.data || [];
const classroomManagers = classroomManagersRes.data || [];

const managers = people.filter(p=>{
const role = typeof p.roleId === "object" ? p.roleId?.name?.toLowerCase() : "";
return role === "manager";
});

const classroomMap = {};

managers.forEach(m=>{
classroomMap[m._id] =
classroomManagers.filter(a => a.personId?._id === m._id);
});

const results = await Promise.all(

managers.map(async manager => {

const managerClassrooms = classroomMap[manager._id] || [];

const classroomIds =
managerClassrooms
.map(c => c.classroomId?._id)
.filter(Boolean);

const classroomCount = classroomIds.length;

const assignmentRequests =
classroomIds.map(id => api.get(`/assignments?classroomId=${id}`));

const responses = await Promise.all(assignmentRequests);

const allAssignments =
responses.flatMap(r => r.data || []);

const totalAssignments = allAssignments.length;

const doneCount =
allAssignments.filter(a=>a.status==="DONE").length;

const doneByQualityCount =
allAssignments.filter(a=>a.status==="DONE_BY_QUALITY").length;

const doneByQualityLateCount =
allAssignments.filter(a=>a.status==="DONE_BY_QUALITY_LATE").length;

const totalCompleted =
doneCount +
doneByQualityCount +
doneByQualityLateCount;

return{

managerId:manager._id,
name:manager.name,
email:manager.email,
classroomCount,
totalAssignments,
doneCount,
doneByQualityCount,
doneByQualityLateCount,
totalCompleted

};

})

);

results.sort((a,b)=>{
if(b.classroomCount !== a.classroomCount)
return b.classroomCount - a.classroomCount;

return b.totalAssignments - a.totalAssignments;
});

setData(results);

}
catch(err){

console.error(err);
alert("Failed to load manager workload");

}
finally{

setLoading(false);

}

};

const filtered = useMemo(()=>{

const q = search.trim().toLowerCase();

if(!q) return data;

return data.filter(m=>
m.name?.toLowerCase().includes(q) ||
m.email?.toLowerCase().includes(q)
);

},[search,data]);

return(

<div className="managerWorkloadPage">

<div className="pageHeader">

<div className="headerLeft">

<div className="headerIcon">
<FiBarChart2/>
</div>

<div>

<h2>Manager Workload</h2>

<p>
Overview of manager classroom assignments and completed tasks
</p>

</div>

</div>

</div>


<div className="searchBar">

<FiSearch/>

<input
placeholder="Search manager..."
value={search}
onChange={e=>setSearch(e.target.value)}
/>

</div>


<div className="workloadGrid">

{filtered.map(m => (

<div className="managerCard" key={m.managerId}>

<div className="managerTop">

<div className="managerAvatar">
<FiUser/>
</div>

<div className="managerInfo">

<h3>{m.name}</h3>

<p>
<FiMail/>
<span>{m.email}</span>
</p>

</div>

</div>


<div className="metricsRow">

<div className="metricBox">

<div className="metricIcon">
<FiHome/>
</div>

<div>
<span>{m.classroomCount}</span>
<p>Classrooms</p>
</div>

</div>

<div className="metricBox">

<div className="metricIcon">
<FiBarChart2/>
</div>

<div>
<span>{m.totalAssignments}</span>
<p>Total Assignments</p>
</div>

</div>

<div className="metricBox">

<div className="metricIcon">
<FiCheckCircle/>
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
<FiCheckCircle/>
<span>Done</span>
</div>

<strong>{m.doneCount}</strong>

</div>


<div className="statusItem quality">

<div className="statusTitle">
<FiShield/>
<span>Done by Quality</span>
</div>

<strong>{m.doneByQualityCount}</strong>

</div>


<div className="statusItem late">

<div className="statusTitle">
<FiAlertTriangle/>
<span>Quality Late</span>
</div>

<strong>{m.doneByQualityLateCount}</strong>

</div>

</div>

</div>

))}

</div>


{loading &&

<p className="loading">
Loading workload...
</p>

}

</div>

);

}