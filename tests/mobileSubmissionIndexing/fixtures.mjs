// Offline browser fixtures. These never write to any real backend.
export const classroom = { _id: 'qa-classroom', name: 'Year 11 Physics — Cambridge', section: 'September cohort', teacherId: { _id: 'qa-teacher', name: 'Dr Amira Hassan' } };
export const assignment = { _id: 'qa-assignment', classroomId: classroom._id, title: 'Forces and motion — extended response assessment', maxPoints: 20, dueDate: '2026-09-25', board: 'Cambridge', paperCode: '0625' };
export const students = ['Youssef Mohamed Abdelrahman', 'Mariam Ahmed', 'Adam Hassan'].map((name, i) => ({ _id: `qa-student-${i}`, studentId: `qa-student-${i}`, googleUserId: `qa-google-${i}`, submissionId: `qa-submission-${i}`, name, state: 'TURNED_IN', submissionState: 'TURNED_IN', submittedAt: '2026-09-20T12:30:00Z', hasSubmission: true, hasPdf: true, pdfCount: 1, assignedGrade: i === 0 ? 15 : null, attachments: [{ driveFile: { id: `qa-file-${i}`, title: 'Physics answer paper.pdf' } }] }));
export const questions = [1, 2].map((n) => ({ id: `question-${n}`, question: `${n}(a)`, questionNumber: `${n}(a)`, label: `${n}(a)`, stem: 'Explain how the resultant force affects the acceleration of the trolley.', maxMarks: 10, obtained: n === 1 ? 8 : 7, obtainedMarks: n === 1 ? 8 : 7, marksAwarded: n === 1 ? 8 : 7, page: n, pageNumber: n, qpPages: [n], msPages: [n], msLabel: `${n}(a)`, studentAnswer: 'Acceleration increases when force increases.', feedback: 'Good understanding; include the proportional relationship.', examinerNotes: 'Good understanding; include the proportional relationship.', awardedPoints: ['Correct relationship'], missedPoints: ['Use the equation F = ma'], markPoints: [{ code: 'M1', marks: 1, text: 'Correct relationship', alternatives: [] }], acceptableAnswers: [], questionType: 'explanation' }));
export const result = { questions, totalMarks: 15, finalObtainedMarks: 15, maxMarks: 20, totalPossibleMarks: 20, overallSummary: 'A thoughtful response with clear working. Include the full equation to earn all marks.', markingMode: 'normal' };
export const saved = { submissionId: students[0].submissionId, studentId: students[0]._id, studentName: students[0].name, result, totalMarks: 15, hasResult: true, mode: 'normal', updatedAt: '2026-09-20T13:00:00Z' };
export const exam = { id: 'qa-exam', title: assignment.title, subject: 'Physics', board: 'Cambridge', paperCode: '0625/42', year: '2026', status: 'ready', questionCount: 2, totalMarks: 20, createdAt: '2026-09-20T12:00:00Z', updatedAt: '2026-09-20T12:00:00Z', cost: { egp: 2.5, usd: 0.05 }, tokenUsage: { totalTokens: 1400 }, partnerProvider: 'classroom', partnerAssignmentId: assignment._id, markingPack: { questions, questionPaperTotalMarks: 20, markSchemeTotalMarks: 20, reviewIssues: [], outOfScope: [] }, expectedQpLabels: ['1(a)', '2(a)'], expectedMsLabels: ['1(a)', '2(a)'], questionPaper: { filename: 'Question paper.pdf', pages: 2 }, markScheme: { filename: 'Mark scheme.pdf', pages: 2 } };
export const grading = { id: 'qa-grading', runId: 'qa-run', examId: exam.id, status: 'ready', studentName: students[0].name, studentFilename: 'Answer paper.pdf', obtainedMarks: 15, maxMarks: 20, studentPageCount: 2, result, cost: { egp: 1.2 }, tokenUsage: { totalTokens: 800 } };
export const run = { id: 'qa-run', examId: exam.id, examTitle: exam.title, status: 'ready', mode: 'instant', paperCount: 1, readyCount: 1, failedCount: 0, createdAt: '2026-09-20T12:00:00Z', cost: { egp: 1.2 }, tokenUsage: { totalTokens: 800 }, gradings: [grading], papers: [grading] };
export const userFor = (role = 'manager') => ({ id: 'qa-user', _id: 'qa-user', name: 'Demo Reviewer', role: { name: role }, gradingRole: role });

