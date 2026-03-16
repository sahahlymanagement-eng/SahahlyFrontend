import { useEffect, useState } from "react";
import api from "../../api/api";
import "./DirectorClassroomManagers.css";

export default function DirectorClassroomManagers() {

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
api.get("/classroom-managers")
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

const managers = people.filter(
p => p.roleId?.name?.trim().toLowerCase() === "manager"
);

const assignManager = async (classroomId) => {

const personId = selectedManagers[classroomId];

if(!personId) return;

try{

setLoading(true);

await api.post("/classroom-managers",{
personId,
classroomId
});

loadData();

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

await api.delete("/classroom-managers",{
data:{ classroomId }
});

loadData();

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

<div className="directorManagersPage">

<h2 className="pageTitle">
Assign Managers to Classrooms
</h2>

<table className="managersTable">

<thead>

<tr>
<th>Classroom</th>
<th>Teacher</th>
<th>Current Manager</th>
<th>Assign Manager</th>
<th>Action</th>
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

<td className="currentManager">
{managerName(room._id)}
</td>

<td>

<select
value={selectedManagers[room._id] || ""}
onChange={(e)=>setSelectedManagers(prev=>({
...prev,
[room._id]:e.target.value
}))}
>

<option value="">
Select Manager
</option>

{managers.map(m=>(
<option key={m._id} value={m._id}>
{m.name}
</option>
))}

</select>

</td>

<td>

<button
className="assignBtn"
onClick={()=>assignManager(room._id)}
>
Assign
</button>

<button
className="removeBtn"
onClick={()=>removeManager(room._id)}
>
Remove
</button>

</td>

</tr>

))}

</tbody>

</table>

{loading && <p className="loading">Processing...</p>}

</div>

);

}