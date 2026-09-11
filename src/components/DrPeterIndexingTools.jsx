import ExamSetupFields from "../../drpeter-indexing/src/components/ExamSetupFields.jsx";
import { textFromExpectedRows } from "../../drpeter-indexing/src/components/ExpectedQuestionsTable.jsx";
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../api/api';
import { assertPdfBlob, getApiErrorMessage } from '../utils/markingFormData';
import { withPdfFetchRetry } from '../utils/studentPdfCache';
import { sahahlyModelLabel } from '../utils/markingCost';
import { isPublished } from '../utils/gradingStatus';
import { usePageCountCheck, applyPageCountDecision } from '../hooks/usePageCountCheck';
import PageCountCheckModal from './PageCountCheckModal';
import './DrPeterIndexingTools.css';
import { getIndexingUpload, subscribeIndexingUploads, startIndexingUpload } from '../utils/indexingUploads';

/** Already has a draft, published result, or saved marking — never re-index-mark. */
function isAlreadyCorrectedPartnerRow(student) {
  return (
    isPublished(student) ||
    !!student?.hasDraft ||
    !!student?.hasMarkingResult ||
    !!student?.draftResult ||
    !!student?.markingResult ||
    !!student?.pendingEdits ||
    !!student?.pendingEditsSavedAt
  );
}

const INDEXING_MODEL_KEY = 'sahahly.indexing.gradeModel';
const DEFAULT_INDEXING_MODEL = 'gemini-2.5-flash';

function readIndexingModel(fallback) {
  try {
    const remembered = localStorage.getItem(INDEXING_MODEL_KEY);
    if (remembered) return remembered;
  } catch { /* private mode */ }
  if (fallback) return fallback;
  return DEFAULT_INDEXING_MODEL;
}

