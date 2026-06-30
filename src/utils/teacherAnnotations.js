export function getTeacherAnnotations(result) {
  return Array.isArray(result?.teacherAnnotations) ? result.teacherAnnotations : [];
}

export function createTeacherAnnotation({
  text,
  anchorType = "question",
  questionNumber = null,
  pageNumber = 1,
  yPercent = 30,
}) {
  return {
    id: `ta_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text: String(text || "").trim(),
    anchorType: anchorType === "custom" ? "custom" : "question",
    questionNumber: questionNumber != null ? String(questionNumber) : null,
    pageNumber: Math.max(1, Number(pageNumber) || 1),
    yPercent: Math.min(100, Math.max(0, Number(yPercent) || 30)),
  };
}

export function resolveTeacherAnnotationsForPdf(annotations, questions) {
  const qMap = new Map(
    (questions || []).map((q) => [String(q.questionNumber), q])
  );

  return (annotations || [])
    .filter((a) => a && String(a.text || "").trim())
    .map((a) => {
      const base = {
        id: a.id,
        text: String(a.text).trim(),
        anchorType: a.anchorType === "custom" ? "custom" : "question",
        questionNumber: a.questionNumber != null ? String(a.questionNumber) : null,
      };

      if (base.anchorType === "question" && base.questionNumber) {
        const q = qMap.get(base.questionNumber);
        if (q) {
          return {
            ...base,
            pageNumber: Math.max(1, Number(q.pageNumber) || 1),
            yPercent: Math.min(92, Math.max(5, Number(q.yPercent) ?? 30)),
            questionLabel: `Q${q.questionNumber}`,
          };
        }
      }

      return {
        ...base,
        pageNumber: Math.max(1, Number(a.pageNumber) || 1),
        yPercent: Math.min(92, Math.max(5, Number(a.yPercent) ?? 30)),
        questionLabel: base.questionNumber ? `Q${base.questionNumber}` : null,
      };
    });
}

export function annotationsHavePendingEdits(current, confirmed) {
  const norm = (list) =>
    JSON.stringify(
      (list || []).map((a) => ({
        id: a.id,
        text: a.text,
        anchorType: a.anchorType,
        questionNumber: a.questionNumber,
        pageNumber: a.pageNumber,
        yPercent: a.yPercent,
      }))
    );
  return norm(current) !== norm(confirmed);
}
