import ExamSetupFields from "../../drpeter-indexing/src/components/ExamSetupFields.jsx";
import { useEffect, useRef, useState } from 'react';
import api from '../api/api';
import { assertPdfBlob, getApiErrorMessage } from '../utils/markingFormData';
import { withPdfFetchRetry } from '../utils/studentPdfCache';
import './DrPeterIndexingTools.css';

const BASE = '/drpeter-indexing/api';
const stateLabel = state => ({ ready: 'Completed', needs_review: 'Needs review', queued: 'Queued', processing: 'Processing', error: 'Failed', partial: 'Partly completed', cancelled: 'Cancelled' }[state] || state);
export default function DrPeterIndexingTools({ assignment, selectedIds, canMark, gradeModel, loadRoster, onResultsReady }) {
  const [pack, setPack] = useState(null);
  const [runs, setRuns] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [setup, setSetup] = useState(false);
  const [indexForm, setIndexForm] = useState(() => ({ title: assignment.name || assignment.title || '', subject: '', board: '', year: '', paperCode: '', expectedQpLabels: '', expectedMsLabels: '', questionPaper: null, markScheme: null }));
  const qp = indexForm.questionPaper;
  const ms = indexForm.markScheme;
  const [sourceMessage, setSourceMessage] = useState('');
  const [view, setView] = useState(null);
  const readyCallback = useRef(onResultsReady);
  const viewerRevision = useRef('');
  useEffect(() => { readyCallback.current = onResultsReady; }, [onResultsReady]);
  const alive = useRef(true);
  const roster = useRef(loadRoster);
  useEffect(() => { roster.current = loadRoster; }, [loadRoster]);
  const assignmentId = String(assignment.id);

  useEffect(() => {
    alive.current = true;
    let timer;
    async function poll() {
      try {
        const { data } = await api.get(`${BASE}/exams`, { timeout: 30000 });
        const linked = data.filter(row => row.partnerProvider === 'drpeter' && row.partnerAssignmentId === assignmentId);
        const latest = linked[0] || null;
        const runLists = await Promise.all(linked.map(row => api.get(`${BASE}/runs`, { params: { examId: row.id }, timeout: 30000 })));
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
  }, [assignmentId]);

  async function openIndex() {
    setError('');
    if (pack) { setView({ title: 'Review assignment index', hash: `#/exams/${pack.id}` }); return; }
    setSetup(true); setBusy('Loading connected assignment PDFs…'); setSourceMessage('');
    try {
      const students = await roster.current();
      const first = students.find(s => s.submissionId != null);
      if (!first) { setSourceMessage('No connected submission is available. Attach the original QP and mark scheme once.'); return; }
      const results = await Promise.allSettled(['questionPaper','markScheme'].map(kind => api.get(`/drpeter-indexing/partner/assignments/${assignmentId}/submissions/${first.submissionId}/${kind}`, { responseType:'blob', timeout:120000 })));
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
      for (const key of ['title','subject','board','year','paperCode','expectedQpLabels','expectedMsLabels']) form.set(key,indexForm[key]);
      form.set('partnerAssignmentId',assignmentId);form.set('questionPaper',qp);form.set('markScheme',ms);
      const {data}=await api.post(`${BASE}/exams`,form,{timeout:180000});
      if(!alive.current)return;
      setPack(data);setSetup(false);setView({title:'Review assignment index',hash:`#/exams/${data.id}`});
    }catch(err){if(alive.current)setError(await getApiErrorMessage(err));}
    finally{if(alive.current)setBusy('');}
  }

  async function mark(mode) {
    const selected = new Set([...selectedIds].map(String));
    if (!selected.size || !pack || pack.status !== 'ready') return;
    setBusy('Loading selected students…');setError('');
    try {
      // Refresh the full assignment roster: selection may span pages/search results.
      const all=await roster.current();
      const students=all.filter(s=>selected.has(String(s.submissionId)));
      if(students.length!==selected.size)throw new Error('Some selected students are no longer in this assignment. Refresh the viewer and select again.');
      if(students.length>60)throw new Error('Select at most 60 students per indexing run.');
      const form=new FormData();form.set('examId',pack.id);form.set('partnerAssignmentId',assignmentId);form.set('mode',mode);form.set('gradeModel',gradeModel);
      form.set('submissionIds',JSON.stringify(students.map(s=>String(s.submissionId))));
      form.set('studentNames',JSON.stringify(students.map(s=>s.name || `Submission ${s.submissionId}`)));
      for(let i=0;i<students.length;i++) {
        if(!alive.current)return;
        const student=students[i];setBusy(`Loading student PDFs ${i+1}/${students.length}…`);
        const {data}=await withPdfFetchRetry(()=>api.get(`/grading/drpeter/submissions/${student.submissionId}/pdfs/submission`,{responseType:'blob',timeout:120000}));
        await assertPdfBlob(data,`Submission ${student.submissionId}`);
        form.append('studentPapers',new File([data],`submission_${student.submissionId}.pdf`,{type:'application/pdf'}));
      }
      if(!alive.current)return;
      setBusy(`Starting indexing ${mode} marking…`);
      const {data}=await api.post(`${BASE}/runs`,form,{timeout:180000});
      if(!alive.current)return;
      setRuns(previous=>[data,...previous]);setView({title:`Indexing marking — ${mode}`,hash:`#/runs/${data.id}`});
    }catch(err){if(alive.current)setError(await getApiErrorMessage(err));}
    finally{if(alive.current)setBusy('');}
  }

  return <section className="dpi-tools" aria-label="Assignment indexing">
    <div className="dpi-actions">
      <button type="button" className="msv-btn-ai" onClick={openIndex} disabled={loading || !!busy || (!canMark && !pack)}>Index assignment</button>
      <span>{loading ? 'Checking assignment index…' : pack ? `Index: ${pack.status==='ready'?'Reviewed':stateLabel(pack.status)} · ${pack.questionCount} questions · ${pack.totalMarks ?? '?'} marks` : 'Not indexed yet'}</span>
      {!!selectedIds.size && canMark && <>
        <button type="button" className="msv-btn-ai" onClick={()=>mark('instant')} disabled={!!busy || pack?.status!=='ready'}>Mark with indexing (Instant)</button>
        <button type="button" className="msv-btn-ai" onClick={()=>mark('batch')} disabled={!!busy || pack?.status!=='ready'}>Mark with indexing (Batch)</button>
        <span>{selectedIds.size} selected{pack?.status!=='ready'?' — index and approve this assignment first':''}</span>
      </>}
    </div>
    {busy && <p role="status">{busy}</p>}
    {error && <p role="alert" className="dpi-error">{error}</p>}
    {pack?.error && <p className="dpi-error">{pack.error}</p>}
    {runs.length>0 && <p>Completed papers appear in each student’s Results button. Edit them there and use the existing Publish All to return them.</p>}
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
    {view && <div className="dpi-overlay" role="dialog" aria-modal="true" aria-label={view.title}><div className="dpi-workspace"><div className="dpi-actions"><strong>{view.title} — {assignment.name || assignmentId}</strong><button type="button" onClick={()=>setView(null)}>Close</button></div><iframe title={view.title} src={`/drpeter-indexing/index.html?embedded=1${view.hash}`} /></div></div>}
  </section>;
}
