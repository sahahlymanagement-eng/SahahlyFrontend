import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../api/api";
import { toast } from "react-toastify";
import "./ManagerStudents.css";
import {
  FiHome, FiUsers, FiSearch, FiX, FiEdit2, FiTrash2,
  FiCheck, FiChevronRight, FiLogOut, FiMenu,
  FiPhone, FiMail, FiUser, FiRefreshCw,
  FiChevronLeft, FiChevronDown,FiClipboard
} from "react-icons/fi";
import { PhoneInput } from "react-international-phone";
import "react-international-phone/style.css";

import { usePagination } from "../../hooks/usePagination";
import { clearSession } from "../../utils/session";
import usePersistedState from "../../hooks/usePersistedState";
import Pagination from "../../components/Pagination";
import ReportTeacherFilterSelect from "../../components/ReportTeacherFilterSelect";
import {
  useClassroomTeacherFilter,
  useReportTeacherOptions,
  useClearClassroomOnTeacherFilter,
} from "../../hooks/useReportTeacherFilter";
import { useClassroomRosterSync } from "../../hooks/useClassroomRosterSync";
import { confirmToast } from "../../utils/confirmToast";
import {
  formatPhoneForInput,
  phoneFieldForSave,
  stripPhoneDigits,
} from "../../utils/phoneInputFormat";

