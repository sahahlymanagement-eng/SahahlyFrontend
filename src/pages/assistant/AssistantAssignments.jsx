import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../../api/api";
import "./AssistantAssignments.css";

import {
  FiArrowLeft,
  FiFilter,
  FiSend,
  FiSearch
} from "react-icons/fi";

export default function AssistantAssignments() {

const navigate = useNavigate();

const [user,setUser] = useState(null);
const [assignments,setAssignments] = useState([]);
const [loading,setLoading] = useState(true);

const [statusFilter,setStatusFilter] = useState("ALL");
const [classroomFilter,setClassroomFilter] = useState("ALL");
const [search,setSearch] = useState("");

/* AUTH */

useEffect(()=>{

const storedUser = localStorage.getItem("user");
const token = localStorage.getItem("token");

if(!storedUser || !token){
navigate("/login",{replace:true});
return;
}

const parsed = JSON.parse(storedUser);
const role = parsed?.roleId?.name?.toLowerCase();

if(role !== "assistant"){
navigate("/login",{replace:true});
return;
}

setUser(parsed);

},[navigate]);

/* LOAD */

const loadAssignments = async(personId)=>{

try{

setLoading(true);

const res = await api.get(
"/assignment-workflow/assistant/assignments",
{params:{personId}}
);

// setAssignments(Array.isArray(res.data) ? res.data : []);
const baseAssignments = Array.isArray(res.data) ? res.data : [];

const enriched = await Promise.all(
  baseAssignments.map(async (a) => {
    const done = await getAllStudentsGraded(a._id);

    return {
      ...a,
      allStudentsGraded: done
    };
  })
);

setAssignments(enriched);

}
catch(err){

toast.error(err.response?.data?.message || "Failed to load assignments");

}
finally{

setLoading(false);

}

};

useEffect(()=>{
if(!user?.id) return;
loadAssignments(user.id);
},[user?.id]);

/* SUBMIT */

const submitAssignment = async(id)=>{

try{

await api.post(
`/assignment-workflow/assistant/assignments/${id}/submit`,
{personId:user.id}
);

toast.success("Submitted to Quality Team");

loadAssignments(user.id);

}
catch(err){

toast.error(err.response?.data?.message || "Submit failed");

}

};

/* FILTERED DATA */

const filteredAssignments = useMemo(()=>{

return assignments.filter(a=>{

const teacherName =
a.classroomId?.teacherId?.name || "";

if(statusFilter !== "ALL" && a.assistantStatus !== statusFilter)
return false;

if(classroomFilter !== "ALL" &&
a.classroomId?.name !== classroomFilter)
return false;

if(search){

const s = search.toLowerCase();

return (
a.title?.toLowerCase().includes(s) ||
teacherName.toLowerCase().includes(s) ||
a.classroomId?.name?.toLowerCase().includes(s)
);

}

return true;

});

},[assignments,statusFilter,classroomFilter,search]);

/* UNIQUE CLASSROOMS */

const classrooms = useMemo(()=>{

const set = new Set();

assignments.forEach(a=>{
if(a.classroomId?.name)
set.add(a.classroomId.name);
});

return Array.from(set);

},[assignments]);

if(!user) return null;
const getAllStudentsGraded = async (assignmentId) => {
  try {
    const res = await api.get(
      `/assignment-submissions/${assignmentId}/students`
    );

    const students = res.data.students || [];

    return (
      students.length > 0 &&
      students
        .filter(s => s.submissionId)
        .every(s => s.assignedGrade != null)
    );

  } catch {
    return false;
  }
};
return(

<div className="assistantAssignPage">

{/* HEADER */}

<div className="assistantAssignHeader">

<h2>My Assignments</h2>

<button
className="assistantAssignBack"
onClick={()=>navigate("/assistant/dashboard")}
>
<FiArrowLeft/> Back
</button>

</div>


{/* FILTER BAR */}

<div className="assistantAssignFilters">

  {/* STATUS FILTER */}
  <div className="filterBlock">

    <label>Status</label>

    <div className="customSelect">
      <select
        value={statusFilter}
        onChange={(e)=>setStatusFilter(e.target.value)}
      >
        <option value="ALL">All Status</option>
<option value="ASSIGNED">Assigned</option>
<option value="DONE">Done</option>


      </select>
    </div>

  </div>


  {/* CLASSROOM FILTER */}
  <div className="filterBlock">

    <label>Classroom</label>

    <div className="customSelect">
      <select
        value={classroomFilter}
        onChange={(e)=>setClassroomFilter(e.target.value)}
      >

        <option value="ALL">All Classrooms</option>

        {classrooms.map(c=>(
          <option key={c}>{c}</option>
        ))}

      </select>
    </div>

  </div>


  {/* SEARCH */}
  <div className="searchBox">

    <input
      placeholder="Search assignment..."
      value={search}
      onChange={(e)=>setSearch(e.target.value)}
    />

  </div>

</div>


{/* TABLE */}

<div className="assistantAssignTableWrapper">

<table className="assistantAssignTable">

<thead>

<tr>
<th>Title</th>
<th>Classroom</th>
<th>Teacher</th>
<th>Your Deadline</th>
<th>Due Date</th>
<th>Status</th>
<th>Action</th>
</tr>

</thead>

<tbody>

{loading && (
<tr>
<td colSpan="7" className="loadingRow">
Loading assignments...
</td>
</tr>
)}

{!loading && filteredAssignments.length === 0 && (
<tr>
<td colSpan="7" className="emptyRow">
No assignments found
</td>
</tr>
)}

{filteredAssignments.map(a=>{

const teacher =
a.classroomId?.teacherName ||
a.classroomId?.teacherId?.name ||
"-";

return(

<tr key={a._id}>

<td>{a.title}</td>

<td>{a.classroomId?.name || "-"}</td>

<td>{teacher}</td>

<td>
{a.assistantDeadline
? new Date(a.assistantDeadline).toLocaleString()
: "-"}
</td>

<td>
{a.dueDate
? new Date(a.dueDate).toLocaleString()
: "-"}
</td>

<td>

<span
  className={`statusBadge ${
    a.allStudentsGraded ? "status-DONE" : "status-ASSIGNED"
  }`}
>
  {a.allStudentsGraded ? "DONE" : "ASSIGNED"}
</span>

</td>

<td>

{(a.assistantStatus === "ASSIGNED" ||
a.assistantStatus === "RECHECK_BY_ASSISTANT") && (

  <button
  className="submitBtn"
  onClick={() => navigate(`/assistant/assignments/${a._id}`)}
>
  <FiSend />
  Open
</button>

)}

</td>

</tr>

);

})}

</tbody>

</table>

</div>

</div>

);

}