import ExamSetupFields from "../../drpeter-indexing/src/components/ExamSetupFields.jsx";
import { textFromExpectedRows } from "../../drpeter-indexing/src/components/ExpectedQuestionsTable.jsx";
import { useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import api from '../api/api';
import { assertPdfBlob, getApiErrorMessage } from '../utils/markingFormData';
import { sahahlyModelLabel } from '../utils/markingCost';
import { isPublished } from '../utils/gradingStatus';
import { applyPageCountDecision, usePageCountCheck } from '../hooks/usePageCountCheck';
import PageCountCheckModal from './PageCountCheckModal';
import './DrPeterIndexingTools.css';
import useMobileLayout from '../../drpeter-indexing/src/useMobileLayout.js';
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
const RETIRED_INDEXING_MODELS = /^(gemini-1(\.|$)|gemini-1\.5)/i;

const IMPORT_SOURCE_OPTIONS = [
  { id: 'classroom', label: 'Classroom' },
  { id: 'drpeter', label: 'Dr Peter' },
  { id: 'mariamgabalawy', label: 'Mariam Gabalawy' },
];

function readIndexingModel(fallback) {
  try {
    const remembered = localStorage.getItem(INDEXING_MODEL_KEY);
    if (remembered && !RETIRED_INDEXING_MODELS.test(remembered)) return remembered;
    if (remembered) localStorage.removeItem(INDEXING_MODEL_KEY);
  } catch { /* private mode */ }
  if (fallback && !RETIRED_INDEXING_MODELS.test(fallback)) return fallback;
  return DEFAULT_INDEXING_MODEL;
}

const stateLabel = state => ({ ready: 'Completed', needs_review: 'Ready', queued: 'Queued', processing: 'Processing', error: 'Failed', partial: 'Partly completed', cancelled: 'Cancelled' }[state] || state);
export default function DrPeterIndexingTools({ assignment, selectedIds, canMark, gradeModel, loadRoster, onResultsReady, provider = 'drpeter' }) {
  const mobile = useMobileLayout();
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const toolsRef = useRef(null);
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
  const [importOpen, setImportOpen] = useState(false);
  const [importSourceProvider, setImportSourceProvider] = useState('classroom');
  const [importSources, setImportSources] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importSelectedId, setImportSelectedId] = useState('');
  const [importSearch, setImportSearch] = useState('');
  const [denominatorRepair, setDenominatorRepair] = useState(null);
  const [denominatorRepairBusy, setDenominatorRepairBusy] = useState(false);
  const [denominatorRepairConfirming, setDenominatorRepairConfirming] = useState(false);
  const [indexMarkingReady, setIndexMarkingReady] = useState(false);
  const [indexMarkingReadyBusy, setIndexMarkingReadyBusy] = useState(false);
  const [indexMarkingReadyMeta, setIndexMarkingReadyMeta] = useState(null);
  const [readySetupOpen, setReadySetupOpen] = useState(false);
  const [readySetupMode, setReadySetupMode] = useState('instant');
  const [readySetupModel, setReadySetupModel] = useState(DEFAULT_INDEXING_MODEL);
  const readySetupRef = useRef(null);
  const [indexForm, setIndexForm] = useState(() => ({ title: assignment.name || assignment.title || '', subject: '', board: '', year: '', paperCode: '', expectedQpRows: [{ label: '', marks: '' }], expectedMsRows: [{ label: '', marks: '' }], questionPaper: null, markScheme: null }));
  const qp = indexForm.questionPaper;
  const ms = indexForm.markScheme;
  const [sourceMessage, setSourceMessage] = useState('');
  const [view, setView] = useState(null);
  useEffect(() => {
    if (!mobile || (!setup && !importOpen && !view)) return undefined;
    const root = toolsRef.current;
    const overlays = root?.querySelectorAll('.dpi-overlay');
    const dialog = overlays?.[overlays.length - 1];
    if (!dialog) return undefined;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const updateViewport = () => {
      root.style.setProperty('--dpi-viewport-height', `${window.visualViewport?.height || window.innerHeight}px`);
      root.style.setProperty('--dpi-viewport-top', `${window.visualViewport?.offsetTop || 0}px`);
    };
    updateViewport();
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    dialog.querySelector('.dpi-close')?.focus({ preventScroll: true });
    const handleKey = event => {
      if (event.key === 'Escape') {
        const close = dialog.querySelector('.dpi-close:not(:disabled)');
        if (close) { event.preventDefault(); close.click(); }
      }
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], iframe, summary, [tabindex="0"]')].filter(node => node.getClientRects().length);
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
      dialog.removeEventListener('keydown', handleKey);
      root.style.removeProperty('--dpi-viewport-height');
      root.style.removeProperty('--dpi-viewport-top');
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [mobile, setup, importOpen, view]);
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
      if (job.active || job.result) setError('');
      else if (job.error) getApiErrorMessage(job.error).then(setError);
    };
    refresh();
    return subscribeIndexingUploads(refresh);
  }, [uploadKey]);

  useEffect(() => {
    let active = true;
    setIndexMarkingReady(false);
    setIndexMarkingReadyMeta(null);
    setReadySetupOpen(false);
    if (!assignmentId) return undefined;
    api
      .get("/ready-for-index-marking", {
        params: { provider, assignmentId },
        timeout: 30000,
      })
      .then(({ data }) => {
        if (!active) return;
        setIndexMarkingReady(!!data?.ready);
        setIndexMarkingReadyMeta(data || null);
        if (data?.markMode === 'batch' || data?.markMode === 'instant') {
          setReadySetupMode(data.markMode);
        }
        if (data?.gradeModel) setReadySetupModel(data.gradeModel);
      })
      .catch(() => {
        /* status is optional chrome — leave as not ready */
      });
    return () => {
      active = false;
    };
  }, [provider, assignmentId]);

  useEffect(() => {
    if (!readySetupOpen) return undefined;
    const onPointer = (event) => {
      if (readySetupRef.current && !readySetupRef.current.contains(event.target)) {
        setReadySetupOpen(false);
      }
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setReadySetupOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [readySetupOpen]);

  function openReadySetup() {
    if (!canMark || !pack || !["ready", "needs_review"].includes(pack.status)) {
      toast.error("Index this assignment first (status Ready) before marking it ready for auto marking");
      return;
    }
    setReadySetupMode(
      indexMarkingReadyMeta?.markMode === 'batch' ? 'batch' : 'instant'
    );
    setReadySetupModel(
      indexMarkingReadyMeta?.gradeModel ||
        indexingModel ||
        indexingModels.find((m) => m.isDefault)?.id ||
        indexingModels[0]?.id ||
        DEFAULT_INDEXING_MODEL
    );
    setReadySetupOpen(true);
  }

  async function saveReadySetup({ ready = true } = {}) {
    if (ready && !readySetupModel) {
      toast.error("Choose an indexing model for hourly auto marking");
      return;
    }
    setIndexMarkingReadyBusy(true);
    try {
      const { data } = await api.put(
        "/ready-for-index-marking",
        {
          provider,
          assignmentId,
          assignmentName: assignment.name || assignment.title || null,
          ready,
          ...(ready
            ? { markMode: readySetupMode, gradeModel: readySetupModel }
            : {}),
        },
        { timeout: 60000 }
      );
      setIndexMarkingReady(!!data?.ready);
      setIndexMarkingReadyMeta(data || null);
      setReadySetupOpen(false);
      toast.success(data?.message || (ready ? "Marked ready" : "Ready flag cleared"));
    } catch (err) {
      toast.error((await getApiErrorMessage(err)) || "Could not update ready status");
    } finally {
      setIndexMarkingReadyBusy(false);
    }
  }

  async function clearReadyFlag() {
    const ok = window.confirm(
      "Clear the ready flag? Hourly auto index marking will stop for this assignment."
    );
    if (!ok) return;
    await saveReadySetup({ ready: false });
  }

  async function previewDenominatorRepair() {
    const targetMaximum = Number(pack?.totalMarks);
    if (!(targetMaximum > 0)) return;
    setDenominatorRepairBusy(true);
    setError('');
    try {
      const { data } = await api.post('/bulk-question-edit/denominator-repair/preview', {
        source: 'classroom',
        assignmentId,
        targetMaximum,
      });
      setDenominatorRepair(data);
      setDenominatorRepairConfirming(false);
    } catch (err) {
      setError(await getApiErrorMessage(err));
    } finally {
      setDenominatorRepairBusy(false);
    }
  }

  async function applyDenominatorRepair() {
    if (!denominatorRepair || !denominatorRepairConfirming) return;
    setDenominatorRepairBusy(true);
    setError('');
    try {
      const { data } = await api.post('/bulk-question-edit/denominator-repair/apply', {
        source: 'classroom',
        assignmentId,
        targetMaximum: denominatorRepair.targetMaximum,
        confirmed: true,
      });
      const updated = data?.applied?.length || 0;
      const failed = data?.failed?.length || 0;
      toast[failed ? 'warning' : 'success'](
        failed
          ? `Updated ${updated} saved result${updated === 1 ? '' : 's'}; ${failed} could not be repaired.`
          : `Updated ${updated} saved result${updated === 1 ? '' : 's'} to /${denominatorRepair.targetMaximum}.`
      );
      setDenominatorRepair(null);
      readyCallback.current?.();
    } catch (err) {
      setError(await getApiErrorMessage(err));
    } finally {
      setDenominatorRepairBusy(false);
    }
  }

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
        const linked = data.filter(row => row.partnerProvider === provider && row.partnerAssignmentId === assignmentId)
          .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
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

  useEffect(() => {
    if (!importOpen || !canMark) return undefined;
    let cancelled = false;
    setImportLoading(true);
    setImportSources([]);
    setImportSelectedId('');
    api
      .get(`${base}/exams/import-sources`, {
        params: {
          sourceProvider: importSourceProvider,
          excludeAssignmentId: assignmentId,
        },
        timeout: 60000,
      })
      .then(({ data }) => {
        if (!cancelled) setImportSources(Array.isArray(data) ? data : []);
      })
      .catch(async (err) => {
        if (cancelled) return;
        setImportSources([]);
        toast.error((await getApiErrorMessage(err)) || 'Failed to load indexes to import');
      })
      .finally(() => {
        if (!cancelled) setImportLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [importOpen, importSourceProvider, base, assignmentId, canMark]);

  const filteredImportSources = importSources.filter((row) => {
    const q = importSearch.trim().toLowerCase();
    if (!q) return true;
    return String(row.importLabel || row.title || '')
      .toLowerCase()
      .includes(q);
  });

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

  async function importIndex(event) {
    event?.preventDefault?.();
    if (!importSelectedId || !canMark) return;
    setBusy('Importing index…');
    setError('');
    try {
      const { data } = await api.post(
        `${base}/exams/import`,
        { sourceExamId: importSelectedId, partnerAssignmentId: assignmentId },
        { timeout: 120000 }
      );
      if (!alive.current) return;
      setPack(data);
      setImportOpen(false);
      setImportSelectedId('');
      toast.success('Index imported — you can mark with indexing on this assignment now');
      setView({ title: 'Review imported index', hash: `#/exams/${data.id}` });
    } catch (err) {
      const message = await getApiErrorMessage(err);
      if (alive.current) {
        setError(message);
        toast.error(message || 'Import failed');
      }
    } finally {
      if (alive.current) setBusy('');
    }
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

  async function mark(mode, { queue = false } = {}) {
    const selected = new Set([...selectedIds].map(String));
    if (!selected.size || !pack || !['ready', 'needs_review'].includes(pack.status) || !indexingModels.length) return;
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
      const beforeSelected = students.length;
      const withoutAttachment = students.filter((student) => student.hasAttachment === false);
      students = students.filter((student) => student.hasAttachment !== false);
      if (withoutAttachment.length) {
        toast.info(`Skipping ${withoutAttachment.length} student${withoutAttachment.length === 1 ? '' : 's'} without an attached PDF`);
      }
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
        throw new Error(beforeSelected
          ? (beforeCorrected
            ? 'All selected submissions are already corrected. Nothing was uploaded or marked.'
            : 'No selected submissions have an attached PDF and are still eligible for marking.')
          : 'No submissions left to mark.');
      }

      // Index marking sends a different request from normal batch marking, so
      // run the same advisory guard here before the indexed run is queued and
      // any AI tokens are used. This applies to both the Dr Peter and Mariam
      // Gabalawy submission viewers because they share these tools.
      const pageDecision = classroom
        ? await confirmPageCounts({ assignmentId, students })
        : await confirmGradingPageCounts({
          provider,
          assignmentId,
          submissionIds: students.map((student) => student.submissionId),
        });
      const checkedStudents = applyPageCountDecision(students, pageDecision);
      if (!checkedStudents) {
        if (pageDecision?.proceed) {
          toast.info('All selected submissions were skipped because of unexpected page counts');
        }
        return null;
      }
      const pageDropped = students.length - checkedStudents.length;
      if (pageDropped > 0) {
        toast.info(
          `Skipping ${pageDropped} submission${pageDropped === 1 ? '' : 's'} with unexpected page count`
        );
      }
      students = checkedStudents;

      if (queue) {
        report(`Adding ${students.length} student selections to the indexing queue…`);
        const {data} = await api.post('/drpeter-indexing-queue', {
          mode, provider, examId: pack.id, examTitle: pack.title,
          partnerAssignmentId: assignmentId, assignmentName: assignment.name || assignment.title,
          gradeModel: indexingModel,
          submissionIds: students.map(s => String(s.submissionId)),
          studentNames: students.map(s => s.name || `Submission ${s.submissionId}`),
          students,
        }, { timeout: 60000 });
        return data;
      }

      report(`Sending ${students.length} student selections to the server…`);
      const {data}=await api.post(`${base}/runs/server-submissions`, {
        examId: pack.id, partnerAssignmentId: assignmentId, mode, gradeModel: indexingModel,
        submissionIds: students.map(s => String(s.submissionId)),
        studentNames: students.map(s => s.name || `Submission ${s.submissionId}`),
        students,
      }, { timeout: 900000 });
      return data;
    });
    if(data && alive.current) {
      if (queue) {
        toast.success(data.ahead > 0
          ? `Queued — ${data.ahead} ${data.ahead === 1 ? 'job' : 'jobs'} of this mode ahead of it`
          : 'Queued — starting shortly');
        return;
      }
      setRuns(previous=>[data,...previous.filter(run=>run.id!==data.id)]);
      setView({title:`Indexing marking — ${mode}`,hash:`#/runs/${data.id}`});
    }
  }

  const mobileExpandedNow = mobileExpanded || selectedIds.size > 0 || !!busy || runs.some(run => ['queued', 'processing'].includes(run.status));
  return <section className={`dpi-tools ${mobileExpandedNow ? 'dpi-mobile-expanded' : ''}`} aria-label="Assignment indexing" ref={toolsRef}>
    {mobile && <button type="button" className="dpi-mobile-toggle" aria-expanded={mobileExpandedNow} onClick={() => setMobileExpanded(open => !open)}><span><strong>Assignment indexing</strong><small>{loading ? 'Checking index…' : pack ? `${stateLabel(pack.status)} · ${pack.questionCount} questions · ${pack.totalMarks ?? '?'} marks` : 'Set up the question paper & mark scheme'}<br />Index, import & review runs</small></span><span aria-hidden="true">{mobileExpandedNow ? '−' : '+'}</span></button>}
    <div className="dpi-actions">
      <button type="button" className="msv-btn-ai" onClick={openIndex} disabled={loading || !!busy || (!canMark && !pack)}>Index assignment</button>
      {canMark && (
        <button
          type="button"
          className="msv-btn-ai"
          onClick={() => {
            setImportOpen(true);
            setImportSearch('');
            setImportSelectedId('');
            setError('');
          }}
          disabled={loading || !!busy}
        >
          Import index from another assignment
        </button>
      )}
      <span>{loading ? 'Checking assignment index…' : pack ? `Index: ${['ready', 'needs_review'].includes(pack.status)?'Ready':stateLabel(pack.status)} · ${pack.questionCount} questions · ${pack.totalMarks ?? '?'} marks` : 'Not indexed yet'}</span>
      {canMark && ['ready', 'needs_review'].includes(pack?.status) && (
        <div className="dpi-ready-stack">
          {classroom && Number(pack?.totalMarks) > 0 && (
            <button
              type="button"
              className="msv-btn-ai dpi-repair-denominators"
              onClick={previewDenominatorRepair}
              disabled={loading || !!busy || denominatorRepairBusy || indexMarkingReadyBusy}
              title="Preview a repair for old result PDFs that use a previous total"
            >
              {denominatorRepairBusy ? 'Checking saved totals…' : 'Repair old PDF totals'}
            </button>
          )}
          <div className="dpi-ready-menu-wrap" ref={readySetupRef}>
            <button
              type="button"
              className={`msv-btn-ai dpi-ready-index-marking${indexMarkingReady ? ' dpi-ready-index-marking--on' : ''}`}
              onClick={() => (readySetupOpen ? setReadySetupOpen(false) : openReadySetup())}
              disabled={loading || !!busy || indexMarkingReadyBusy || denominatorRepairBusy}
              aria-expanded={readySetupOpen}
              aria-haspopup="dialog"
              title={
                indexMarkingReady
                  ? `Hourly auto index marking is on (${indexMarkingReadyMeta?.markMode || 'instant'} · ${sahahlyModelLabel(indexMarkingReadyMeta?.gradeModel || readySetupModel)}) — click to change or turn off`
                  : 'Confirm index + guidance are final; choose model + Instant/Batch for hourly auto index marking (papers over 25 pages are skipped)'
              }
            >
              {indexMarkingReadyBusy
                ? 'Saving…'
                : indexMarkingReady
                  ? 'Ready for index marking ✓'
                  : 'Ready for index marking'}
            </button>
            {readySetupOpen && (
              <div className="dpi-ready-menu" role="dialog" aria-label="Ready for index marking settings">
                <p className="dpi-ready-menu__blurb">
                  Hourly auto index marking for unmarked papers (≤25 pages). Choose the model and Instant or Batch for this assignment.
                </p>
                <label className="dpi-ready-menu__field">
                  <span>Mode</span>
                  <select
                    value={readySetupMode}
                    onChange={(e) => setReadySetupMode(e.target.value === 'batch' ? 'batch' : 'instant')}
                    disabled={indexMarkingReadyBusy}
                  >
                    <option value="instant">Instant</option>
                    <option value="batch">Batch</option>
                  </select>
                </label>
                <label className="dpi-ready-menu__field">
                  <span>Model</span>
                  <select
                    value={readySetupModel}
                    onChange={(e) => setReadySetupModel(e.target.value)}
                    disabled={indexMarkingReadyBusy || !indexingModels.length}
                  >
                    {!indexingModels.length && (
                      <option value={readySetupModel}>Loading models…</option>
                    )}
                    {indexingModels.map((m) => (
                      <option key={m.id} value={m.id}>{sahahlyModelLabel(m.id)}</option>
                    ))}
                  </select>
                </label>
                <div className="dpi-ready-menu__actions">
                  <button
                    type="button"
                    className="msv-btn-ai"
                    onClick={() => saveReadySetup({ ready: true })}
                    disabled={indexMarkingReadyBusy || !readySetupModel || !indexingModels.length}
                  >
                    {indexMarkingReady ? 'Save settings' : 'Mark ready'}
                  </button>
                  {indexMarkingReady && (
                    <button
                      type="button"
                      className="msv-btn-ai dpi-ready-menu__clear"
                      onClick={clearReadyFlag}
                      disabled={indexMarkingReadyBusy}
                    >
                      Turn off
                    </button>
                  )}
                  <button
                    type="button"
                    className="msv-btn-ai dpi-ready-menu__cancel"
                    onClick={() => setReadySetupOpen(false)}
                    disabled={indexMarkingReadyBusy}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
          {indexMarkingReady && indexMarkingReadyMeta?.lastSweepNote && (
            <span className="dpi-ready-note" title={indexMarkingReadyMeta.lastSweepNote}>
              Last auto-check: {indexMarkingReadyMeta.lastSweepNote}
            </span>
          )}
          {indexMarkingReady && (indexMarkingReadyMeta?.markMode || indexMarkingReadyMeta?.gradeModel) && (
            <span className="dpi-ready-note" title="Hourly auto marking settings">
              Auto: {indexMarkingReadyMeta.markMode === 'batch' ? 'Batch' : 'Instant'}
              {indexMarkingReadyMeta.gradeModel
                ? ` · ${sahahlyModelLabel(indexMarkingReadyMeta.gradeModel)}`
                : ''}
            </span>
          )}
        </div>
      )}
      {!!selectedIds.size && canMark && <>
        <label className="dpi-model">
          <span>Indexing model</span>
          <select
            value={indexingModel}
            onChange={e => chooseIndexingModel(e.target.value)}
            disabled={!!busy || !['ready', 'needs_review'].includes(pack?.status) || !indexingModels.length}
            aria-label="Indexing marking model"
          >
            {!indexingModels.length && <option value={indexingModel}>Loading indexing models…</option>}
            {indexingModels.map(m => (
              <option key={m.id} value={m.id}>{sahahlyModelLabel(m.id)}</option>
            ))}
          </select>
        </label>
        <button type="button" className="msv-btn-ai" onClick={()=>mark('instant')} disabled={!!busy || !['ready', 'needs_review'].includes(pack?.status) || !indexingModels.length}>Mark with indexing (Instant)</button>
        <button type="button" className="msv-btn-ai" onClick={()=>mark('batch')} disabled={!!busy || !['ready', 'needs_review'].includes(pack?.status) || !indexingModels.length}>Mark with indexing (Batch)</button>
        <button type="button" className="msv-btn-ai" onClick={()=>mark('luna')} disabled={!!busy || !['ready', 'needs_review'].includes(pack?.status)} title="Mark with Sahahly Luna Instant (OpenAI)">Mark with Sahahly Luna (Instant)</button>
        <button type="button" className="msv-btn-ai" onClick={()=>mark('luna_batch')} disabled={!!busy || !['ready', 'needs_review'].includes(pack?.status)} title="Mark with Sahahly Luna Batch (OpenAI Batch API · half price)">Mark with Sahahly Luna (Batch)</button>
        <button type="button" className="msv-btn-ai" onClick={()=>mark('instant', {queue: true})} disabled={!!busy || !['ready', 'needs_review'].includes(pack?.status) || !indexingModels.length} title="Add to the Indexing Queue instead of starting immediately">Queue with indexing (Instant)</button>
        <button type="button" className="msv-btn-ai" onClick={()=>mark('batch', {queue: true})} disabled={!!busy || !['ready', 'needs_review'].includes(pack?.status) || !indexingModels.length} title="Add to the Indexing Queue instead of starting immediately">Queue with indexing (Batch)</button>
        <span>{selectedIds.size} selected · {sahahlyModelLabel(indexingModel)}{!['ready', 'needs_review'].includes(pack?.status)?' — index this assignment first':''}</span>
      </>}
    </div>
    {busy && <p role="status">{busy}</p>}
    {runs.filter(run=>['queued','processing'].includes(run.status)).map(run=><div key={run.id} role="status">
      <strong>{{ instant: 'Instant marking', batch: 'Batch marking', flex: 'Flex marking', luna: 'Sahahly Luna marking', luna_batch: 'Sahahly Luna Batch marking' }[run.mode] || 'Marking'}: {run.readyCount}/{run.paperCount} completed · {run.failedCount || 0} failed</strong>
      <progress value={run.readyCount + (run.failedCount || 0)} max={run.paperCount || 1} />
      <button type="button" onClick={()=>setView({title:'Marking progress',hash:`#/runs/${run.id}`})}>View live progress</button>
      <p>Marking continues on the server when you leave this tab.</p>
    </div>)}
    {error && <p role="alert" className="dpi-error">{error}</p>}
    {pack?.error && <p className="dpi-error">{pack.error}</p>}
    {runs.length>0 && <p>Completed papers appear in each student’s Results button. Edit them there and use the existing {classroom ? 'Return All' : 'Publish All'} to return them.</p>}
    {runs.length>0 && <details><summary>Indexing results ({runs.length} runs)</summary><div className="dpi-runs">{runs.map(run=><button type="button" key={run.id} onClick={()=>setView({title:'Indexing results',hash:`#/runs/${run.id}`})}>{stateLabel(run.status)} · {run.mode} · {run.readyCount}/{run.paperCount} completed{run.failedCount?` · ${run.failedCount} failed`:''} · {new Date(run.createdAt).toLocaleString()}</button>)}</div></details>}
    {denominatorRepair && <div className="dpi-overlay" role="dialog" aria-modal="true" aria-label="Repair old PDF totals">
      <div className="dpi-dialog dpi-repair-dialog">
        <div className="dpi-modal-header">
          <h2>Repair old PDF totals</h2>
          <button type="button" className="dpi-close" onClick={() => setDenominatorRepair(null)} disabled={denominatorRepairBusy} aria-label="Close total repair">×<span>Close</span></button>
        </div>
        <p>
          The live index is out of <strong>{denominatorRepair.targetMaximum}</strong>. This will update only the saved denominator and percentage for old results; it will not re-mark work or change awarded marks.
        </p>
        {denominatorRepair.affected === 0 ? (
          <p className="dpi-repair-ok">Every saved result already uses /{denominatorRepair.targetMaximum}.</p>
        ) : (
          <>
            <div className="dpi-repair-summary">
              <strong>{denominatorRepair.affected} saved result{denominatorRepair.affected === 1 ? '' : 's'} will change</strong>
              <span>{denominatorRepair.returned} already returned PDF{denominatorRepair.returned === 1 ? '' : 's'} will be ready to return again.</span>
            </div>
            {denominatorRepair.questionTotalMismatch > 0 && (
              <p className="dpi-repair-warning">
                {denominatorRepair.questionTotalMismatch} result{denominatorRepair.questionTotalMismatch === 1 ? '' : 's'} still contain question rows whose maxima do not add up to /{denominatorRepair.targetMaximum}. This repair fixes the displayed denominator only; remove any duplicated question separately if it changed awarded marks.
              </p>
            )}
            <ul className="dpi-repair-list">
              {denominatorRepair.rows.map((row) => <li key={row.submissionId}><span>{row.studentName}</span><strong>/{row.before} → /{row.after}</strong>{row.returned && <em>returned</em>}</li>)}
            </ul>
            {denominatorRepair.affected > denominatorRepair.rows.length && <p>Plus {denominatorRepair.affected - denominatorRepair.rows.length} more saved results.</p>}
            <label className="dpi-repair-confirm"><input type="checkbox" checked={denominatorRepairConfirming} onChange={event => setDenominatorRepairConfirming(event.target.checked)} /> I reviewed the preview and want to update these saved result totals.</label>
            <div className="dpi-repair-actions">
              <button type="button" onClick={() => setDenominatorRepair(null)} disabled={denominatorRepairBusy}>Cancel</button>
              <button type="button" className="msv-btn-ai" onClick={applyDenominatorRepair} disabled={!denominatorRepairConfirming || denominatorRepairBusy}>{denominatorRepairBusy ? 'Repairing…' : `Repair ${denominatorRepair.affected} result${denominatorRepair.affected === 1 ? '' : 's'}`}</button>
            </div>
          </>
        )}
      </div>
    </div>}
    {setup && <div className="dpi-overlay" role="dialog" aria-modal="true" aria-label="Index assignment">
      <form className="dpi-dialog" onSubmit={createIndex}>
        <div className="dpi-modal-header"><h2>Index assignment — {assignment.name || assignmentId}</h2><button type="button" className="dpi-close" onClick={()=>setSetup(false)} disabled={!!busy} aria-label="Close index assignment">×<span>Close</span></button></div>
        <p>Use the original blank question paper and mark scheme. Connected source PDFs load automatically when available. Saved indexing is reused for this assignment’s selected students.</p>
        {sourceMessage && <p>{sourceMessage}</p>}
        <ExamSetupFields form={indexForm} setForm={setIndexForm} disabled={!!busy} />
        {busy && <p role="status">{busy}</p>}{error && <p role="alert" className="dpi-error">{error}</p>}
        <button className="msv-btn-ai" disabled={!!busy || !qp || !ms}>Index assignment</button>
      </form>
    </div>}
    {importOpen && (
      <div className="dpi-overlay" role="dialog" aria-modal="true" aria-label="Import index from another assignment">
        <form className="dpi-dialog dpi-import-dialog" onSubmit={importIndex}>
          <div className="dpi-modal-header">
            <h2>Import index — {assignment.name || assignment.title || assignmentId}</h2>
            <button
              type="button"
              className="dpi-close"
              onClick={() => setImportOpen(false)}
              disabled={!!busy}
              aria-label="Close import index"
            >
              ×<span>Close</span>
            </button>
          </div>
          <p>
            Choose a ready index from Classroom, Dr Peter, or Mariam Gabalawy. The pack and
            QP/MS PDFs are copied onto this assignment so you can mark with indexing without
            re-indexing.
          </p>
          <label className="dpi-import-field">
            Source
            <select
              value={importSourceProvider}
              onChange={(e) => setImportSourceProvider(e.target.value)}
              disabled={!!busy || importLoading}
            >
              {IMPORT_SOURCE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label className="dpi-import-field">
            Search
            <input
              type="search"
              value={importSearch}
              onChange={(e) => setImportSearch(e.target.value)}
              placeholder="Filter by classroom or assignment name"
              disabled={!!busy || importLoading}
            />
          </label>
          <div className="dpi-import-list" role="listbox" aria-label="Indexes available to import">
            {importLoading && <p role="status">Loading ready indexes…</p>}
            {!importLoading && filteredImportSources.length === 0 && (
              <p>No ready indexes found for this source (or none you can access).</p>
            )}
            {!importLoading &&
              filteredImportSources.map((row) => (
                <label
                  key={row.id}
                  className={`dpi-import-option ${importSelectedId === row.id ? 'dpi-import-option--on' : ''}`}
                >
                  <input
                    type="radio"
                    name="import-exam"
                    value={row.id}
                    checked={importSelectedId === row.id}
                    onChange={() => setImportSelectedId(row.id)}
                    disabled={!!busy}
                  />
                  <span>
                    <strong>{row.importLabel || row.title || 'Untitled index'}</strong>
                    <em>
                      {row.questionCount || 0} questions · {row.totalMarks ?? '?'} marks ·{' '}
                      {stateLabel(row.status)}
                      {row.updatedAt ? ` · ${new Date(row.updatedAt).toLocaleString()}` : ''}
                    </em>
                  </span>
                </label>
              ))}
          </div>
          {busy && <p role="status">{busy}</p>}
          {error && <p role="alert" className="dpi-error">{error}</p>}
          <button
            type="submit"
            className="msv-btn-ai"
            disabled={!!busy || importLoading || !importSelectedId}
          >
            Import selected index
          </button>
        </form>
      </div>
    )}
    {view && <div className="dpi-overlay" role="dialog" aria-modal="true" aria-label={view.title}><div className="dpi-workspace"><div className="dpi-modal-header"><strong>{view.title} — {assignment.name || assignment.title || assignmentId}</strong><button type="button" className="dpi-close" onClick={()=>setView(null)} aria-label="Close indexing workspace">×<span>Close</span></button></div><iframe title={view.title} src={`/drpeter-indexing/index.html?embedded=1&workspace=${provider}${view.hash}`} /></div></div>}
    <PageCountCheckModal state={pageCheckModal} onResolve={resolvePageCheck} />
  </section>;
}
