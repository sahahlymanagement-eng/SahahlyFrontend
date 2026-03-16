import { useEffect, useState } from "react";
import api from "../api/api";
import "./TeacherManager.css";

export default function TeacherManager(){

    const [teachers,setTeachers] = useState([]);
    const [editingId,setEditingId] = useState(null);

    const [form,setForm] = useState({
        name:"",
        phone:"",
        email:""
    });

    const loadTeachers = async () => {

        const res = await api.get("/teachers");
        setTeachers(res.data);
    };

    useEffect(()=>{
        loadTeachers();
    },[]);

    const handleChange = (e)=>{
        setForm({
            ...form,
            [e.target.name]:e.target.value
        });
    };

    const createTeacher = async () => {

        if(!form.name || !form.phone) return;

        await api.post("/teachers",form);

        setForm({
            name:"",
            phone:"",
            email:""
        });

        loadTeachers();
    };

    const deleteTeacher = async (id) => {

        if(!window.confirm("Delete this teacher?")) return;

        await api.delete(`/teachers/${id}`);

        loadTeachers();
    };

    const startEdit = (teacher) => {

        setEditingId(teacher._id);

        setForm({
            name:teacher.name,
            phone:teacher.phone,
            email:teacher.email || ""
        });
    };

    const updateTeacher = async () => {

        await api.put(`/teachers/${editingId}`,form);

        setEditingId(null);

        setForm({
            name:"",
            phone:"",
            email:""
        });

        loadTeachers();
    };

    const cancelEdit = () =>{
        setEditingId(null);
        setForm({
            name:"",
            phone:"",
            email:""
        });
    };

    return(

        <div className="teacherPage">

            <h2>Create Teacher</h2>

            <div className="teacherForm">

                <input
                name="name"
                placeholder="Teacher Name"
                value={form.name}
                onChange={handleChange}
                />

                <input
                name="phone"
                placeholder="Phone Number"
                value={form.phone}
                onChange={handleChange}
                />

                <input
                name="email"
                placeholder="Email (optional)"
                value={form.email}
                onChange={handleChange}
                />

                {editingId ? (
                    <>
                    <button className="saveBtn" onClick={updateTeacher}>
                        Update
                    </button>

                    <button className="cancelBtn" onClick={cancelEdit}>
                        Cancel
                    </button>
                    </>
                ) : (
                    <button className="saveBtn" onClick={createTeacher}>
                        Save Teacher
                    </button>
                )}

            </div>


            <h2>Teachers List</h2>

            <table className="teacherTable">

                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Phone</th>
                        <th>Email</th>
                        <th>Actions</th>
                    </tr>
                </thead>

                <tbody>

                {teachers.map(t=>(
                    <tr key={t._id}>

                        <td>{t.name}</td>
                        <td>{t.phone}</td>
                        <td>{t.email || "-"}</td>

                        <td className="actions">

                            <button
                            className="editBtn"
                            onClick={()=>startEdit(t)}
                            >
                                Edit
                            </button>

                            <button
                            className="deleteBtn"
                            onClick={()=>deleteTeacher(t._id)}
                            >
                                Delete
                            </button>

                        </td>

                    </tr>
                ))}

                </tbody>

            </table>

        </div>
    );
}