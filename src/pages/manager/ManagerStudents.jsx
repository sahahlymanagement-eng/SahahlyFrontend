import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import "./ManagerStudents.css";
import {
  FiHome, FiUsers, FiSearch, FiX, FiEdit2,
  FiCheck, FiChevronRight, FiLogOut, FiMenu,
  FiPhone, FiMail, FiUser, FiRefreshCw,
  FiChevronLeft, FiChevronDown,FiClipboard
} from "react-icons/fi";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";

export default function ManagerStudents() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [classrooms, setClassrooms] = useState([]);
  const [selectedClassroom, setSelectedClassroom] = useState(null);
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [classroomSearch, setClassroomSearch] = useState("");
  const PAGE_SIZE = 12;

  /* AUTH */
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!storedUser || !token) { navigate("/login", { replace: true }); return; }
    const parsed = JSON.parse(storedUser);
    const role = parsed?.roleId?.name?.toLowerCase();
    if (role !== "manager" && role !== "quality manager") {
      navigate("/login", { replace: true }); return;
    }
    setUser(parsed);
  }, [navigate]);

  /* LOAD CLASSROOMS */
  useEffect(() => {
    if (!user?.id) return;
    api.get(`/students/my-classrooms?personId=${user.id}`)
      .then(res => setClassrooms(res.data || []))
      .catch(() => toast.error("Failed to load classrooms"));
  }, [user?.id]);

  /* SELECT CLASSROOM */
  const selectClassroom = async (classroom) => {
    setSelectedClassroom(classroom);
    setStudents([]);
    setEditingId(null);
    setSearch("");
    setPage(1);
    setSyncing(true);
    try {
      await api.post(`/students/sync/${classroom._id}`);
    } catch {
      toast.warn("Sync failed, showing existing data");
    } finally {
      setSyncing(false);
    }
    setLoadingStudents(true);
    try {
      const res = await api.get(`/students/classroom/${classroom._id}`);
      setStudents(res.data || []);
    } catch {
      toast.error("Failed to load students");
    } finally {
      setLoadingStudents(false);
    }
  };

  /* SORT */
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
    setPage(1);
  };
  
  const filteredClassrooms = useMemo(() => {
    const q = classroomSearch.toLowerCase();

    return classrooms.filter((c) =>
        !q ||
        (c.name || "").toLowerCase().includes(q) ||
        (c.section || "").toLowerCase().includes(q)
    );
    }, [classrooms, classroomSearch]);



  /* FILTER + SORT + PAGINATE */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return students
      .filter(s =>
        !q ||
        (s.name || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (s.phone || "").toLowerCase().includes(q) ||
        (s.parentName || "").toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const av = (a[sortKey] || "").toLowerCase();
        const bv = (b[sortKey] || "").toLowerCase();
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      });
  }, [students, search, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  /* EDIT */
  const startEdit = (student) => {
    setEditingId(student._id);
    setEditForm({
        name: student.name || "",
        email: student.email || "",
        phone: student.phone ? `+${student.phone}` : "",
        parentName: student.parentName || "",
        parentPhone: student.parentPhone ? `+${student.parentPhone}` : "",
    });
  };

  const saveEdit = async (studentId) => {
    try {
        const payload = {
        ...editForm,
        phone: editForm.phone?.replace(/\D/g, ""),
        parentPhone: editForm.parentPhone?.replace(/\D/g, ""),
        };

        const res = await api.put(`/students/${studentId}`, payload);      setStudents(prev => prev.map(s => s._id === studentId ? res.data : s));
      setEditingId(null);
      toast.success("Student updated");
    } catch {
      toast.error("Failed to update student");
    }
  };

  const cancelEdit = () => setEditingId(null);

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/login", { replace: true });
  };

  if (!user) return null;

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <FiChevronDown size={11} style={{ opacity: 0.3 }} />;
    return <FiChevronDown size={11} style={{ transform: sortDir === "asc" ? "rotate(180deg)" : "none", color: "#93c5fd", transition: "transform 0.2s" }} />;
  };

  const navItems = [
    { icon: <FiHome />, label: "Dashboard", path: "/manager/dashboard",  },
    { icon: <FiUsers />, label: "Students", path: "/manager/students", active: true },
    { icon: <FiClipboard />, label: "Assignments / Reports", path: "/manager/assignments" },
    
  ];


  return (
    <>

      <div className="ms-root">

        {/* SIDEBAR */}
        <aside className={`ms-sidebar ${sidebarCollapsed ? "ms-sidebar--collapsed" : ""}`}>
          <div className="ms-sidebar-top">
            <div className="ms-sidebar-brand">
              {!sidebarCollapsed && <span className="ms-brand-text">Manager</span>}
              <button className="ms-sidebar-toggle" onClick={() => setSidebarCollapsed(v => !v)}>
                {sidebarCollapsed ? <FiMenu size={18} /> : <FiX size={18} />}
              </button>
            </div>
            {!sidebarCollapsed && (
              <div className="ms-user-card">
                <div className="ms-user-avatar">{user.name?.charAt(0).toUpperCase()}</div>
                <div className="ms-user-info">
                  <span className="ms-user-name">{user.name}</span>
                  <span className="ms-user-role">Manager</span>
                </div>
              </div>
            )}
            {sidebarCollapsed && (
              <div className="ms-user-avatar ms-user-avatar--solo">{user.name?.charAt(0).toUpperCase()}</div>
            )}
          </div>

          <nav className="ms-sidebar-nav">
            {navItems.map(item => (
              <div
                key={item.label}
                className={`ms-nav-item ${item.active ? "ms-nav-item--active" : ""}`}
                onClick={() => item.path && navigate(item.path)}
              >
                <span className="ms-nav-icon">{item.icon}</span>
                {!sidebarCollapsed && <span className="ms-nav-label">{item.label}</span>}
                {!sidebarCollapsed && item.active && <FiChevronRight className="ms-nav-arrow" size={14} />}
              </div>
            ))}
          </nav>

          <div className="ms-sidebar-bottom">
            <button className="ms-logout-btn" onClick={handleLogout}>
              <FiLogOut size={16} />
              {!sidebarCollapsed && <span>Logout</span>}
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <main className="ms-main">

          {/* TOPBAR */}
          <header className="ms-topbar">
            <div className="ms-topbar-left">
              <h1 className="ms-topbar-title">Students</h1>
              <span className="ms-topbar-sub">
                {selectedClassroom
                  ? `Viewing ${selectedClassroom.name}`
                  : `Welcome back, ${user.name}`}
              </span>
            </div>
            <div className="ms-topbar-right">
              <div className="ms-total-pill">
                <FiUsers size={13} />
                <span>{students.length} students</span>
              </div>
            </div>
          </header>

          <div className="ms-content">
            <div className="ms-layout">

                {/* LEFT PANEL */}
                <div className="ms-left-panel">
                <p className="ms-section-label">Select Classroom</p>

                <div className="ms-classroom-search-wrap">
                    <FiSearch className="ms-search-icon" size={13} />
                    <input
                        className="ms-search-input"
                        placeholder="Search classroom..."
                        value={classroomSearch}
                        onChange={(e) => setClassroomSearch(e.target.value)}
                    />
                    {classroomSearch && (
                        <button
                        className="ms-search-clear"
                        onClick={() => setClassroomSearch("")}
                        >
                        <FiX size={13} />
                        </button>
                    )}
                    </div>

                    <div className="ms-classroom-grid">
                    {filteredClassrooms.map((c) => (
                        <div
                        key={c._id}
                        className={`ms-classroom-card ${
                            selectedClassroom?._id === c._id
                            ? "ms-classroom-card--active"
                            : ""
                        }`}
                        onClick={() => selectClassroom(c)}
                        >
                        <div className="ms-classroom-icon">
                            <FiUsers size={16} />
                        </div>

                        <div className="ms-classroom-name">{c.name}</div>

                        {c.section && (
                            <div className="ms-classroom-section">
                            {c.section}
                            </div>
                        )}
                        </div>
                    ))}

                    {filteredClassrooms.length === 0 && (
                        <div className="ms-empty-state">
                        <p>No classrooms found</p>
                        </div>
                    )}
                    </div>
                </div>

                {/* RIGHT PANEL */}
                <div className="ms-right-panel">
                {!selectedClassroom ? (
                    <div className="ms-empty-state">
                    <FiUsers size={40} />
                    <p>Select a classroom to view students</p>
                    </div>
                ) : (
                    <div className="ms-panel">

                    <div className="ms-panel-header">
                        <div className="ms-panel-title-wrap">
                        <div className="ms-panel-dot" />
                        <h2 className="ms-panel-title">
                            {selectedClassroom.name}
                        </h2>
                        <span className="ms-panel-count">
                            {filtered.length} students
                        </span>
                        </div>
                    </div>

                    {/* SEARCH */}
                    <div className="ms-toolbar">
                        <div className="ms-search-wrap">
                        <FiSearch className="ms-search-icon" size={13} />
                        <input
                            className="ms-search-input"
                            placeholder="Search student..."
                            value={search}
                            onChange={(e) => {
                            setSearch(e.target.value);
                            setPage(1);
                            }}
                        />
                        </div>
                    </div>

                    {/* KEEP YOUR EXISTING TABLE HERE */}
                    <div className="ms-table-wrap">
                        <div className="ms-table-scroll">
                      <table className="ms-table">
                        <thead>
                          <tr>
                            <th>#</th>
                            <th><button className="ms-th-btn" onClick={() => toggleSort("name")}>Name <SortIcon col="name" /></button></th>
                            <th><button className="ms-th-btn" onClick={() => toggleSort("email")}>Email <SortIcon col="email" /></button></th>
                            <th>Phone</th>
                            <th><button className="ms-th-btn" onClick={() => toggleSort("parentName")}>Parent Name <SortIcon col="parentName" /></button></th>
                            <th>Parent Phone</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((s, i) => {                            
                            const isEditing = editingId === s._id;
                            const globalIndex = (page - 1) * PAGE_SIZE + i + 1;
                            return (
                              <tr key={s._id} className={`ms-row ${isEditing ? "ms-row--editing" : ""}`} style={{ animationDelay: `${i * 0.03}s` }}>
                                <td><span className="ms-num">{globalIndex}</span></td>

                                {isEditing ? (
                                  <>
                                    <td><input className="ms-edit-input" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} placeholder="Name" /></td>
                                    <td><input className="ms-edit-input" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" /></td>
                                    <td>
                                    <PhoneInput
                                        defaultCountry="eg"
                                        value={editForm.phone}
                                        onChange={(value) =>
                                        setEditForm((p) => ({
                                            ...p,
                                            phone: value
                                        }))
                                        }
                                        className="ms-phone-input"
                                    />
                                    </td>
                                    <td><input className="ms-edit-input" value={editForm.parentName} onChange={e => setEditForm(p => ({ ...p, parentName: e.target.value }))} placeholder="Parent Name" /></td>
                                    <td>
                                        <PhoneInput
                                            defaultCountry="eg"
                                            value={editForm.parentPhone}
                                            onChange={(value) =>
                                            setEditForm((p) => ({
                                                ...p,
                                                parentPhone: value
                                            }))
                                            }
                                            className="ms-phone-input"
                                        />
                                        </td>
                                    <td>
                                      <div className="ms-action-wrap">
                                        <button className="ms-save-btn" onClick={() => saveEdit(s._id)}><FiCheck size={12} /> Save</button>
                                        <button className="ms-cancel-btn" onClick={cancelEdit}><FiX size={12} /> Cancel</button>
                                      </div>
                                    </td>
                                  </>
                                ) : (
                                  <>
                                    <td>
                                      <div className="ms-avatar-cell">
                                        <div className="ms-avatar">{(s.name || s.email || "?").charAt(0).toUpperCase()}</div>
                                        <span className="ms-cell-name">{s.name || <span className="ms-cell-empty">—</span>}</span>
                                      </div>
                                    </td>
                                    <td>
                                      {s.email
                                        ? <span className="ms-icon-cell"><FiMail size={12} />{s.email}</span>
                                        : <span className="ms-cell-empty">—</span>}
                                    </td>
                                    <td>
                                      {s.phone
                                        ? <span className="ms-icon-cell"><FiPhone size={12} />{s.phone}</span>
                                        : <span className="ms-cell-empty">—</span>}
                                    </td>
                                    <td>
                                      {s.parentName
                                        ? <span className="ms-icon-cell"><FiUser size={12} />{s.parentName}</span>
                                        : <span className="ms-cell-empty">—</span>}
                                    </td>
                                    <td>
                                      {s.parentPhone
                                        ? <span className="ms-icon-cell"><FiPhone size={12} />{s.parentPhone}</span>
                                        : <span className="ms-cell-empty">—</span>}
                                    </td>
                                    <td>
                                      <div className="ms-action-wrap">
                                        <button className="ms-edit-btn" onClick={() => startEdit(s)}><FiEdit2 size={11} /> Edit</button>
                                      </div>
                                    </td>
                                  </>
                                )}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    </div>

                    </div>
                )}
                </div>

            </div>
            </div>
        </main>
      </div>
    </>
  );
}