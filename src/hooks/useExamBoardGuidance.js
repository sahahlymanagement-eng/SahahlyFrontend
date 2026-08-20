import { useCallback, useEffect, useState } from "react";
import api from "../api/api";
import {
  appendExamBoardToFormData,
  examBoardBodyFields,
  resolveSessionGuidance,
} from "../utils/examBoardGuidance";

/**
 * Exam board + subject selectors for the marking guidance modal.
 *
 * Subject comes from the classroom when `classroomId` or `assignmentId` is set;
 * partner grading tabs with no classroom leave the subject dropdown editable.
 *
 * Board/subject keys are sent with the mark request so the backend can inject
 * hardcoded board/subject prompt fragments into the general marking prompt.
 * Guidance PDFs are never fetched or attached.
 */
export function useExamBoardGuidance({
  classroomId = null,
  assignmentId = null,
  enabled = true,
} = {}) {
  const [boards, setBoards] = useState([
    { id: "cambridge", label: "Cambridge" },
    { id: "edexcel", label: "Edexcel" },
  ]);
  const [subjects, setSubjects] = useState([]);
  const [board, setBoard] = useState("cambridge");
  const [subjectKey, setSubjectKey] = useState("");
  const [subjectLabel, setSubjectLabel] = useState("");
  const [subjectLocked, setSubjectLocked] = useState(false);
  const [loadingSubject, setLoadingSubject] = useState(false);
  const [guidanceError, setGuidanceError] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    api
      .get("/marking/exam-board-guidance/options")
      .then(({ data }) => {
        if (data?.boards?.length) setBoards(data.boards);
        if (data?.subjects?.length) setSubjects(data.subjects);
      })
      .catch(() => {});
  }, [enabled]);

  const applyResolvedSubject = useCallback(
    (name, key, matched) => {
      if (key) {
        setSubjectKey(key);
        const label = subjects.find((s) => s.key === key)?.label;
        setSubjectLabel(label || name || "");
        setSubjectLocked(Boolean(matched && (classroomId || assignmentId)));
      } else if (name) {
        setSubjectLabel(name);
        setSubjectKey("");
        setSubjectLocked(false);
      }
    },
    [assignmentId, classroomId, subjects]
  );

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setLoadingSubject(true);

    const resolveFromClassroom = classroomId
      ? api.get(`/classrooms/${classroomId}`).then(({ data }) => {
          const name = data?.subjectId?.name || null;
          if (!name) return null;
          return api
            .get("/marking/exam-board-guidance/resolve-subject", { params: { name } })
            .then((res) => ({ name, ...res.data }));
        })
      : null;

    const mongoAssignmentId =
      assignmentId && /^[a-f0-9]{24}$/i.test(String(assignmentId))
        ? assignmentId
        : null;

    const resolveFromAssignment =
      !classroomId && mongoAssignmentId
        ? api
            .get(`/marking/exam-board-guidance/for-assignment/${mongoAssignmentId}`)
            .then(({ data }) => ({
              name: data?.subjectName,
              key: data?.subjectKey,
              matched: data?.matched,
            }))
        : null;

    (resolveFromClassroom || resolveFromAssignment || Promise.resolve(null))
      .then((resolved) => {
        if (cancelled) return;
        if (resolved?.name || resolved?.key) {
          applyResolvedSubject(resolved.name, resolved.key, resolved.matched);
        } else {
          setSubjectLocked(false);
        }
      })
      .catch(() => {
        if (!cancelled) setSubjectLocked(false);
      })
      .finally(() => {
        if (!cancelled) setLoadingSubject(false);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, classroomId, assignmentId, applyResolvedSubject]);

  useEffect(() => {
    if (!enabled) {
      setGuidanceError(null);
      return;
    }
    if (!subjectKey) {
      setGuidanceError(null);
      return;
    }
    setGuidanceError(null);
  }, [enabled, board, subjectKey]);

  const buildResolvedGuidance = useCallback(
    (userGuidance, assignmentPrompt) =>
      resolveSessionGuidance(userGuidance, assignmentPrompt),
    []
  );

  const getExamBoardFields = useCallback(
    () => examBoardBodyFields({ board, subjectKey }),
    [board, subjectKey]
  );

  const appendExamBoardFields = useCallback(
    (fd) => appendExamBoardToFormData(fd, { board, subjectKey }),
    [board, subjectKey]
  );

  return {
    boards,
    subjects,
    board,
    setBoard,
    subjectKey,
    setSubjectKey,
    subjectLabel,
    subjectLocked,
    loadingSubject,
    loadingGuidance: false,
    guidanceError,
    boardGuidanceText: "",
    buildResolvedGuidance,
    getExamBoardFields,
    appendExamBoardFields,
  };
}
