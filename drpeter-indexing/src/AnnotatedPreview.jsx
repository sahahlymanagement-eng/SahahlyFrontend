import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import { Icon, Loading } from "./ui.jsx";

GlobalWorkerOptions.workerSrc = workerUrl;

const MIN_Y = 5;
const MAX_Y = 92;
const MIN_NOTE_H = 4;
const MAX_NOTE_H = 48;
const MIN_COL = 14;
const MAX_COL = 42;
// Keep in sync with BADGE_BLOCK_H / a typical page height in server/annotate.js.
const BADGE_BLOCK_PERCENT = 6.2;

const clampY = (v) => Math.min(MAX_Y, Math.max(MIN_Y, v));
const clampNoteH = (v) => Math.min(MAX_NOTE_H, Math.max(MIN_NOTE_H, v));
const clampCol = (v) => Math.min(MAX_COL, Math.max(MIN_COL, v));

/**
 * Starting height for a note box the teacher has not resized yet, so the
 * overlay roughly matches what the renderer will draw.
 */
function estimateNoteHeight(question) {
  const chars = String(question.examinerNotes || "").length;
  return clampNoteH(5 + Math.ceil(chars / 90) * 2.6);
}

/** One lazily-rasterized PDF page. */
function PdfPage({ pdf, pageNumber, renderWidth, onSize, children }) {
  const holderRef = useRef(null);
  const canvasRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [failed, setFailed] = useState(0);
  const [pageError, setPageError] = useState(null);
  const [ratio, setRatio] = useState(1.414);

  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setVisible(true)),
      { rootMargin: "400px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !pdf) return;
    let cancelled = false;
    let task = null;
    // The external PDF renderer is being replaced; reset its visible error.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPageError(null);
    const timeout = setTimeout(() => { if (!cancelled) { setPageError('Page rendering timed out.'); task?.cancel(); } }, 30000);

    (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled) return;
        const base = page.getViewport({ scale: 1 });
        setRatio(base.height / base.width);
        onSize?.(pageNumber, { width: base.width, height: base.height });

        const scale = renderWidth / base.width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        task = page.render({ canvasContext: canvas.getContext("2d"), viewport });
        await task.promise;
        clearTimeout(timeout);
      } catch (err) {
        clearTimeout(timeout);
        if (!cancelled) setPageError(err.message || "Unable to render page");
        // pdfjs occasionally leaves a permanently blank canvas; retry twice.
        if (!cancelled && err?.name !== "RenderingCancelledException" && failed < 2) {
          setTimeout(() => setFailed((n) => n + 1), 100 * (failed + 1));
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      task?.cancel();
    };
  }, [visible, pdf, pageNumber, renderWidth, failed, onSize]);

  return (
    <div className="ap-page" ref={holderRef} data-page={pageNumber}>
      <div className="ap-page-inner" style={{ paddingBottom: `${ratio * 100}%` }}>
        <canvas ref={canvasRef} className="ap-canvas" />
        {children}
      </div>
      {pageError && <div role="alert">{pageError} <button onClick={() => setFailed(n => n + 1)}>Retry page</button></div>}
      <span className="ap-page-num">{pageNumber}</span>
    </div>
  );
}

/**
 * Annotated-PDF preview with draggable placement handles.
 *
 * The PDF is rasterized to canvases; the handles are plain HTML positioned on
 * top in percentages, so they line up with wherever the renderer will draw.
 * Drags update local state for immediate feedback and only tell the parent on
 * pointer-up.
 */
