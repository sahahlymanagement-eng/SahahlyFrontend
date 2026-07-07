import { useEffect, useMemo, useState } from "react";
import api from "../../api/api";
import "./DirectorClassroomManagers.css";
import { usePagination } from "../../hooks/usePagination";
import Pagination from "../../components/Pagination";
import ReportTeacherFilterSelect from "../../components/ReportTeacherFilterSelect";
import { useReportTeacherOptions } from "../../hooks/useReportTeacherFilter";
import { toast } from "react-toastify";
import { FiRefreshCw, FiSearch } from "react-icons/fi";

export default function DirectorManagers() {
  const [search, setSearch] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [allTeachers, setAllTeachers] = useState([]);

  useEffect(() => {
    api.get("/people/teachers")
      .then((r) => setAllTeachers(r.data || []))
      .catch(() => {});
  }, []);

  const classroomParams = useMemo(
    () => ({
      search: search.trim() || undefined,
      ...(teacherFilter !== "all" ? { teacherId: teacherFilter } : {}),
    }),
    [search, teacherFilter]
  );

  const {
    data: classrooms,
    page,
    totalPages,
    loading: loadingClassrooms,
    fetchPage: fetchClassroomsPage,
  } = usePagination("/classrooms", classroomParams, 10);

  const teacherOptions = useReportTeacherOptions(false, allTeachers, classrooms);

  const [people, setPeople] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedManagers, setSelectedManagers] = useState({});
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { loadSupportData(); }, []);

  const loadSupportData = async () => {
    try {
      const [peopleRes, assignmentsRes] = await Promise.all([
        api.get("/people", { params: { page: 1, limit: 5000 } }),
        api.get("/classroom-managers", { params: { page: 1, limit: 5000 } }),
      ]);

      const persons = peopleRes.data.data || [];
      const assigns = assignmentsRes.data.data || [];

      setPeople(persons);
      setAssignments(assigns);

      const map = {};
      assigns.forEach((a) => { map[a.classroomId?._id] = a.personId?._id; });
      setSelectedManagers(map);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to load classroom managers");
    }
  };

  const reload = async () => {
    await Promise.all([fetchClassroomsPage(page), loadSupportData()]);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([fetchClassroomsPage(1), loadSupportData()]);
      toast.success("Classroom list refreshed");
    } catch {
      toast.error("Failed to refresh classrooms");
    } finally {
      setRefreshing(false);
    }
  };

  const managers = people.filter(
    (p) => p.roleId?.name?.trim().toLowerCase() === "manager"
  );

  const hasManager = (classroomId) =>
    assignments.some((a) => a.classroomId?._id === classroomId);

  const assignManager = async (classroomId) => {
    const personId = selectedManagers[classroomId];
    if (!personId) {
      toast.warn("Please select a manager first");
      return;
    }
    try {
      setLoading(true);
      await api.post("/classroom-managers", { personId, classroomId });
      await reload();
      toast.success("Manager assigned successfully");
    } catch (err) {
      toast.error(err.response?.data?.message || "Assignment failed");
    } finally {
      setLoading(false);
    }
  };

  const changeManager = async (classroomId) => {
    const personId = selectedManagers[classroomId];
    if (!personId) {
      toast.warn("Please select a manager first");
      return;
    }
    try {
      setLoading(true);
      await api.put("/classroom-managers", { personId, classroomId });
      await reload();
      toast.success("Manager updated successfully");
    } catch (err) {
      toast.error(err.response?.data?.message || "Change failed");
    } finally {
      setLoading(false);
    }
  };

  const removeManager = async (classroomId) => {
    try {
      setLoading(true);
      await api.delete("/classroom-managers", { data: { classroomId } });
      await reload();
      toast.success("Manager removed successfully");
    } catch (err) {
      toast.error(err.response?.data?.message || "Remove failed");
    } finally {
      setLoading(false);
    }
  };

  const managerName = (classroomId) => {
    const assignment = assignments.find((a) => a.classroomId?._id === classroomId);
    return assignment?.personId?.name || "None";
  };

  return (
    <div className="dm-page">
      <div className="dm-header">
        <h2 className="dm-title">Assign Managers to Classrooms</h2>
        <div className="dm-toolbar">
          <ReportTeacherFilterSelect
            show
            value={teacherFilter}
            onChange={setTeacherFilter}
            teachers={teacherOptions}
            className="dm-select dm-teacher-filter"
          />
          <div className="dm-search">
            <FiSearch size={16} aria-hidden />
            <input
              type="search"
              placeholder="Search classrooms…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search classrooms"
            />
          </div>
          <button
            type="button"
            className="dm-refresh"
            onClick={handleRefresh}
            disabled={refreshing || loadingClassrooms}
            title="Refresh classroom list"
          >
            <FiRefreshCw size={15} className={refreshing ? "dm-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      <div className="dm-table-box">
        <table className="dm-table">
          <thead>
            <tr>
              <th>Classroom</th>
              <th>Teacher</th>
              <th>Current Manager</th>
              <th>Select Manager</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingClassrooms && (
              <tr>
                <td colSpan={5} className="dm-empty">Loading classrooms…</td>
              </tr>
            )}
            {!loadingClassrooms && classrooms.length === 0 && (
              <tr>
                <td colSpan={5} className="dm-empty">
                  {search.trim() ? `No classrooms match "${search.trim()}".` : "No classrooms found."}
                </td>
              </tr>
            )}
            {!loadingClassrooms && classrooms.map((room) => {
              const alreadyAssigned = hasManager(room._id);
              return (
                <tr key={room._id}>
                  <td>{room.name}{room.section && ` (${room.section})`}</td>
                  <td>{room.teacherName || room.teacherId?.name || "-"}</td>
                  <td className="dm-current">{managerName(room._id)}</td>

                  <td>
                    <select
                      className="dm-select"
                      value={selectedManagers[room._id] || ""}
                      onChange={(e) =>
                        setSelectedManagers((prev) => ({
                          ...prev,
                          [room._id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Select Manager</option>
                      {managers.map((m) => (
                        <option key={m._id} value={m._id}>{m.name}</option>
                      ))}
                    </select>
                  </td>

                  <td className="dm-actions">
                    {!alreadyAssigned ? (
                      <button
                        className="dm-assign"
                        onClick={() => assignManager(room._id)}
                      >
                        Assign
                      </button>
                    ) : (
                      <>
                        <button
                          className="dm-change"
                          onClick={() => changeManager(room._id)}
                        >
                          Change
                        </button>
                        <button
                          className="dm-remove"
                          onClick={() => removeManager(room._id)}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={fetchClassroomsPage} />

      {loading && <div className="dm-loading">Processing...</div>}
    </div>
  );
}
