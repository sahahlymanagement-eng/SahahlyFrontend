import { useEffect, useState } from "react";
import api from "../../api/api";
import "./DirectorPeople.css";

import {
  FiUsers,
  FiUserPlus,
  FiMail,
  FiPhone,
  FiSave
} from "react-icons/fi";

export default function DirectorPeople() {

  const [people,setPeople] = useState([]);
  const [roles,setRoles] = useState([]);
  const [subjects,setSubjects] = useState([]);

  const [name,setName] = useState("");
  const [email,setEmail] = useState("");
  const [phone,setPhone] = useState("");

  const [roleSubjectMap,setRoleSubjectMap] = useState({});
  const [selectedSubjects,setSelectedSubjects] = useState({});

  const [loading,setLoading] = useState(false);

  useEffect(()=>{
    loadInitialData();
  },[]);

  const loadInitialData = async ()=>{

    const [rolesRes,subjectsRes,peopleRes] = await Promise.all([
      api.get("/roles"),
      api.get("/subjects?active=true"),
      api.get("/people")
    ]);

    setRoles(rolesRes.data || []);
    setSubjects(subjectsRes.data || []);

    const list = peopleRes.data || [];
    setPeople(list);

    list.forEach(p=>loadRoleSubjects(p._id));

  };

  const loadRoleSubjects = async (personId)=>{

    const res = await api.get(
      `/role-subject-assignments?personId=${personId}`
    );

    const assignments = res.data || [];

    setRoleSubjectMap(prev=>({
      ...prev,
      [personId]:assignments
    }));

    setSelectedSubjects(prev=>({
      ...prev,
      [personId]:assignments.map(a=>a.subjectId?._id)
    }));

  };

  const roleNameById = (roleId)=>{
    if(!roleId) return "None";
    if(typeof roleId === "object") return roleId.name;
    return roles.find(r=>r._id === roleId)?.name || "None";
  };

  const roleNameLower = (roleId)=>{
    if(!roleId) return "";
    if(typeof roleId === "object") return roleId.name.toLowerCase();
    return roleNameById(roleId).toLowerCase();
  };

  const supportsSubjects = (roleId)=>
    ["assistant","quality team"].includes(roleNameLower(roleId));

  const createPerson = async ()=>{

    if(!name || !email || !phone){
      alert("All fields required");
      return;
    }

    try{

      setLoading(true);

      await api.post("/people",{name,email,phone});

      setName("");
      setEmail("");
      setPhone("");

      await loadInitialData();

    }finally{
      setLoading(false);
    }

  };

  const assignRole = async (personId,roleId)=>{

    try{

      setLoading(true);

      await api.patch(`/people/${personId}/assign-role`,{roleId});

      await loadInitialData();

    }finally{
      setLoading(false);
    }

  };

  const toggleSubject = (personId,subjectId)=>{

    setSelectedSubjects(prev=>{

      const current = prev[personId] || [];

      if(current.includes(subjectId)){
        return {
          ...prev,
          [personId]:current.filter(id=>id !== subjectId)
        };
      }

      return {
        ...prev,
        [personId]:[...current,subjectId]
      };

    });

  };

  const saveSubjects = async (personId)=>{

    try{

      setLoading(true);

      const existing =
        roleSubjectMap[personId]?.map(a=>a.subjectId._id) || [];

      const selected =
        selectedSubjects[personId] || [];

      const toAdd = selected.filter(id=>!existing.includes(id));
      const toRemove = existing.filter(id=>!selected.includes(id));

      for(const subjectId of toAdd){
        await api.post("/role-subject-assignments",{personId,subjectId});
      }

      for(const subjectId of toRemove){
        await api.delete("/role-subject-assignments",{data:{personId,subjectId}});
      }

      await loadRoleSubjects(personId);

    }finally{
      setLoading(false);
    }

  };

  return(

    <div className="directorPeoplePage">

      <div className="pageHeader">
        <FiUsers/>
        <h2>People Management</h2>
      </div>

      {/* ADD PERSON */}

      <div className="addPersonCard">

        <input
          placeholder="Name"
          value={name}
          onChange={(e)=>setName(e.target.value)}
        />

        <input
          placeholder="Email"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
        />

        <input
          placeholder="Phone"
          value={phone}
          onChange={(e)=>setPhone(e.target.value)}
        />

        <button onClick={createPerson}>
          <FiUserPlus/>
          Add Person
        </button>

      </div>


      {/* PEOPLE GRID */}

      <div className="peopleGrid">

      {people.map(p=>{

        const role = roleNameById(p.roleId);
        const supports = supportsSubjects(p.roleId);
        const assignments = roleSubjectMap[p._id] || [];
        const selected = selectedSubjects[p._id] || [];

        return(

          <div className="personCard" key={p._id}>

            <div className="personHeader">

              <div>
                <h3>{p.name}</h3>

                <div className="personMeta">

                  <span>
                    <FiMail/> {p.email}
                  </span>

                  <span>
                    <FiPhone/> {p.phone}
                  </span>

                </div>

              </div>

              <div className="roleBox">

                <label>Role</label>

                <select
                  value={p.roleId?._id || ""}
                  onChange={(e)=>assignRole(p._id,e.target.value)}
                >

                  <option value="">Select role</option>

                  {roles.map(r=>(
                    <option key={r._id} value={r._id}>
                      {r.name}
                    </option>
                  ))}

                </select>

              </div>

            </div>


            {supports && (

              <div className="subjectsPanel">

                <div className="assignedSubjects">

                  {assignments.map(a=>(
                    <span className="subjectTag" key={a._id}>
                      {a.subjectId?.name}
                    </span>
                  ))}

                </div>

                <div className="subjectsSelector">

                  {subjects.map(s=>{

                    const checked = selected.includes(s._id);

                    return(

                      <label
                        key={s._id}
                        className={`subjectItem ${checked ? "active" : ""}`}
                      >

                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={()=>toggleSubject(p._id,s._id)}
                        />

                        {s.name}

                      </label>

                    );

                  })}

                </div>

                <button
                  className="saveSubjectsBtn"
                  onClick={()=>saveSubjects(p._id)}
                >
                  <FiSave/>
                  Save Subjects
                </button>

              </div>

            )}

          </div>

        );

      })}

      </div>

      {loading && <p className="loading">Processing...</p>}

    </div>

  );

}