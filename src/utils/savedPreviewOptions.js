// Export actions must use the confirmed persisted snapshot, never a displayed draft.
export function savedPreviewOptions(snapshot, submissionId) {
  if (!snapshot || String(snapshot.submissionId) !== String(submissionId)) {
    throw new Error('Saved revision is not ready. Save your changes before downloading or returning the PDF.');
  }
  return {
    cacheScope: snapshot.submissionId,
    questions: snapshot.questions,
    maxTotalMarks: snapshot.maxTotal,
    summary: snapshot.summary,
    teacherAnnotations: snapshot.teacherAnnotations,
    outOfScopeNotes: snapshot.outOfScopeNotes,
    criteriaGrade: snapshot.criteriaGrade,
    finalObtainedMarks: snapshot.finalObtainedMarks,
    finalMaximumMarks: snapshot.finalMaximumMarks ?? snapshot.maxTotal,
    lockPlacement: true,
    skipCompress: true,
  };
}
