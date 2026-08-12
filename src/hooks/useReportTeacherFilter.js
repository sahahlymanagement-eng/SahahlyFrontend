import { useEffect, useMemo, useState } from "react";
import api from "../api/api";

export function getClassroomTeacherId(classroom) {
  if (!classroom) return "";
  const t = classroom.teacherId;
  return String(t?._id || t?.id || t || "");
}

export function buildReportTeacherOptions(isTeacher, allTeachers, classrooms) {
  if (isTeacher) return [];

  const map = new Map();

  const addTeacher = (id, name) => {
    const sid = String(id || "");
    if (!sid || !name) return;
    if (!map.has(sid)) map.set(sid, { id: sid, name });
  };

  for (const t of allTeachers || []) {
    addTeacher(t._id || t.id, t.name);
  }

  for (const c of classrooms || []) {
    const t = c?.teacherId;
    addTeacher(t?._id || t?.id, t?.name);
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function useReportTeacherFilter({
  isTeacher,
  userId,
  classroomSearch,
  loadGlobalTeachers = false,
  /** Director sees all classrooms — do not scope by manager personId */
  omitPersonId = false,
}) {
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [allTeachers, setAllTeachers] = useState([]);

  useEffect(() => {
    if (isTeacher) return;

    if (loadGlobalTeachers) {
      api
        .get("/people/teachers")
        .then((r) => setAllTeachers(r.data || []))
        .catch(() => {});
      return;
    }

    if (!userId) return;

    api
      .get("/google-classroom/filter-teachers", { params: { personId: userId } })
      .then((r) => setAllTeachers(r.data || []))
      .catch(() => {});
  }, [isTeacher, loadGlobalTeachers, userId]);

  const classroomParams = useMemo(() => {
    const params = { search: classroomSearch };
    if (!omitPersonId && userId) params.personId = userId;
    if (!isTeacher && teacherFilter !== "all") params.teacherId = teacherFilter;
    return params;
  }, [isTeacher, omitPersonId, userId, classroomSearch, teacherFilter]);

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