export async function installFixtures(context, { pdf, role = 'manager', selected = false, provider = false, requests = [] } = {}) {
  const partnerAssignment = { id: 'qa-assignment', name: assignment.title, grade: 20, count: 3, marked: 1 };
  const partnerRows = students.map((student, i) => ({ ...student, id: student.submissionId, assignment: partnerAssignment, studentName: student.name, hasDraft: i === 0, draftResult: i === 0 ? result : null }));
  await context.addInitScript(({ user, classroom, assignment, selected, provider, partnerAssignment }) => {
    localStorage.clear(); sessionStorage.clear();
    localStorage.setItem('token', 'qa-offline-token');
    localStorage.setItem('user', JSON.stringify(user));
    localStorage.setItem('theme', 'light');
    if (selected) {
      sessionStorage.setItem('sah-ui:subviewer:manager:classroom', JSON.stringify(classroom));
      sessionStorage.setItem('sah-ui:subviewer:manager:assignment', JSON.stringify(assignment));
    }
    if (provider) sessionStorage.setItem('sah-ui:drpeter-indexing:assignment', JSON.stringify(partnerAssignment));
  }, { user: { ...userFor(role), ...(provider ? { email: 'manager01@manager' } : {}) }, classroom, assignment, selected, provider, partnerAssignment });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) {
      if (['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol === 'blob:' || url.protocol === 'data:') return route.continue();
      return route.abort();
    }
    const p = url.pathname;
    requests.push({ method: request.method(), path: p, body: request.postData()?.slice(0, 400) });
    let body = {};
    const isIndex = /-indexing\/api\//.test(p);
    if (/\.pdf$|\/pdf$|\/markscheme-file$|\/pdfs\/\w+$|\/sources\/(questionPaper|markScheme)$/.test(p)) return route.fulfill({ contentType: 'application/pdf', body: pdf });
    if (isIndex) {
      const endpoint = p.replace(/^.*-indexing\/api/, '');
      if (endpoint === '/health') body = { ok: true, gemini: true };
      else if (endpoint === '/models') body = { models: [{ id: 'gemini-2.5-flash', label: 'Fast', group: 'Sahahly', inputUsdPerMillion: 0.3, outputUsdPerMillion: 2.5 }], defaultModel: 'gemini-2.5-flash' };
      else if (endpoint === '/exams') body = request.method() === 'POST' ? exam : [{ ...exam, ...(provider ? { partnerProvider: 'drpeter' } : {}) }];
      else if (endpoint.includes('/import-sources')) body = [exam];
      else if (/^\/exams\//.test(endpoint)) body = exam;
      else if (endpoint === '/runs') body = request.method() === 'POST' ? run : [run];
      else if (/^\/runs\//.test(endpoint)) body = run;
      else if (endpoint.endsWith('/placement')) body = { questions, columnPercent: 23, studentPageCount: 2 };
      else if (endpoint === '/gradings') body = [grading];
      else if (/^\/gradings\//.test(endpoint)) body = grading;
      else body = {};
    } else if (p.startsWith('/api/grading/drpeter/')) {
      if (p.endsWith('/submissions/assignments')) body = { assignments: [partnerAssignment], total: 3 };
      else if (p.endsWith('/submissions')) body = { data: partnerRows, total: 3, last_page: 1 };
      else if (p.endsWith('/classes')) body = { classes: [] };
      else if (p.endsWith('/draft')) body = { draftResult: result, draftOriginalAiResult: result, result, originalAiResult: result, finalResult: result };
      else body = { data: partnerRows[0] };
    } else if (p.endsWith('/auth/refresh')) body = { user: { ...userFor(role), ...(provider ? { email: 'manager01@manager' } : {}) }, token: 'qa-offline-token' };
    else if (p.endsWith('/filter-teachers')) body = [];
    else if (/\/my-classrooms$|\/courses$|\/teacher-courses\//.test(p)) body = { data: [classroom], total: 1, totalPages: 1, page: 1 };
    else if (p.endsWith('/classroom/qa-classroom/assignments')) body = { data: [assignment], total: 1, totalPages: 1, page: 1 };
    else if (p.endsWith('/qa-assignment/full') || p.endsWith('/qa-assignment/students')) {
      const search = (url.searchParams.get('search') || '').toLowerCase();
      const rows = students.filter(s => s.name.toLowerCase().includes(search));
      body = { students: rows, data: rows, total: rows.length, totalPages: 1, page: 1, pdfCount: 3, assignment: { ...assignment, expectedPages: 2, markSchemeFileId: 'qa-mark-scheme' }, assignmentTitle: assignment.title, maxGrade: 20, maxPoints: 20, classroomId: classroom._id, summaryMap: {} };
    } else if (p.endsWith('/markscheme')) body = { fileId: 'qa-mark-scheme', fileName: 'Mark scheme.pdf' };
    else if (p.includes('/save-results/qa-assignment/')) body = { data: saved };
    else if (p.endsWith('/save-results/qa-assignment')) body = { data: [saved] };
    else if (p.endsWith('/gemini-models')) body = { models: [{ id: 'gemini-2.5-flash', label: 'Fast', group: 'Sahahly', inputUsdPerMillion: 0.3, outputUsdPerMillion: 2.5 }], defaultModel: 'gemini-2.5-flash' };
    else if (p.endsWith('/prompts')) body = [];
    else if (p.includes('/mark-batch/active/')) body = { job: null };
    else if (p.includes('/marking-guidance')) body = { guidance: '', enabled: true };
    else if (p.includes('/available-assistants')) body = { data: [{ _id: 'qa-assistant', name: 'Sara Ali', email: 'sara@example.test' }] };
    else if (p.includes('/assignment-delegations')) body = [];
    else if (p.includes('/delegated-providers')) body = [];
    else if (p.includes('/grading') || p.includes('/notifications')) body = { data: [], unreadCount: 0 };
    else if (p.endsWith('/save-results')) body = { success: true, data: saved };
    else if (p.includes('/classrooms/qa-classroom')) body = classroom;
    else if (p.includes('/presigned')) body = { url: null };
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
}
