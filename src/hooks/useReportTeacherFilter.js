import { useEffect, useMemo, useState } from "react";
import api from "../api/api";

export function getClassroomTeacherId(classroom) {
  if (!classroom) return "";
  const t = classroom.teacherId;
  return String(t?._id || t?.id || t || "");
}

export function buildReportTeacherOptions(isTeacher, allTeachers, classrooms, preferGlobal = false) {
  if (isTeacher) return [];

  const fromApi = (allTeachers || [])
    .map((t) => ({ id: String(t._id), name: t.name }))
    .filter((t) => t.id && t.name);

  const map = new Map();
  for (const c of classrooms || []) {
    const t = c?.teacherId;
    const id = t?._id || t?.id;
    const name = t?.name;
    if (!id || !name) continue;
    if (!map.has(String(id))) map.set(String(id), { id: String(id), name });
  }
  const fromClassrooms = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));

  if (preferGlobal && fromApi.length) return fromApi.sort((a, b) => a.name.localeCompare(b.name));
  if (fromClassrooms.length) return fromClassrooms;
  return fromApi.sort((a, b) => a.name.localeCompare(b.name));
}

export function useReportTeacherFilter({
  isTeacher,
  userId,
  classroomSearch,
  loadGlobalTeachers = false,
}) {
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [allTeachers, setAllTeachers] = useState([]);

  useEffect(() => {
    if (isTeacher || !loadGlobalTeachers) return;
    api.get("/people/teachers")
      .then((r) => setAllTeachers(r.data || []))
      .catch(() => {});
  }, [isTeacher, loadGlobalTeachers]);

  const classroomParams = useMemo(() => {
    if (isTeacher) return { search: classroomSearch };
    const params = { personId: userId, search: classroomSearch };
    if (teacherFilter !== "all") params.teacherId = teacherFilter;
    return params;
  }, [isTeacher, userId, classroomSearch, teacherFilter]);

  return {
    teacherFilter,
    setTeacherFilter,
    allTeachers,
    classroomParams,
    showTeacherFilter: !isTeacher,
  };
}

export function useReportTeacherOptions(
  isTeacher,
  allTeachers,
  classrooms,
  preferGlobal = false
) {
  return useMemo(
    () => buildReportTeacherOptions(isTeacher, allTeachers, classrooms, preferGlobal),
    [isTeacher, allTeachers, classrooms, preferGlobal]
  );
}

export function useClearClassroomOnTeacherFilter(teacherFilter, selectedClassroom, onClear) {
  useEffect(() => {
    if (teacherFilter === "all" || !selectedClassroom) return;
    const classroomTeacherId = getClassroomTeacherId(selectedClassroom);
    if (classroomTeacherId && classroomTeacherId !== teacherFilter) {
      onClear();
    }
  }, [teacherFilter, selectedClassroom, onClear]);
}

/** Alias for non-report classroom pickers (students data, courses, etc.) */
export const useClassroomTeacherFilter = useReportTeacherFilter;
