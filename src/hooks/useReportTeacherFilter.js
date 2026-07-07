import { useEffect, useMemo, useState } from "react";
import api from "../api/api";

export function getClassroomTeacherId(classroom) {
  if (!classroom) return "";
  const t = classroom.teacherId;
  return String(t?._id || t?.id || t || "");
}

export function buildReportTeacherOptions(isTeacher, allTeachers, classrooms) {
  if (isTeacher) return [];

  const fromApi = (allTeachers || [])
    .map((t) => ({ id: String(t._id), name: t.name }))
    .filter((t) => t.id && t.name);

  if (fromApi.length) {
    return fromApi.sort((a, b) => a.name.localeCompare(b.name));
  }

  const map = new Map();
  for (const c of classrooms || []) {
    const t = c?.teacherId;
    const id = t?._id || t?.id;
    const name = t?.name;
    if (!id || !name) continue;
    if (!map.has(String(id))) map.set(String(id), { id: String(id), name });
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function useReportTeacherFilter({ isTeacher, userId, classroomSearch }) {
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [allTeachers, setAllTeachers] = useState([]);

  useEffect(() => {
    if (isTeacher) return;
    api.get("/people/teachers")
      .then((r) => setAllTeachers(r.data || []))
      .catch(() => {});
  }, [isTeacher]);

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

export function useReportTeacherOptions(isTeacher, allTeachers, classrooms) {
  return useMemo(
    () => buildReportTeacherOptions(isTeacher, allTeachers, classrooms),
    [isTeacher, allTeachers, classrooms]
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
