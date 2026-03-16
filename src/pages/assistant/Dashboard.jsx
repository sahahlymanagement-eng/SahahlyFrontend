import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import api from "../../api/api";
import "./AssistantDashboard.css";

import {
  FiRefreshCw,
  FiLogOut,
  FiClipboard,
  FiCheckCircle,
  FiAlertTriangle,
  FiSearch,
  FiBarChart2,
  FiClock
} from "react-icons/fi";

const STATUSES = [
  "ASSIGNED",
  "IN_REVIEW",
  "RECHECK_BY_ASSISTANT",
  "IN_REVIEW_AFTER_RECHECK",
  "DONE",
  "DONE_BY_QUALITY",
  "FAILED_DEADLINE",
];

export default function AssistantDashboard() {

const navigate = useNavigate();

const [user,setUser] = useState(null);
const [loading,setLoading] = useState(true);

const [counts,setCounts] = useState(()=>{
const base = {};
STATUSES.forEach(s=>base[s]=0);
base.TOTAL=0;
return base;
});

useEffect(()=>{

const storedUser = localStorage.getItem("user");
const token = localStorage.getItem("token");

if(!storedUser || !token){
navigate("/login",{replace:true});
return;
}

const parsedUser = JSON.parse(storedUser);
const roleName = parsedUser?.roleId?.name?.toLowerCase() || "";

if(roleName !== "assistant"){
navigate("/login",{replace:true});
return;
}

setUser(parsedUser);

},[navigate]);

const loadSummary = async(personId)=>{

try{

setLoading(true);

const res = await api.get("/assignment-workflow/assistant/summary",{
params:{personId}
});

const data = res.data || {};

const safe={};

STATUSES.forEach(s=>{
safe[s] = Number(data[s] || 0);
});

safe.TOTAL = Number(data.TOTAL || 0);

setCounts(safe);

}
catch(err){

toast.error(err.response?.data?.message || "Failed to load dashboard");

}
finally{
setLoading(false);
}

};

useEffect(()=>{
if(!user?.id) return;
loadSummary(user.id);
},[user?.id]);

const logout = ()=>{
localStorage.clear();
navigate("/login",{replace:true});
};

const refresh = ()=>{
if(!user?.id) return;
loadSummary(user.id);
};

if(!user) return null;

return(

<div className="assistantDashPage">

{/* Header */}

<div className="assistantDashHeader">

<div className="assistantDashHeaderLeft">

<div className="assistantDashIcon">
<FiBarChart2/>
</div>

<div>

<h2>Assistant Dashboard</h2>

<p>
Welcome back, <strong>{user.name}</strong>
</p>

</div>

</div>

<div className="assistantDashHeaderActions">

<button
className="assistantDashBtnGhost"
onClick={refresh}
disabled={loading}
>

<FiRefreshCw/>
Refresh

</button>

<button
className="assistantDashBtnLogout"
onClick={logout}
>

<FiLogOut/>
Logout

</button>

</div>

</div>


{/* Summary Cards */}

<div className="assistantDashGrid">

<StatCard icon={<FiClipboard/>} label="Assigned" value={counts.ASSIGNED}/>
<StatCard icon={<FiClock/>} label="In Review" value={counts.IN_REVIEW}/>
<StatCard icon={<FiAlertTriangle/>} label="Recheck Required" value={counts.RECHECK_BY_ASSISTANT}/>
<StatCard icon={<FiSearch/>} label="Review After Recheck" value={counts.IN_REVIEW_AFTER_RECHECK}/>
<StatCard icon={<FiCheckCircle/>} label="Done" value={counts.DONE}/>
<StatCard icon={<FiCheckCircle/>} label="Done by Quality" value={counts.DONE_BY_QUALITY}/>
<StatCard icon={<FiAlertTriangle/>} label="Failed Deadline" value={counts.FAILED_DEADLINE}/>
<StatCard icon={<FiBarChart2/>} label="Total" value={counts.TOTAL}/>

</div>


{/* Quick Actions */}

<div className="assistantDashSectionHeader">

<h3>Quick Actions</h3>

</div>

<div className="assistantDashActions">

<ActionCard
title="View Assignments"
desc="Open your assignment list"
onClick={()=>navigate("/assistant/assignments")}
/>

<ActionCard
title="Performance"
desc="View your delivery statistics"
onClick={()=>toast.info("Coming soon")}
/>

</div>


{loading &&

<div className="assistantDashLoading">
Loading dashboard...
</div>

}

</div>

);

}


/* STAT CARD */

function StatCard({icon,label,value}){

return(

<div className="assistantDashCard">

<div className="assistantDashCardTop">

<div className="assistantDashCardIcon">
{icon}
</div>

<span>{label}</span>

</div>

<div className="assistantDashCardValue">

{value}

</div>

</div>

);

}


/* ACTION CARD */

function ActionCard({title,desc,onClick}){

return(

<button
className="assistantDashActionCard"
onClick={onClick}
>

<div>

<h4>{title}</h4>

<p>{desc}</p>

</div>

<span className="assistantDashArrow">
→
</span>

</button>

);

}