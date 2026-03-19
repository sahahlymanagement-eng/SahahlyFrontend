import { useEffect, useState } from "react";
import api from "../../api/api";
import "./DirectorQualityManagers.css";

export default function DirectorQualityManagers() {

const [classrooms,setClassrooms] = useState([]);
const [people,setPeople] = useState([]);
const [assignments,setAssignments] = useState([]);

const [selectedManagers,setSelectedManagers] = useState({});
const [loading,setLoading] = useState(false);

useEffect(()=>{
loadData();
},[]);

const loadData = async () => {

const [classroomsRes,peopleRes,assignmentsRes] = await Promise.all([
api.get("/classrooms"),
api.get("/people"),
api.get("/classroom-quality-managers")
]);

const rooms = classroomsRes.data || [];
const persons = peopleRes.data || [];
const assigns = assignmentsRes.data || [];

setClassrooms(rooms);
setPeople(persons);
setAssignments(assigns);

const map = {};

assigns.forEach(a=>{
map[a.classroomId?._id] = a.personId?._id;
});

setSelectedManagers(map);

};

const qualityManagers = people.filter(
p => p.roleId?.name?.trim().toLowerCase() === "quality manager"
);

const assignManager = async (classroomId) => {

const personId = selectedManagers[classroomId];
if(!personId) return;

try{
setLoading(true);

await api.post("/classroom-quality-managers",{
personId,
classroomId
});

await loadData();

}catch{
alert("Assignment failed");
}
finally{
setLoading(false);
}

};

const removeManager = async (classroomId) => {

try{
setLoading(true);

await api.delete("/classroom-quality-managers",{
data:{ classroomId }
});

await loadData();

}catch{
alert("Remove failed");
}
finally{
setLoading(false);
}

};

const managerName = (classroomId)=>{

const assignment = assignments.find(
a => a.classroomId?._id === classroomId
);

return assignment?.personId?.name || "None";

};

return(

<div className="director-quality-page">

<h2 className="dq-title">
Assign Quality Managers to Classrooms
</h2>

<div className="dq-table-wrapper">

<table className="dq-table">

<thead>

<tr>
<th>Classroom</th>
<th>Teacher</th>
<th>Current Manager</th>
<th>Assign Manager</th>
<th>Actions</th>
</tr>

</thead>

<tbody>

{classrooms.map(room=>(

<tr key={room._id}>

<td>
{room.name}
{room.section && ` (${room.section})`}
</td>

<td>
{room.teacherName || room.teacherId?.name || "-"}
</td>

<td className="dq-current">
{managerName(room._id)}
</td>

<td>

<select
className="dq-select"
value={selectedManagers[room._id] || ""}
onChange={(e)=>setSelectedManagers(prev=>({
...prev,
[room._id]:e.target.value
}))}
>

<option value="">Select Manager</option>

{qualityManagers.map(m=>(
<option key={m._id} value={m._id}>
{m.name}
</option>
))}

</select>

</td>

<td className="dq-actions">

<button
className="dq-assign-btn"
onClick={()=>assignManager(room._id)}
>
Assign
</button>

<button
className="dq-remove-btn"
onClick={()=>removeManager(room._id)}
>
Remove
</button>

</td>

</tr>

))}

</tbody>

</table>

</div>

{loading && <div className="dq-loading">Processing...</div>}

</div>

);

}