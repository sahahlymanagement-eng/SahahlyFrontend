import { useEffect, useState } from "react";
import api from "../../api/api";
import "./DirectorSubjects.css";

import {
  FiBookOpen,
  FiSearch,
  FiPlus,
  FiSave,
  FiX
} from "react-icons/fi";

export default function DirectorSubjects() {

  const [subjects,setSubjects] = useState([]);
  const [classrooms,setClassrooms] = useState([]);

  const [search,setSearch] = useState({});
  const [selected,setSelected] = useState({});

  const [subjectName,setSubjectName] = useState("");
  const [subjectDesc,setSubjectDesc] = useState("");

  const [loading,setLoading] = useState(false);

  useEffect(()=>{
    loadData();
  },[]);

  const getTeacherName = (classroom)=>{
    if(!classroom?.teacherId) return "No teacher";

    return (
      classroom.teacherId.fullName ||
      classroom.teacherId.name ||
      `${classroom.teacherId.firstName || ""} ${classroom.teacherId.lastName || ""}`.trim() ||
      "No teacher"
    );
  };

  const loadData = async ()=>{

    const [subjectsRes,classroomsRes] = await Promise.all([
      api.get("/subjects"),
      api.get("/classrooms")
    ]);

    const subs = subjectsRes.data || [];
    const rooms = classroomsRes.data || [];

    setSubjects(subs);
    setClassrooms(rooms);

    const map = {};

    subs.forEach(s=>{
      map[s._id] =
      rooms
      .filter(c=>c.subjectId?._id === s._id || c.subjectId === s._id)
      .map(c=>c._id);
    });

    setSelected(map);

  };

  const createSubject = async ()=>{

    if(!subjectName.trim()) return;

    try{

      setLoading(true);

      await api.post("/subjects",{
        name:subjectName,
        description:subjectDesc
      });

      setSubjectName("");
      setSubjectDesc("");

      loadData();

    }
    finally{
      setLoading(false);
    }

  };

  const addClassroom = (subjectId,classroomId)=>{

    setSelected(prev=>{

      const current = prev[subjectId] || [];

      if(current.includes(classroomId)) return prev;

      return {
        ...prev,
        [subjectId]:[...current,classroomId]
      };

    });

  };

  const removeClassroom = (subjectId,classroomId)=>{

    setSelected(prev=>({

      ...prev,
      [subjectId]:prev[subjectId].filter(id=>id !== classroomId)

    }));

  };

  const saveAssignments = async (subjectId)=>{

    try{

      setLoading(true);

      const selectedRooms = selected[subjectId] || [];

      for(const room of classrooms){

        const assigned = room.subjectId?._id === subjectId || room.subjectId === subjectId;
        const shouldAssign = selectedRooms.includes(room._id);

        if(!assigned && shouldAssign){

          await api.patch(
            `/classrooms/${room._id}/assign-subject`,
            {subjectId}
          );

        }

      }

      loadData();

    }
    finally{
      setLoading(false);
    }

  };

  return(

    <div className="directorSubjectsPage">

      <div className="pageHeader">
        <FiBookOpen size={22}/>
        <h2>Subject Management</h2>
      </div>


      <div className="createSubjectCard">

        <input
        placeholder="Subject name"
        value={subjectName}
        onChange={(e)=>setSubjectName(e.target.value)}
        />

        <input
        placeholder="Subject description"
        value={subjectDesc}
        onChange={(e)=>setSubjectDesc(e.target.value)}
        />

        <button onClick={createSubject}>
          <FiPlus/> Create Subject
        </button>

      </div>


      <div className="subjectsGrid">

      {subjects.map(subject=>{

        const assigned = selected[subject._id] || [];

        const filtered =
        classrooms.filter(c=>
          c.name?.toLowerCase().includes(
            (search[subject._id] || "").toLowerCase()
          )
        );

        return(

          <div className="subjectCard" key={subject._id}>

            <div className="subjectHeader">
              <FiBookOpen/>
              <span>{subject.name}</span>
            </div>

            <div className="assignedTags">

            {assigned.map(id=>{

              const room = classrooms.find(c=>c._id === id);
              if(!room) return null;

              return(

                <div
                key={id}
                className="classroomTag"
                onClick={()=>removeClassroom(subject._id,id)}
                >

                {room.name} — {getTeacherName(room)}

                <FiX size={12}/>

                </div>

              );

            })}

            </div>

            <div className="searchBox">

              <FiSearch/>

              <input
              placeholder="Search classroom..."
              value={search[subject._id] || ""}
              onChange={(e)=>setSearch(prev=>({
                ...prev,
                [subject._id]:e.target.value
              }))}
              />

            </div>

            <div className="classroomResults">

            {filtered.map(c=>(

              <div
              key={c._id}
              className="classroomResult"
              onClick={()=>addClassroom(subject._id,c._id)}
              >

              <FiPlus size={14}/>

              <span>
              {c.name}
              </span>

              <small>
              {getTeacherName(c)}
              </small>

              </div>

            ))}

            </div>

            <button
            className="saveBtn"
            onClick={()=>saveAssignments(subject._id)}
            >

              <FiSave/>
              Save Assignments

            </button>

          </div>

        );

      })}

      </div>

      {loading && <p className="loading">Processing...</p>}

    </div>

  );

}