const stateLabel = state => ({ ready: 'Completed', needs_review: 'Needs review', queued: 'Queued', processing: 'Processing', error: 'Failed', partial: 'Partly completed', cancelled: 'Cancelled' }[state] || state);
export default function DrPeterIndexingTools({ assignment, selectedIds, canMark, gradeModel, loadRoster, onResultsReady, provider = 'drpeter' }) {
  const classroom = provider === 'classroom';
  const root = `/${provider}-indexing`;
  const base = `${root}/api`;
  const { pageCheckModal, confirmPageCounts, confirmGradingPageCounts, resolvePageCheck } = usePageCountCheck();
  const [pack, setPack] = useState(null);
  const [runs, setRuns] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [setup, setSetup] = useState(false);
  const [indexForm, setIndexForm] = useState(() => ({ title: assignment.name || assignment.title || '', subject: '', board: '', year: '', paperCode: '', expectedQpRows: [{ label: '', marks: '' }], expectedMsRows: [{ label: '', marks: '' }], questionPaper: null, markScheme: null }));
  const qp = indexForm.questionPaper;
  const ms = indexForm.markScheme;
  const [sourceMessage, setSourceMessage] = useState('');
  const [view, setView] = useState(null);
  const [indexingModel, setIndexingModel] = useState(() => readIndexingModel(gradeModel));
  const [indexingModels, setIndexingModels] = useState([]);
  useEffect(() => {
    let active = true;
    api.get(`${base}/models`, {timeout:30000}).then(({data}) => {
      if (!active) return;
      const models = data.models || [];
      setIndexingModels(models);
      setIndexingModel(current => models.some(model => model.id === current)
        ? current : (models.find(model => model.isDefault)?.id || models[0]?.id || DEFAULT_INDEXING_MODEL));
    }).catch(async err => { if (active) setError(await getApiErrorMessage(err)); });
    return () => { active = false; };
  }, [base]);
  const readyCallback = useRef(onResultsReady);
  const viewerRevision = useRef('');
  useEffect(() => { readyCallback.current = onResultsReady; }, [onResultsReady]);
  const alive = useRef(true);
  const roster = useRef(loadRoster);
  useEffect(() => { roster.current = loadRoster; }, [loadRoster]);
  const assignmentId = String(classroom ? assignment._id : assignment.id);
  const uploadKey = `${provider}:${assignmentId}`;
  useEffect(() => {
    let previous;
    const refresh = () => {
      const job = getIndexingUpload(uploadKey);
      if (!job || job === previous) return;
      previous = job;
      setBusy(job.active ? job.message : '');
      if (job.error) getApiErrorMessage(job.error).then(setError);
    };
    refresh();
    return subscribeIndexingUploads(refresh);
  }, [uploadKey]);

  function chooseIndexingModel(id) {
    if (!indexingModels.some(m => m.id === id)) return;
    setIndexingModel(id);
    try { localStorage.setItem(INDEXING_MODEL_KEY, id); } catch { /* private mode */ }
  }

  useEffect(() => {
    alive.current = true;
    let timer;
    async function poll() {
      try {
        const { data } = await api.get(`${base}/exams`, { params:{partnerAssignmentId:assignmentId}, timeout: 30000 });
        const linked = data.filter(row => row.partnerProvider === provider && row.partnerAssignmentId === assignmentId);
        const latest = linked[0] || null;
        const runLists = await Promise.all(linked.map(row => api.get(`${base}/runs`, { params: { examId: row.id }, timeout: 30000 })));
        if (!alive.current) return;
        setPack(latest);
        setRuns(runLists.flatMap(r => r.data).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))));
        const revision=runLists.flatMap(r=>r.data).map(r=>r.viewerRevision || (r.readyCount ? `${r.id}:${r.readyCount}` : '')).filter(Boolean).sort().join('|');
        if(revision && revision!==viewerRevision.current){viewerRevision.current=revision;readyCallback.current?.();}
        setLoading(false);
      } catch (err) { if (alive.current) { setError(await getApiErrorMessage(err)); setLoading(false); } }
      if (alive.current) timer = setTimeout(poll, 4000);
    }
    poll();
    return () => { alive.current = false; clearTimeout(timer); };
  }, [assignmentId, base, provider]);

  async function openIndex() {
    setError('');
    if (pack) { setView({ title: 'Review assignment index', hash: `#/exams/${pack.id}` }); return; }
    setSetup(true); setBusy('Loading connected assignment PDFs…'); setSourceMessage('');
    try {
      const students = classroom ? [] : await roster.current();
      const first = students.find(s => s.submissionId != null);
      if (!first && !classroom) { setSourceMessage('No connected submission is available. Attach the original QP and mark scheme once.'); return; }
      const results = await Promise.allSettled(['questionPaper','markScheme'].map(kind => api.get(classroom ? `${root}/assignments/${assignmentId}/sources/${kind}` : `${root}/partner/assignments/${assignmentId}/submissions/${first.submissionId}/${kind}`, { responseType:'blob', timeout:120000 })));
      const notes = [];
      for (let i=0; i<results.length; i++) {
        const row=results[i];
        if (row.status === 'fulfilled') {
          await assertPdfBlob(row.value.data, i ? 'Mark scheme' : 'Question paper');
          const file = new File([row.value.data], i ? 'Connected mark scheme.pdf' : 'Connected question paper.pdf', {type:'application/pdf'});
          if (alive.current) { setIndexForm(previous => ({ ...previous, [i ? 'markScheme' : 'questionPaper']: file })); }
        } else notes.push(await getApiErrorMessage(row.reason));
      }
      if (alive.current) setSourceMessage(notes.filter(Boolean).join(' '));
    } catch(err) { if(alive.current) setSourceMessage(await getApiErrorMessage(err)); }
    finally { if(alive.current) setBusy(''); }
  }

  async function createIndex(event) {
    event.preventDefault(); if(!qp || !ms) return;
    setBusy('Indexing assignment…');setError('');
    try {
      await assertPdfBlob(qp,'Question paper'); await assertPdfBlob(ms,'Mark scheme');
      const form=new FormData();
      for (const key of ['title','subject','board','year','paperCode']) form.set(key,indexForm[key]);
      form.set('expectedQpLabels', textFromExpectedRows(indexForm.expectedQpRows));
      form.set('expectedMsLabels', textFromExpectedRows(indexForm.expectedMsRows));
      form.set('partnerAssignmentId',assignmentId);form.set('questionPaper',qp);form.set('markScheme',ms);
      const {data}=await api.post(`${base}/exams`,form,{timeout:180000});
      if(!alive.current)return;
      setPack(data);setSetup(false);setView({title:'Review assignment index',hash:`#/exams/${data.id}`});
    }catch(err){if(alive.current)setError(await getApiErrorMessage(err));}
    finally{if(alive.current)setBusy('');}
  }

  async function mark(mode) {
    const selected = new Set([...selectedIds].map(String));
    if (!selected.size || !pack || pack.status !== 'ready' || !indexingModels.length) return;
    setError('');
    const data = await startIndexingUpload(uploadKey, async report => {
      // Refresh the full assignment roster: selection may span pages/search results.
      const all=await roster.current();
      let students=all.filter(s=>selected.has(String(s.submissionId)));
      if(students.length!==selected.size)throw new Error('Some selected students are no longer in this assignment. Refresh the viewer and select again.');
      if(students.length>60)throw new Error('Select at most 60 students per indexing run.');

      // Same rule as normal Instant/Batch: never download, upload, or send
      // already-corrected papers through indexing marking.
      report('Skipping papers that are already corrected…');
      const beforeCorrected = students.length;
      if (classroom) {
        const { data: eligibleRows } = await api.post('/submission-files/eligible-for-bulk-marking', {
          assignmentId,
          submissions: students,
        }, { timeout: 60000 });
        const eligibleIds = new Set((eligibleRows || []).map((row) => String(row.submissionId)));
        students = students.filter((s) => eligibleIds.has(String(s.submissionId)));
      } else {
        students = students.filter((s) => !isAlreadyCorrectedPartnerRow(s));
      }
      const alreadyCorrected = beforeCorrected - students.length;
      if (alreadyCorrected > 0) {
        toast.info(
          `Skipping ${alreadyCorrected} already corrected submission${alreadyCorrected === 1 ? '' : 's'} — not uploaded or re-marked`
        );
      }
      if (!students.length) {
        throw new Error(
          beforeCorrected
            ? 'All selected submissions are already corrected. Nothing was uploaded or marked.'
            : 'No submissions left to mark.'
        );
      }

      report('Checking submission page counts…');
      const pageDecision = classroom
        ? await confirmPageCounts({
            assignmentId,
            classroomId: assignment.classroomId || assignment.courseId || null,
            students,
          })
        : await confirmGradingPageCounts({
            provider,
            assignmentId,
            submissionIds: students.map((s) => s.submissionId),
          });
      students = applyPageCountDecision(students, pageDecision);
      if (!students?.length) return null; // cancelled or nothing left
      const dropped = selected.size - students.length;
      if (dropped > 0) {
        toast.info(`Skipping ${dropped} submission${dropped === 1 ? '' : 's'} with unexpected page count`);
      }

      const form=new FormData();form.set('examId',pack.id);form.set('partnerAssignmentId',assignmentId);form.set('mode',mode);form.set('gradeModel',indexingModel);
      form.set('submissionIds',JSON.stringify(students.map(s=>String(s.submissionId))));
      form.set('studentNames',JSON.stringify(students.map(s=>s.name || `Submission ${s.submissionId}`)));
      const papers = new Array(students.length);
      let next = 0, loaded = 0;
      const loadPaper = async () => { while (next < students.length) {
        const i = next++;
        const student=students[i];
        const {data}=await withPdfFetchRetry(()=>api.get(classroom ? '/submission-files/pdf' : `/grading/${provider}/submissions/${student.submissionId}/pdfs/submission`,{params:classroom ? {assignmentId,submissionId:student.submissionId,googleUserId:student.googleUserId || student.studentGoogleUserId} : undefined,responseType:'blob',timeout:120000}));
        await assertPdfBlob(data,`Submission ${student.submissionId}`);
        papers[i] = new File([data],`submission_${student.submissionId}.pdf`,{type:'application/pdf'});
        report(`Loaded student PDFs ${++loaded}/${students.length}… You can navigate to another app tab.`);
      }};
      const downloads = await Promise.allSettled(Array.from({length:Math.min(3,students.length)},loadPaper));
      const failed = downloads.find(result=>result.status==='rejected');
      if (failed) throw failed.reason;
      papers.forEach(paper=>form.append('studentPapers',paper));
      report(`Uploading ${students.length} papers for ${mode} marking…`);
      const {data}=await api.post(`${base}/runs`,form,{timeout:900000,
        onUploadProgress: event => report(event.total && event.loaded < event.total
          ? `Uploading papers: ${Math.round(event.loaded / event.total * 100)}%`
          : 'Upload sent — validating and saving the marking run…')});
      return data;
    });
    if(data && alive.current) {
      setRuns(previous=>[data,...previous.filter(run=>run.id!==data.id)]);
      setView({title:`Indexing marking — ${mode}`,hash:`#/runs/${data.id}`});
    }
  }

  return <section className="dpi-tools" aria-label="Assignment indexing">
    <div className="dpi-actions">
      <button type="button" className="msv-btn-ai" onClick={openIndex} disabled={loading || !!busy || (!canMark && !pack)}>Index assignment</button>
      <span>{loading ? 'Checking assignment index…' : pack ? `Index: ${pack.status==='ready'?'Reviewed':stateLabel(pack.status)} · ${pack.questionCount} questions · ${pack.totalMarks ?? '?'} marks` : 'Not indexed yet'}</span>
      {!!selectedIds.size && canMark && <>
        <label className="dpi-model">
          <span>Indexing model</span>
          <select
            value={indexingModel}
            onChange={e => chooseIndexingModel(e.target.value)}
            disabled={!!busy || pack?.status !== 'ready' || !indexingModels.length}
            aria-label="Indexing marking model"
          >
            {!indexingModels.length && <option value={indexingModel}>Loading indexing models…</option>}
            {indexingModels.map(m => (
              <option key={m.id} value={m.id}>{sahahlyModelLabel(m.id)}</option>
            ))}
          </select>
        </label>
        <button type="button" className="msv-btn-ai" onClick={()=>mark('instant')} disabled={!!busy || pack?.status!=='ready' || !indexingModels.length}>Mark with indexing (Instant)</button>
        <button type="button" className="msv-btn-ai" onClick={()=>mark('batch')} disabled={!!busy || pack?.status!=='ready' || !indexingModels.length}>Mark with indexing (Batch)</button>
        <span>{selectedIds.size} selected · {sahahlyModelLabel(indexingModel)}{pack?.status!=='ready'?' — index and approve this assignment first':''}</span>
      </>}
    </div>
    {busy && <p role="status">{busy}</p>}
    {runs.filter(run=>['queued','processing'].includes(run.status)).map(run=><div key={run.id} role="status">
      <strong>{run.mode === 'instant' ? 'Instant marking' : 'Batch marking'}: {run.readyCount}/{run.paperCount} completed · {run.failedCount || 0} failed</strong>
      <progress value={run.readyCount + (run.failedCount || 0)} max={run.paperCount || 1} />
      <button type="button" onClick={()=>setView({title:'Marking progress',hash:`#/runs/${run.id}`})}>View live progress</button>
      <p>Marking continues on the server when you leave this tab.</p>
    </div>)}
    {error && <p role="alert" className="dpi-error">{error}</p>}
    {pack?.error && <p className="dpi-error">{pack.error}</p>}
    {runs.length>0 && <p>Completed papers appear in each student’s Results button. Edit them there and use the existing {classroom ? 'Return All' : 'Publish All'} to return them.</p>}
    {runs.length>0 && <details><summary>Indexing results ({runs.length} runs)</summary><div className="dpi-runs">{runs.map(run=><button type="button" key={run.id} onClick={()=>setView({title:'Indexing results',hash:`#/runs/${run.id}`})}>{stateLabel(run.status)} · {run.mode} · {run.readyCount}/{run.paperCount} completed{run.failedCount?` · ${run.failedCount} failed`:''} · {new Date(run.createdAt).toLocaleString()}</button>)}</div></details>}
    {setup && <div className="dpi-overlay" role="dialog" aria-modal="true" aria-label="Index assignment">
      <form className="dpi-dialog" onSubmit={createIndex}>
        <div className="dpi-actions"><h2>Index assignment — {assignment.name || assignmentId}</h2><button type="button" onClick={()=>setSetup(false)} disabled={!!busy}>Close</button></div>
        <p>Use the original blank question paper and mark scheme. Connected source PDFs load automatically when available. Saved indexing is reused for this assignment’s selected students.</p>
        {sourceMessage && <p>{sourceMessage}</p>}
        <ExamSetupFields form={indexForm} setForm={setIndexForm} disabled={!!busy} />
        {busy && <p role="status">{busy}</p>}{error && <p role="alert" className="dpi-error">{error}</p>}
        <button className="msv-btn-ai" disabled={!!busy || !qp || !ms}>Index assignment</button>
      </form>
    </div>}
    {view && <div className="dpi-overlay" role="dialog" aria-modal="true" aria-label={view.title}><div className="dpi-workspace"><div className="dpi-actions"><strong>{view.title} — {assignment.name || assignment.title || assignmentId}</strong><button type="button" onClick={()=>setView(null)}>Close</button></div><iframe title={view.title} src={`/drpeter-indexing/index.html?embedded=1&workspace=${provider}${view.hash}`} /></div></div>}
    <PageCountCheckModal state={pageCheckModal} onResolve={resolvePageCheck} />
  </section>;
}