export default function AnnotatedPreview({
  url,
  studentPageCount = 0,
  questions = [],
  columnPercent = 23,
  onPlacementChange,
}) {
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const [dragKey, setDragKey] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [error, setError] = useState(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [local, setLocal] = useState({});
  const [localColumn, setLocalColumn] = useState(null);
  const editable = typeof onPlacementChange === "function";

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    // Clear the old external PDF document while the new URL loads.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPdf(null);
    setError(null);
    // A fresh URL means the server has re-rendered; drop local overrides.
    setLocal({});
    setLocalColumn(null);

    const task = getDocument({ url });
    const destroy = () => { task.destroy().catch(() => {}); };
    const timeout = setTimeout(() => {
      if (cancelled) return;
      cancelled = true;
      setError("The marked PDF took too long to load. Please retry.");
      destroy();
    }, 60000);
    task.promise.then(
      (doc) => { clearTimeout(timeout); if (!cancelled) setPdf(doc); },
      (err) => { clearTimeout(timeout); if (!cancelled) setError(err?.message || "Could not open the PDF"); }
    );
    return () => {
      cancelled = true;
      clearTimeout(timeout);
      destroy();
    };
  }, [url, loadAttempt]);

  const effectiveColumn = localColumn ?? columnPercent;
  // The cover/breakdown pages sit in front, and how many there are depends on
  // how long the breakdown ran. Derive it rather than guess.
  const reportPageCount = pdf && studentPageCount ? Math.max(0, pdf.numPages - studentPageCount) : 0;

  const rows = useMemo(
    () =>
      questions.map((q) => {
        const override = local[q.id] || {};
        return {
          ...q,
          page: override.page ?? q.page,
          yPercent: override.yPercent ?? q.yPercent,
          noteHeightPercent:
            override.noteHeightPercent ?? q.noteHeightPercent ?? estimateNoteHeight(q),
        };
      }),
    [questions, local]
  );

  const byPage = useMemo(() => {
    const map = new Map();
    for (const q of rows) {
      if (!map.has(q.page)) map.set(q.page, []);
      map.get(q.page).push(q);
    }
    return map;
  }, [rows]);

  /** Which student page, and how far down it, is the pointer over? */
  const hitTest = useCallback(
    (clientY) => {
      const root = scrollRef.current;
      if (!root) return null;
      const pages = [...root.querySelectorAll(".ap-page-inner")];
      let nearest = null;
      let nearestGap = Infinity;

      for (const el of pages) {
        const pageNumber = Number(el.parentElement.dataset.page);
        const studentPage = pageNumber - reportPageCount;
        if (studentPage < 1) continue;
        const rect = el.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          return {
            studentPage,
            yPercent: clampY(((clientY - rect.top) / rect.height) * 100),
          };
        }
        const gap = clientY < rect.top ? rect.top - clientY : clientY - rect.bottom;
        if (gap < nearestGap) {
          nearestGap = gap;
          nearest = { studentPage, yPercent: clientY < rect.top ? MIN_Y : MAX_Y };
        }
      }
      return nearest;
    },
    [reportPageCount]
  );

  const startDrag = (event, mode, question, edge) => {
    if (!editable) return;
    event.preventDefault();
    event.stopPropagation();
    const box = event.currentTarget.closest(".ap-note, .ap-column-grip");
    const pageEl = event.currentTarget.closest(".ap-page-inner");
    const pageRect = pageEl?.getBoundingClientRect();
    const boxRect = box?.getBoundingClientRect();

    dragRef.current = {
      mode,
      edge,
      id: question?.id ?? "__column__",
      page: question?.page ?? 1,
      startY: question?.yPercent ?? 30,
      startHeight: question?.noteHeightPercent ?? 8,
      startWidth: effectiveColumn,
      startClientX: event.clientX,
      startClientY: event.clientY,
      pageWidth: pageRect?.width || 1,
      pageHeight: pageRect?.height || 1,
      // Grab offset keeps the box from jumping to the cursor on pick-up.
      grabOffsetY: boxRect ? event.clientY - (boxRect.top + boxRect.height / 2) : 0,
    };
    setDragKey(`${mode}:${dragRef.current.id}:${edge || ""}`);
  };

  /** Arrow keys on a focused badge, for placement finer than a drag allows. */
  const nudge = (event, question) => {
    if (!editable) return;
    const step = event.shiftKey ? 2 : 0.4;
    const pageStep = event.key === "PageUp" ? -1 : event.key === "PageDown" ? 1 : 0;
    let dy = 0;
    if (event.key === "ArrowUp") dy = -step;
    else if (event.key === "ArrowDown") dy = step;
    else if (!pageStep) return;

    event.preventDefault();
    const lastPage = studentPageCount || question.page || 1;
    const page = Math.min(lastPage, Math.max(1, (question.page || 1) + pageStep));
    const yPercent = clampY((question.yPercent ?? 30) + dy);
    setLocal((prev) => ({ ...prev, [question.id]: { ...prev[question.id], page, yPercent } }));
    onPlacementChange({ id: question.id, page, yPercent });
  };

  useEffect(() => {
    if (!dragKey) return;

    const onMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.mode === "column") {
        // Dragging the spine left widens the column.
        const dx = event.clientX - drag.startClientX;
        drag.currentWidth = clampCol(drag.startWidth - (dx / drag.pageWidth) * 100);
        setLocalColumn(drag.currentWidth);
        return;
      }

      if (drag.mode === "height") {
        const dyPct = ((event.clientY - drag.startClientY) / drag.pageHeight) * 100;
        let height;
        let y;
        if (drag.edge === "top") {
          // Bottom edge stays put while the top moves.
          height = clampNoteH(drag.startHeight - dyPct);
          y = clampY(drag.startY + drag.startHeight / 2 - height / 2);
        } else {
          height = clampNoteH(drag.startHeight + dyPct);
          y = clampY(drag.startY - drag.startHeight / 2 + height / 2);
        }
        drag.currentY = y;
        drag.currentHeight = height;
        setLocal((prev) => ({
          ...prev,
          [drag.id]: { ...prev[drag.id], page: drag.page, yPercent: y, noteHeightPercent: height },
        }));
        return;
      }

      const anchor = event.clientY - (drag.grabOffsetY || 0);
      const hit = hitTest(anchor);
      if (!hit) return;

      // Auto-scroll near the edges so a box can be dragged to another page.
      const root = scrollRef.current;
      if (root) {
        const rect = root.getBoundingClientRect();
        if (event.clientY < rect.top + 48) root.scrollTop -= 12;
        else if (event.clientY > rect.bottom - 48) root.scrollTop += 12;
      }

      drag.currentPage = hit.studentPage;
      drag.currentY = hit.yPercent;
      setLocal((prev) => ({
        ...prev,
        [drag.id]: { ...prev[drag.id], page: hit.studentPage, yPercent: hit.yPercent },
      }));
    };

    const onUp = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      setDragKey(null);
      if (!drag) return;

      if (drag.mode === "column") {
        onPlacementChange({ columnPercent: drag.currentWidth ?? drag.startWidth });
        return;
      }
      onPlacementChange({
        id: drag.id,
        page: drag.currentPage ?? drag.page,
        yPercent: drag.currentY ?? drag.startY,
        noteHeightPercent: drag.mode === "height" ? drag.currentHeight : undefined,
      });
    };

    // On window, so a drag survives the pointer leaving the handle.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragKey, hitTest, onPlacementChange]);

  if (error) return <div role="alert"><p className="error">{error}</p><button type="button" onClick={() => setLoadAttempt((n) => n + 1)}>Retry PDF</button></div>;
  if (!pdf) return <Loading text="Rendering the marked script…" />;

  const pageNumbers = Array.from({ length: pdf.numPages }, (_, i) => i + 1);
  const renderWidth = Math.min(1600, Math.round(900 * zoom));

  return (
    <div className="ap">
      <div className="ap-toolbar">
        {editable ? (
          <span className="ap-hint">
            <Icon name="drag" size={14} />
            Drag a <b>badge</b> to move it, a <b>note edge</b> to resize, the{" "}
            <b>column spine</b> to rewidth. Arrow keys nudge a focused badge.
          </span>
        ) : (
          <span className="ap-hint">Preview</span>
        )}
        <span className="ap-spacer" />
        <button
          type="button"
          className="icon-button"
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
          aria-label="Zoom out"
        >
          <Icon name="zoomOut" size={14} />
        </button>
        <span className="ap-zoom">{Math.round(zoom * 100)}%</span>
        <button
          type="button"
          className="icon-button"
          onClick={() => setZoom((z) => Math.min(2, z + 0.25))}
          aria-label="Zoom in"
        >
          <Icon name="zoomIn" size={14} />
        </button>
        <button type="button" className="ghost tiny" onClick={() => setZoom(1)}>
          Reset
        </button>
      </div>

      <div className="ap-scroll" ref={scrollRef}>
        {pageNumbers.map((pageNumber) => {
          const studentPage = pageNumber - reportPageCount;
          const pageRows = studentPage > 0 ? byPage.get(studentPage) || [] : [];

          return (
            <PdfPage key={`${url}-${pageNumber}-${renderWidth}`} pdf={pdf} pageNumber={pageNumber} renderWidth={renderWidth}>
              {studentPage > 0 && editable && (
                <div
                  className="ap-column-grip"
                  style={{ right: `${effectiveColumn}%` }}
                  onPointerDown={(e) => startDrag(e, "column", null)}
                  title="Drag to resize the examiner column"
                />
              )}

              {pageRows.map((q) => {
                const ratio = (Number(q.maxMarks) || 0) > 0 ? q.obtained / q.maxMarks : 0;
                const tone = ratio >= 0.75 ? "good" : ratio >= 0.5 ? "part" : "bad";
                return (
                  <div key={q.id} className="ap-marker" style={{ top: `${q.yPercent}%` }}>
                    <div
                      className={`ap-badge ${tone} ${dragKey?.startsWith(`move:${q.id}`) ? "active" : ""}`}
                      onPointerDown={(e) => startDrag(e, "move", q)}
                      onKeyDown={(e) => nudge(e, q)}
                      tabIndex={editable ? 0 : -1}
                      role={editable ? "button" : undefined}
                      title={`${q.label} — drag to reposition, arrow keys to nudge`}
                    >
                      <b>{q.label}</b>
                      <span>
                        {q.obtained}/{q.maxMarks}
                      </span>
                    </div>
                    <div
                      className={`ap-note ${tone}`}
                      style={{
                        left: `${100 - effectiveColumn}%`,
                        width: `${effectiveColumn}%`,
                        height: `${q.noteHeightPercent}%`,
                      }}
                    >
                      {editable && (
                        <span
                          className="ap-edge top"
                          onPointerDown={(e) => startDrag(e, "height", q, "top")}
                        />
                      )}
                      <span className="ap-note-head">{q.label}</span>
                      <span className="ap-note-text">{q.examinerNotes}</span>
                      {editable && (
                        <span
                          className="ap-edge bottom"
                          onPointerDown={(e) => startDrag(e, "height", q, "bottom")}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </PdfPage>
          );
        })}
      </div>
    </div>
  );
}