export default function ManagerStudents({ scope = "manager" }) {
  const navigate = useNavigate();
  const isTeacherScope = scope === "teacher";
  const [user, setUser] = useState(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedClassroom, setSelectedClassroom] = usePersistedState(
    `students:${scope}:classroom`,
    null
  );
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editBaseline, setEditBaseline] = useState({});
  const editingIdRef = useRef(null);
  const pageRef = useRef(1);
  editingIdRef.current = editingId;
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [classroomSearch, setClassroomSearch] = useState("");

  /* AUTH */
  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    const token = localStorage.getItem("token");
    if (!storedUser || !token) { navigate("/login", { replace: true }); return; }
    const parsed = JSON.parse(storedUser);
    const role = parsed?.roleId?.name?.toLowerCase();
    const allowed = isTeacherScope
      ? role === "teacher"
      : role === "manager" || role === "quality manager";
    if (!allowed) {
      navigate("/login", { replace: true }); return;
    }
    setUser(parsed);
  }, [navigate, isTeacherScope]);

  const {
    teacherFilter,
    setTeacherFilter,
    allTeachers,
    classroomParams,
    showTeacherFilter,
  } = useClassroomTeacherFilter({
    isTeacher: isTeacherScope,
    userId: user?.id,
    classroomSearch,
  });

  const {
    data: classrooms,
    page: classroomPage,
    totalPages: classroomTotalPages,
    fetchPage: fetchClassroomPage,
  } = usePagination("/students/my-classrooms", classroomParams, 20, "data", !!user?.id);

  const teacherOptions = useReportTeacherOptions(false, allTeachers, classrooms);

  const clearClassroomSelection = useCallback(() => {
    setSelectedClassroom(null);
    setEditingId(null);
    setSearch("");
  }, []);

  useClearClassroomOnTeacherFilter(teacherFilter, selectedClassroom, clearClassroomSelection);

  const studentParams = useMemo(() => ({
    search,
    sortKey,
    sortDir,
  }), [search, sortKey, sortDir]);

  const {
    data: students,
    page,
    totalPages,
    total,
    loading: loadingStudents,
    fetchPage,
    setData: setStudents,
  } = usePagination(
    selectedClassroom ? `/students/classroom/${selectedClassroom._id}` : "/students/classroom/_",
    studentParams,
    12,
    "data",
    !!selectedClassroom?._id
  );

  pageRef.current = page;

  const { syncRoster, syncing } = useClassroomRosterSync(selectedClassroom?._id, {
    enabled: Boolean(selectedClassroom?._id),
    autoSync: Boolean(selectedClassroom?._id),
    onSynced: () => {
      if (!editingIdRef.current) fetchPage(pageRef.current);
    },
  });

  /* SELECT CLASSROOM */
  const selectClassroom = async (classroom) => {
    setSelectedClassroom(classroom);
    setEditingId(null);
    setSearch("");
  };

  const refreshStudents = async () => {
    if (!selectedClassroom?._id) return;
    const result = await syncRoster({ force: true });
    await fetchPage(page);
    if (result) {
      const removedNote =
        result.removed > 0 ? ` · ${result.removed} removed from class` : "";
      toast.success(`Students refreshed (${result.total} on Google Classroom${removedNote})`);
    } else {
      toast.warn("Could not refresh from Google Classroom — showing saved list");
    }
  };

  const expandClassroomSection = () => {
    setSelectedClassroom(null);
    setEditingId(null);
    setSearch("");
  };

  /* SORT */
  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  /* EDIT */
  const startEdit = (student) => {
    const baseline = {
      name: student.name || "",
      email: student.email || "",
      phone: stripPhoneDigits(student.phone),
      parentName: student.parentName || "",
      parentPhone: stripPhoneDigits(student.parentPhone),
    };
    setEditingId(student._id);
    setEditBaseline(baseline);
    setEditForm(baseline);
  };

  const saveEdit = async (studentId) => {
    try {
      const phone = phoneFieldForSave(editForm.phone, {
        hadValue: Boolean(editBaseline.phone),
      });
      const parentPhone = phoneFieldForSave(editForm.parentPhone, {
        hadValue: Boolean(editBaseline.parentPhone),
      });

      const payload = {
        name: editForm.name,
        email: editForm.email,
        parentName: editForm.parentName,
        classroomId: selectedClassroom?._id,
      };
      if (phone !== undefined) payload.phone = phone;
      if (parentPhone !== undefined) payload.parentPhone = parentPhone;

      const res = await api.put(`/students/${studentId}`, payload);
      setEditingId(null);
      setEditBaseline({});
      setStudents((prev) =>
        prev.map((s) =>
          String(s._id) === String(studentId) ? res.data : s
        )
      );
      await fetchPage(pageRef.current);
      toast.success("Student updated");
    } catch {
      toast.error("Failed to update student");
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditBaseline({});
  };

  const deleteStudent = async (student) => {
    if (!selectedClassroom?._id || deletingId) return;

    const name = (student.name || student.email || "this student").trim();
    const confirmed = await confirmToast(
      `Permanently remove ${name} from ${selectedClassroom.name}?\n\nThis deletes their marking results, submissions, attendance, and report history for this class. If they are not in any other class, their student record is removed entirely.\n\nNote: they may reappear if still on the Google Classroom roster — use Refresh students after removing them there too.`,
      {
        title: "Delete student",
        confirmLabel: "Delete permanently",
        cancelLabel: "Cancel",
        danger: true,
      }
    );
    if (!confirmed) return;

    setDeletingId(student._id);
    try {
      const { data } = await api.delete(`/students/${student._id}`, {
        params: {
          classroomId: selectedClassroom._id,
          personId: user?.id,
        },
      });
      setStudents((prev) => prev.filter((s) => s._id !== student._id));
      if (editingId === student._id) setEditingId(null);
      await fetchPage(page);
      toast.success(data.message || "Student removed");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to delete student");
    } finally {
      setDeletingId(null);
    }
  };

  const handleLogout = () => {
    clearSession();
    navigate("/login", { replace: true });
  };

  if (!user) return null;

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <FiChevronDown size={11} style={{ opacity: 0.3 }} />;
    return <FiChevronDown size={11} style={{ transform: sortDir === "asc" ? "rotate(180deg)" : "none", color: "var(--primary)", transition: "transform 0.2s" }} />;
  };

  const navItems = [
    { icon: <FiHome />, label: "Dashboard", path: "/manager/dashboard",  },
    { icon: <FiUsers />, label: "Students", path: "/manager/students", active: true },
    { icon: <FiClipboard />, label: "Assignments / Reports", path: "/manager/assignments" },
    
  ];


  return (
    <>

      <div className="ms-root">

        {/* MAIN */}
        <main className="ms-main">

          {/* TOPBAR */}
          <header className="ms-topbar">
            <div className="ms-topbar-left">
              <h1 className="ms-topbar-title">Students</h1>
              <span className="ms-topbar-sub">
                {selectedClassroom
                  ? `Viewing ${selectedClassroom.name} — contact numbers are saved per teacher/class`
                  : isTeacherScope
                    ? `Your classes only — welcome back, ${user.name}`
                    : `Welcome back, ${user.name}`}
              </span>
            </div>
            <div className="ms-topbar-right">
              <div className="ms-total-pill">
                <FiUsers size={13} />
                <span>{total} students</span>
              </div>
            </div>
          </header>

          <div className="ms-content">
            <div className="ms-layout msv-collapsible-layout">

                {/* CLASSROOM */}
                {!selectedClassroom ? (
                <div className="ms-left-panel">
                <p className="ms-section-label msv-section-header-expanded">▼ Select Classroom</p>

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

                    <ReportTeacherFilterSelect
                      show={showTeacherFilter}
                      value={teacherFilter}
                      onChange={setTeacherFilter}
                      teachers={teacherOptions}
                      className="ms-search-input ms-teacher-filter"
                    />

                    <div className="ms-classroom-grid">
                    {classrooms.map((c) => (
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
                        {!isTeacherScope && c.teacherId?.name && (
                            <div className="ms-classroom-teacher">Teacher: {c.teacherId.name}</div>
                        )}
                        </div>
                    ))}

                    {classrooms.length === 0 && (
                        <div className="ms-empty-state">
                        <p>No classrooms found</p>
                        </div>
                    )}
                    </div>
                    <Pagination page={classroomPage} totalPages={classroomTotalPages} onPageChange={fetchClassroomPage} />
                </div>
                ) : (
                  <div
                    className="msv-section-collapsed"
                    onClick={expandClassroomSection}
                    onKeyDown={(e) => e.key === "Enter" && expandClassroomSection()}
                    role="button"
                    tabIndex={0}
                  >
                    <span className="msv-section-collapsed-chevron">▶</span>
                    <span className="msv-section-collapsed-text">Classroom: {selectedClassroom.name}</span>
                    <button
                      type="button"
                      className="msv-section-change"
                      onClick={(e) => { e.stopPropagation(); expandClassroomSection(); }}
                    >
                      [change]
                    </button>
                  </div>
                )}

                {/* STUDENTS */}
                {selectedClassroom && (
                <div className="ms-right-panel msv-right-panel-full">
                    <div className="ms-panel">

                    <div className="ms-panel-header">
                        <div className="ms-panel-title-wrap">
                        <div className="ms-panel-dot" />
                        <h2 className="ms-panel-title">
                            {selectedClassroom.name}
                        </h2>
                        <span className="ms-panel-count">
                            {total} students
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
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        </div>
                        <button
                          type="button"
                          className="ma-send-btn"
                          onClick={refreshStudents}
                          disabled={syncing || loadingStudents}
                          title="Pull latest roster from Google Classroom and remove students who left the class"
                        >
                          <FiRefreshCw className={syncing ? "ms-spin" : ""} />
                          {syncing ? "Refreshing…" : "Refresh students"}
                        </button>
                    </div>

                    {/* KEEP YOUR EXISTING TABLE HERE */}
                    <div className="ms-table-wrap">
                        <div className="ms-table-scroll">
                      <table className="ms-table sah-table--cards">
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
                          {loadingStudents || syncing ? (
                            <tr><td colSpan={7}>Loading…</td></tr>
                          ) : students.map((s, i) => {                            
                            const isEditing = editingId === s._id;
                            const globalIndex = (page - 1) * 12 + i + 1;
                            return (
                              <tr key={s._id} className={`ms-row ${isEditing ? "ms-row--editing" : ""}`} style={{ animationDelay: `${i * 0.03}s` }}>
                                <td data-label="#"><span className="ms-num">{globalIndex}</span></td>

                                {isEditing ? (
                                  <>
                                    <td data-label="Name"><input className="ms-edit-input" value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))} placeholder="Name" /></td>
                                    <td data-label="Email"><input className="ms-edit-input" value={editForm.email} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} placeholder="Email" /></td>
                                    <td data-label="Phone">
                                    <PhoneInput
                                        defaultCountry="eg"
                                        value={formatPhoneForInput(editForm.phone)}
                                        onChange={(value) =>
                                        setEditForm((p) => ({
                                            ...p,
                                            phone: stripPhoneDigits(value),
                                        }))
                                        }
                                        className="ms-phone-input"
                                    />
                                    </td>
                                    <td data-label="Parent Name"><input className="ms-edit-input" value={editForm.parentName} onChange={e => setEditForm(p => ({ ...p, parentName: e.target.value }))} placeholder="Parent Name" /></td>
                                    <td data-label="Parent Phone">
                                        <PhoneInput
                                            defaultCountry="eg"
                                            value={formatPhoneForInput(editForm.parentPhone)}
                                            onChange={(value) =>
                                            setEditForm((p) => ({
                                                ...p,
                                                parentPhone: stripPhoneDigits(value),
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
                                    <td data-label="Name">
                                      <div className="ms-avatar-cell">
                                        <div className="ms-avatar">{(s.name || s.email || "?").charAt(0).toUpperCase()}</div>
                                        <span className="ms-cell-name">{s.name || <span className="ms-cell-empty">—</span>}</span>
                                      </div>
                                    </td>
                                    <td data-label="Email">
                                      {s.email
                                        ? <span className="ms-icon-cell"><FiMail size={12} />{s.email}</span>
                                        : <span className="ms-cell-empty">—</span>}
                                    </td>
                                    <td data-label="Phone">
                                      {s.phone
                                        ? <span className="ms-icon-cell"><FiPhone size={12} />{s.phone}</span>
                                        : <span className="ms-cell-empty">—</span>}
                                    </td>
                                    <td data-label="Parent Name">
                                      {s.parentName
                                        ? <span className="ms-icon-cell"><FiUser size={12} />{s.parentName}</span>
                                        : <span className="ms-cell-empty">—</span>}
                                    </td>
                                    <td data-label="Parent Phone">
                                      {s.parentPhone
                                        ? <span className="ms-icon-cell"><FiPhone size={12} />{s.parentPhone}</span>
                                        : <span className="ms-cell-empty">—</span>}
                                    </td>
                                    <td>
                                      <div className="ms-action-wrap">
                                        <button className="ms-edit-btn" onClick={() => startEdit(s)} disabled={deletingId === s._id}>
                                          <FiEdit2 size={11} /> Edit
                                        </button>
                                        <button
                                          type="button"
                                          className="ms-delete-btn"
                                          onClick={() => deleteStudent(s)}
                                          disabled={deletingId === s._id}
                                          title="Remove student and all their data for this class"
                                        >
                                          <FiTrash2 size={11} />
                                          {deletingId === s._id ? "Deleting…" : "Delete"}
                                        </button>
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
                    <Pagination page={page} totalPages={totalPages} onPageChange={fetchPage} />
                    </div>

                    </div>
                </div>
                )}

            </div>
            </div>
        </main>
      </div>
    </>
  );
}
