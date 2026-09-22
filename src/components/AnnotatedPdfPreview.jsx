import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { flushSync } from "react-dom";
import MobilePlacementControls from "./MobilePlacementControls";
import usePhoneLayout from "../hooks/usePhoneLayout";
import {
  FiChevronLeft,
  FiChevronRight,
  FiZoomIn,
  FiZoomOut,
  FiMaximize2,
  FiMinimize2,
  FiExternalLink,
} from "react-icons/fi";
import "../utils/uint8ArrayToHexPolyfill";
// Legacy build includes browser polyfills (e.g. Uint8Array#toHex) so PDF preview
// works on Chromium/Edge builds that don't ship that API yet.
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { buildDuplicateQuestionNumberSet, formatQuestionLabelWithPage } from "../utils/questionLabelDisplay";
import { placementKey, normalizeQuestionLabelInput } from "../utils/markingFormData";
import { resolveBadgeYPercentsForPage } from "../utils/normalizeQuestionPlacement";
import { hasPdfHeader, readLocalPdfPreview } from "../utils/localPdfPreviewStore";
import {
  clampExaminerColumnWidthPercent,
  clampNoteBoxHeightPercent,
  examinerColumnWidthPercentFromQuestions,
  estimateNoteBoxHeightPercent,
  MIN_NOTE_BOX_HEIGHT_PCT,
} from "../utils/examinerColumnLayout";

// Stable public URL (see vite-plugin-pdf-worker.js). Hashed /assets/*.mjs workers
// fail on production ("Setting up fake worker failed: Failed to fetch…mjs").
const base = String(import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
GlobalWorkerOptions.workerSrc = `${base}pdf.worker.min.js`;

function friendlyPdfLoadError(err) {
  const raw = String(err?.message || err || "").trim();
  if (/fake worker|pdf\.worker|dynamically imported module/i.test(raw)) {
    return "PDF viewer failed to start. Hard-refresh the page (Ctrl+Shift+R), then Retry.";
  }
  if (/^network error$/i.test(raw) || err?.name === "NetworkError") {
    return "Could not load this PDF preview (network blip or stale file). Click Retry.";
  }
  if (/invalid root reference|invalid xref|xref.*(invalid|missing)|trailer.*root/i.test(raw)) {
    return "The generated preview was incomplete. Sahahly is rebuilding it automatically.";
  }
  // A raw JS crash ("Cannot access 'x' before initialization", "x is not
  // defined") almost always means this tab is still running old code after a
  // deploy — the fix is a hard refresh, not a Retry of the same stale bundle.
  if (["ReferenceError", "TypeError", "SyntaxError"].includes(err?.name)) {
    return "PDF viewer crashed. Hard-refresh the page (Ctrl+Shift+R), then Retry.";
  }
  return raw || "Failed to load PDF preview";
}

/** Read blob/object URLs into bytes so pdf.js never XHRs a revoked object URL. */
async function loadPdfDocumentFromUrl(url) {
  const retained = readLocalPdfPreview(url);
  if (retained?.byteLength) {
    if (!hasPdfHeader(retained)) {
      throw new Error("Generated preview is not a valid PDF (missing %PDF- header)");
    }
    const loadingTask = getDocument({
      data: retained.slice(),
      disableAutoFetch: true,
      disableStream: true,
    });
    return loadingTask.promise;
  }
  let res;
  let lastError;
  // Object/blob URLs are local, but a React preview swap can briefly race the
  // old URL's cleanup. Retry the local handoff before declaring the PDF dead.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to read preview PDF (${res.status})`);
      break;
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, attempt === 0 ? 250 : 1_000));
      }
    }
  }
  if (!res?.ok) throw lastError || new Error("Failed to read preview PDF");
  const data = await res.arrayBuffer();
  if (data.byteLength < 100) {
    throw new Error("Preview PDF is empty");
  }
  if (!hasPdfHeader(data)) {
    throw new Error("Generated preview is not a valid PDF (missing %PDF- header)");
  }
  const loadingTask = getDocument({
    data: new Uint8Array(data),
    disableAutoFetch: true,
    disableStream: true,
  });
  return loadingTask.promise;
}

// iOS/iPadOS Safari (WKWebView) enforces a per-tab canvas memory ceiling far
// below desktop Chrome's — well documented around ~200-300MB combined vs.
// several GB — and blows past it silently: the tab is killed by the OS and
// Safari auto-reloads it, which is exactly the "scroll glitches and the page
// refreshes" symptom, and only on a large (image-heavy) PDF because that's
// what pushes total live canvas memory over that lower ceiling. iPadOS
// reports its UA as a Mac, so the standard sniff is touch points on a Mac
// platform string; regular Macs (mouse/trackpad only) report maxTouchPoints 0.
const IS_LOW_MEMORY_CANVAS_DEVICE =
  typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent || "") ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

const MAX_RENDER_WIDTH = 720;
const MAX_RENDER_PIXEL_WIDTH = IS_LOW_MEMORY_CANVAS_DEVICE ? 1600 : 3200;
// Backing-pixel budget per rendered page canvas (width*height, before DPR
// already folded in below). Halved on the low-memory devices above so the
// same page count/size holds far less live canvas memory at once.
const CANVAS_PIXEL_BUDGET = IS_LOW_MEMORY_CANVAS_DEVICE ? 3_000_000 : 8_000_000;
// How far outside the viewport a rendered page is kept before its canvas is
// freed (see the unload observer in LazyPdfPage). Smaller on low-memory
// devices so fewer pages stay resident at once for a given scroll position.
const UNLOAD_MARGIN_PX = IS_LOW_MEMORY_CANVAS_DEVICE ? 600 : 1600;
// How far ahead of the viewport a page starts rasterizing, so it's
// (hopefully) already done by the time it's actually visible instead of the
// reader catching it mid-render. Kept comfortably below UNLOAD_MARGIN_PX so
// a page doesn't render and get freed again in the same breath.
const RENDER_MARGIN_PX = IS_LOW_MEMORY_CANVAS_DEVICE ? 450 : 800;
// Width of the cached low-res placeholder image (see thumbnail state in
// LazyPdfPage) — tiny on purpose, this is a blurry stand-in, not a preview.
const THUMBNAIL_WIDTH_PX = 96;
const RENDER_ZOOM_DEBOUNCE_MS = 120;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP_BTN = 0.1;
const ZOOM_WHEEL_STEP = 0.08;
const DEFAULT_ZOOM = 1;
const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
// How far EACH contact in a two-pointer gesture must move from its own
// starting point before the gesture is treated as a pinch (see
// handleScrollAreaPointerMove) rather than a scroll with an incidental
// second, resting contact.
const PINCH_MIN_PER_POINTER_MOVE_PX = 10;

function clampZoom(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_ZOOM;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(n * 100) / 100));
}

function pointerDistance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function clampYPercent(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 30;
  return Math.min(92, Math.max(5, Math.round(v * 100) / 100));
}

/** Whether `el` is currently within `marginPx` of `root`'s viewport — used to
 * make the same "is this near the viewport" call the unload IntersectionObserver
 * makes, but synchronously, for the race described where a render finishes
 * after the observer's "left the zone" event already fired. */
function isElementNearRoot(el, root, marginPx) {
  if (!el || !root) return true;
  const elRect = el.getBoundingClientRect();
  const rootRect = root.getBoundingClientRect();
  return elRect.bottom >= rootRect.top - marginPx && elRect.top <= rootRect.bottom + marginPx;
}

function LabelEditor({ initial, onCommit, onCancel }) {
  const ref = useRef(null);
  const [value, setValue] = useState(initial);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  return (
    <input
      ref={ref}
      className="pdf-place-handle__label-input"
      value={value}
      aria-label="Question label"
      onChange={(e) => setValue(e.target.value)}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") {
          e.preventDefault();
          onCommit(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      onBlur={() => onCommit(value)}
    />
  );
}

function PlacementHandle({
  q,
  displayNumber,
  column,
  yPercent,
  heightPct,
  columnLeftPct,
  columnWidthPct,
  active,
  resizing,
  editing,
  onPointerDown,
  onResizePointerDown,
  onStartLabelEdit,
  onCommitLabel,
  onCancelLabelEdit,
  onRemove,
  showRemove,
  zIndex,
}) {
  const labelNum = displayNumber || q?.questionNumber;
  const marks = `${q.marksAwarded ?? "?"}/${q.maxMarks ?? "?"}`;
  const canRename = typeof onStartLabelEdit === "function";
  const isRight = column === "right";
  const leftPct = isRight ? columnLeftPct : 0.6;
  const widthPct = isRight ? columnWidthPct : 11;

  return (
    <div
      className={`pdf-place-handle pdf-place-handle--${column}${active ? " pdf-place-handle--active" : ""}${
        resizing ? " pdf-place-handle--resizing" : ""
      }${editing ? " pdf-place-handle--editing" : ""}${isRight ? " pdf-place-handle--box" : ""}`}
      style={{
        top: `${yPercent}%`,
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        height: isRight && heightPct ? `${heightPct}%` : undefined,
        zIndex: zIndex ?? undefined,
      }}
      onPointerDown={(e) => {
        if (editing) {
          e.stopPropagation();
          return;
        }
        if (e.target.closest(".pdf-place-handle__resize")) return;
        onPointerDown(e, q, column, yPercent);
      }}
      title={
        isRight
          ? "Drag to move. Use the top/bottom edges to resize this correction box. Positions apply on Save & regenerate PDF."
          : canRename
            ? "Drag to move. Double-click the label to rename. Positions apply on Save & regenerate PDF."
            : "Drag to move this marking box (any page). Positions apply on Save & regenerate PDF."
      }
    >
      {isRight && (
        <button
          type="button"
          className="pdf-place-handle__resize pdf-place-handle__resize--top"
          title="Resize correction box"
          aria-label={`Resize question ${labelNum} box from the top`}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onResizePointerDown?.(e, q, yPercent, heightPct, "top");
          }}
        />
      )}
      {showRemove && column === "left" && (
        <button
          type="button"
          className="pdf-place-handle__remove"
          title={`Remove Q${labelNum} from marking`}
          aria-label={`Remove question ${labelNum}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove?.(q._placementIndex);
          }}
        >
          ×
        </button>
      )}
      <span className="pdf-place-handle__grip" aria-hidden title="Drag">
        ⋮⋮
      </span>
      {editing ? (
        <LabelEditor
          initial={String(labelNum ?? "")}
          onCommit={(raw) => onCommitLabel(q._placementIndex, raw)}
          onCancel={onCancelLabelEdit}
        />
      ) : (
        <span
          className="pdf-place-handle__label"
          onPointerDown={(e) => {
            if (canRename && e.detail >= 2) {
              e.stopPropagation();
              e.preventDefault();
            }
          }}
          onDoubleClick={(e) => {
            if (!canRename) return;
            e.preventDefault();
            e.stopPropagation();
            onStartLabelEdit(q._placementIndex);
          }}
        >
          {column === "left" ? `Q${labelNum} ${marks}` : `Q${labelNum}`}
        </span>
      )}
      {isRight && (
        <button
          type="button"
          className="pdf-place-handle__resize pdf-place-handle__resize--bottom"
          title="Resize correction box"
          aria-label={`Resize question ${labelNum} box from the bottom`}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onResizePointerDown?.(e, q, yPercent, heightPct, "bottom");
          }}
        />
      )}
    </div>
  );
}

function LazyPdfPage({
  pdf,
  pageNumber,
  renderWidth,
  scrollRoot,
  studentPageNumber,
  pageQuestions,
  labelGuidance,
  duplicateQuestionNumbers,
  dragKey,
  editingLabelIndex,
  columnLeftPct,
  columnWidthPct,
  showColumnResize,
  onHandlePointerDown,
  onBoxResizePointerDown,
  onColumnResizePointerDown,
  onStartLabelEdit,
  onCommitLabel,
  onCancelLabelEdit,
  onQuestionRemove,
  showRemove,
  pageAspect,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const renderedRef = useRef(false);
  const [rendered, setRendered] = useState(false);
  // A tiny downscaled copy of the last successful render, kept for this
  // component instance's whole lifetime (survives the unload observer
  // freeing the full-res canvas — only a fresh document/page remounts this
  // component and resets it). Shown in place of a blank canvas so revisiting
  // an unloaded page looks instant instead of visibly re-rendering from
  // scratch.
  const [thumbnail, setThumbnail] = useState(null);
  // Real PDF page height in points — a scanned/photographed submission page
  // can be several times taller than a normal ~842pt page, so a box's
  // estimated height must be rescaled to it (see estimateNoteBoxHeightPercent).
  // Seeded from the parent's page-dimension prefetch (pageAspect) when it's
  // already known, so placement boxes aren't sized for a wrong 842pt guess
  // on an oversized scanned page before this page has rendered even once.
  const [pageHeightPt, setPageHeightPt] = useState(() => pageAspect?.h || 842);

  useEffect(() => {
    renderedRef.current = false;
    setRendered(false);
  }, [pdf, pageNumber, renderWidth]);

  // The prefetch in the parent resolves after this page has already mounted
  // (it's one Promise.all over every page in the document), so pick up the
  // real height as soon as it lands — as long as an actual render hasn't
  // already supplied a definitive one.
  useEffect(() => {
    if (pageAspect?.h && !renderedRef.current) {
      setPageHeightPt(pageAspect.h);
    }
  }, [pageAspect]);

  useEffect(() => {
    if (!pdf || !wrapRef.current || !scrollRoot) return;

    const el = wrapRef.current;
    let disposed = false;
    let rendering = false;
    let retryCount = 0;
    let retryTimer = null;

    // Shared by the unload observer below and by the post-render check in
    // renderPage: cancels any in-flight render and drops the canvas's
    // backing store (CSS width/height stay put so layout doesn't jump).
    const freeCanvas = () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      renderedRef.current = false;
      setRendered(false);
    };

    const renderPage = async () => {
      if (disposed || renderedRef.current || rendering) return;
      rendering = true;

      try {
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        if (!disposed) setPageHeightPt(baseViewport.height);
        let scale = renderWidth / baseViewport.width;
        const maxScale = MAX_RENDER_PIXEL_WIDTH / baseViewport.width;
        scale = Math.min(scale, maxScale);
        const viewport = page.getViewport({ scale });
        // Bound actual backing pixels, including DPR, for large scans and zoom.
        const dpr = Math.min(window.devicePixelRatio || 1, 2,
          MAX_RENDER_PIXEL_WIDTH / viewport.width,
          Math.sqrt(CANVAS_PIXEL_BUDGET / (viewport.width * viewport.height)));

        const canvas = canvasRef.current;
        if (!canvas || disposed) return;

        const ctx = canvas.getContext("2d", { alpha: false });
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // ignore
          }
        }

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (disposed) return;
        renderedRef.current = true;
        setRendered(true);

        // Grab a cheap low-res copy of what was just rendered — reusing
        // these already-painted pixels, not a second pdf.js render — before
        // this canvas is possibly freed below or later by the unload
        // observer. Shown as an instant placeholder next time this page's
        // full canvas is empty, so revisiting it reads as "already there,
        // just sharpening" instead of "loading again from nothing".
        try {
          const thumbW = THUMBNAIL_WIDTH_PX;
          const thumbH = Math.max(1, Math.round((canvas.height / canvas.width) * thumbW));
          const thumbCanvas = document.createElement("canvas");
          thumbCanvas.width = thumbW;
          thumbCanvas.height = thumbH;
          thumbCanvas
            .getContext("2d", { alpha: false })
            .drawImage(canvas, 0, 0, thumbW, thumbH);
          setThumbnail(thumbCanvas.toDataURL("image/jpeg", 0.6));
        } catch {
          // Best-effort — worst case this page just has no placeholder yet.
        }

        // page.render() is async; a fast scroll can carry this page back out
        // of the keep-alive zone before it resolves. The unload observer's
        // "left the zone" event already fired while renderedRef was still
        // false (so it was a no-op), and won't fire again on its own since
        // nothing has crossed the threshold since — without this check the
        // canvas would stay resident indefinitely outside the intended
        // window, silently eating back the memory the unload observer exists
        // to free.
        if (!isElementNearRoot(el, scrollRoot, UNLOAD_MARGIN_PX)) {
          freeCanvas();
        }
      } catch (err) {
        if (!disposed && err?.name !== "RenderingCancelledException") {
          console.warn("[AnnotatedPdfPreview] page render:", err);
        }
        if (!disposed) {
          renderedRef.current = false;
          setRendered(false);
          // Width/layout changes and React effect cleanup can cancel an
          // otherwise-valid first render. Retry visible pages automatically so
          // the report pages cannot remain as permanent white canvases.
          if (retryCount < 2) {
            retryCount += 1;
            retryTimer = setTimeout(renderPage, 100 * retryCount);
          }
        }
      } finally {
        rendering = false;
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          renderPage();
        }
      },
      { root: scrollRoot, rootMargin: `${RENDER_MARGIN_PX}px 0px`, threshold: 0.01 }
    );

    // A rendered canvas is never freed on its own — on a long scanned
    // submission (30+ pages) every page a reader has scrolled past stays
    // fully rendered at up to ~8M backing pixels each, and the growing
    // canvas memory eventually crashes/reloads the tab mid-scroll. Once a
    // page falls well outside this wider margin, drop its backing store
    // (keep the CSS width/height so layout and scroll position don't jump)
    // so only pages actually near the viewport hold pixels; it re-renders
    // through the observer above when scrolled back near.
    const unloadObserver = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => !e.isIntersecting) && renderedRef.current) {
          freeCanvas();
        }
      },
      { root: scrollRoot, rootMargin: `${UNLOAD_MARGIN_PX}px 0px`, threshold: 0 }
    );

    observer.observe(el);
    unloadObserver.observe(el);
    return () => {
      disposed = true;
      observer.disconnect();
      unloadObserver.disconnect();
      if (retryTimer) clearTimeout(retryTimer);
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdf, pageNumber, renderWidth, scrollRoot]);

  const showHandles = Array.isArray(pageQuestions) && pageQuestions.length > 0;

  return (
    <div
      ref={wrapRef}
      className={`pdf-preview-page${rendered ? " pdf-preview-page--ready" : ""}`}
      data-page={pageNumber}
      data-student-page={studentPageNumber > 0 ? studentPageNumber : undefined}
      // Reserves this page's real height before its canvas ever paints (CSS
      // falls back to an A4-ish guess until pageAspect resolves — see
      // .pdf-preview-page in the stylesheet). Without this, an unrendered
      // page sits at the browser's default 300x150 canvas box, so jumping to
      // a page number or a page far from the current scroll position lands
      // scrollIntoView() on the wrong offset because everything in between
      // is collapsed to that placeholder size instead of its true height.
      style={pageAspect?.w && pageAspect?.h ? { aspectRatio: `${pageAspect.w} / ${pageAspect.h}` } : undefined}
    >
      {thumbnail && (
        // Sits behind the canvas (DOM order + matching absolute position —
        // see .pdf-preview-thumb/.pdf-preview-canvas in the stylesheet) so
        // it shows through whenever the canvas is empty, and gets covered
        // the instant the canvas has real pixels again.
        <img src={thumbnail} className="pdf-preview-thumb" alt="" aria-hidden="true" />
      )}
      <canvas ref={canvasRef} className="pdf-preview-canvas" />
      {showColumnResize && (
        <div
          className={`pdf-examiner-col-rail${dragKey === "column" ? " pdf-examiner-col-rail--active" : ""}`}
          style={{ left: `${columnLeftPct}%`, width: `${columnWidthPct}%` }}
        >
          <div
            className="pdf-examiner-col-resize"
            title="Drag to resize the examiner notes column. Applies on Save & regenerate PDF."
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize examiner notes column"
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onColumnResizePointerDown?.(e);
            }}
          />
        </div>
      )}
      {showHandles && (
        <div className="pdf-place-layer">
          {pageQuestions.map((item) => {
            const { q, yPercent } = item;
            const key = placementKey(q);
            const displayNumber = formatQuestionLabelWithPage(
              q,
              labelGuidance,
              duplicateQuestionNumbers
            );
            const stackZ = 3 + (Number(item.placementIndex) || 0) * 2;
            const heightPct = estimateNoteBoxHeightPercent(q, pageHeightPt);
            return (
              <div key={`place-${item.placementIndex ?? key}`} className="pdf-place-handle-group">
                <PlacementHandle
                  q={q}
                  displayNumber={displayNumber}
                  column="left"
                  yPercent={yPercent}
                  zIndex={stackZ}
                  active={dragKey === `${key}:left`}
                  editing={editingLabelIndex === q._placementIndex}
                  onPointerDown={onHandlePointerDown}
                  onStartLabelEdit={onStartLabelEdit}
                  onCommitLabel={onCommitLabel}
                  onCancelLabelEdit={onCancelLabelEdit}
                  onRemove={onQuestionRemove}
                  showRemove={showRemove}
                />
                <PlacementHandle
                  q={q}
                  displayNumber={displayNumber}
                  column="right"
                  yPercent={yPercent}
                  heightPct={heightPct}
                  columnLeftPct={columnLeftPct}
                  columnWidthPct={columnWidthPct}
                  zIndex={stackZ + 1}
                  active={dragKey === `${key}:right`}
                  resizing={dragKey === `${key}:height`}
                  editing={false}
                  onPointerDown={onHandlePointerDown}
                  onResizePointerDown={onBoxResizePointerDown}
                  onStartLabelEdit={onStartLabelEdit}
                  onCommitLabel={onCommitLabel}
                  onCancelLabelEdit={onCancelLabelEdit}
                  showRemove={false}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Resolve which student page the pointer is over (supports cross-page drag).
 */
function resolveStudentPageUnderPointer(scrollRoot, clientY, reportOffset) {
  if (!scrollRoot) return null;
  const pages = scrollRoot.querySelectorAll("[data-student-page]");
  if (!pages.length) return null;

  let best = null;
  let bestDist = Infinity;

  for (const el of pages) {
    const studentPage = Number(el.getAttribute("data-student-page"));
    if (!Number.isFinite(studentPage) || studentPage < 1) continue;
    const rect = el.getBoundingClientRect();
    if (rect.height <= 0) continue;
    if (clientY >= rect.top && clientY <= rect.bottom) {
      const yPercent = clampYPercent(((clientY - rect.top) / rect.height) * 100);
      return { studentPage, yPercent, pageEl: el };
    }
    const dist =
      clientY < rect.top ? rect.top - clientY : clientY - rect.bottom;
    if (dist < bestDist) {
      bestDist = dist;
      const yPercent = clientY < rect.top ? 5 : 92;
      best = { studentPage, yPercent, pageEl: el };
    }
  }

  if (best) return best;

  const first = Math.max(1, 1);
  void reportOffset;
  return { studentPage: first, yPercent: 30, pageEl: null };
}

/**
 * Lazy page-by-page PDF preview with native-resolution zoom (re-renders at zoom level).
 * Optional placementQuestions + onPlacementChange: drag boxes across pages,
 * resize correction boxes and the examiner-notes column; parent should apply
 * pageNumber/yPercent/noteBoxHeightPercent/examinerColumnWidthPercent and only
 * regenerate on Confirm Edits.
 * Optional onQuestionLabelChange: double-click a handle label to rename Q1a etc.
 */
export default function AnnotatedPdfPreview({
  url,
  pdfSessionKey = null,
  placementQuestions = null,
  reportPageCount = 0,
  onPlacementChange = null,
  onQuestionRemove = null,
  onQuestionLabelChange = null,
  labelGuidance = "",
  openExternalLabel = "Open in browser",
  onStructuralError = null,
  onDocumentLoaded = null,
  mobileEditing = false,
}) {
  const rootRef = useRef(null);
  const phone = usePhoneLayout();
  const [phoneFullscreen, setPhoneFullscreen] = useState(false);
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const [scrollRoot, setScrollRoot] = useState(null);
  const attachScrollRoot = useCallback((node) => {
    scrollRef.current = node;
    setScrollRoot(node);
  }, []);
  const [pdf, setPdf] = useState(null);
  const [numPages, setNumPages] = useState(0);
  // Page dims (PDF points, scale 1) prefetched right after the doc loads —
  // index i holds page i+1's {w, h}, or undefined until it resolves. Lets
  // each LazyPdfPage reserve its real box height before it ever renders (see
  // pageAspect below), instead of the browser's 300x150 canvas default,
  // which otherwise threw off scrollIntoView() for any jump to a page that
  // hadn't rendered yet.
  const [pageAspects, setPageAspects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [loadNonce, setLoadNonce] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const [renderZoom, setRenderZoom] = useState(DEFAULT_ZOOM);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [contentHeight, setContentHeight] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [fitMenuOpen, setFitMenuOpen] = useState(false);
  /** Local drag overrides keyed by placementKey (row index), not questionNumber alone. */
  const [localPlacement, setLocalPlacement] = useState({});
  const [localColumnWidthPct, setLocalColumnWidthPct] = useState(null);
  const [dragKey, setDragKey] = useState(null);
  const [editingLabelIndex, setEditingLabelIndex] = useState(null);
  const fitMenuRef = useRef(null);
  const dragRef = useRef(null);
  const pinchRef = useRef(null);
  const pointersRef = useRef(new Map());
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });
  const scrollRafRef = useRef(null);
  const zoomRef = useRef(DEFAULT_ZOOM);
  const pdfSessionRef = useRef(null);
  const currentPageRef = useRef(1);
  const structuralRetryUrlRef = useRef(null);
  const structuralRetryCountRef = useRef(0);

  const placementEnabled =
    Array.isArray(placementQuestions) && typeof onPlacementChange === "function";
  const removeEnabled = typeof onQuestionRemove === "function";
  const labelEditEnabled = typeof onQuestionLabelChange === "function";

  const baseRenderWidth = Math.max(240, Math.floor(containerWidth) || 320);
  const visualScale = renderZoom > 0 ? zoomLevel / renderZoom : 1;
  const effectiveRenderWidth = Math.min(
    Math.max(240, Math.ceil(baseRenderWidth * renderZoom)),
    MAX_RENDER_PIXEL_WIDTH
  );
  const zoomPercent = Math.round(zoomLevel * 100);
  const scaledWidth = Math.ceil(baseRenderWidth * zoomLevel);
  const scaledHeight = Math.ceil(contentHeight * visualScale);

  const handleQuestionRemove = useCallback(
    (questionIndex) => {
      if (!removeEnabled) return;
      onQuestionRemove(questionIndex);
      setLocalPlacement((prev) => {
        // questionIndex is the row's index in the full editing list; this array
        // is already filtered (pending removals, stubs), so match on the id.
        const q = placementQuestions?.find(
          (row) => row?._placementIndex === questionIndex
        );
        if (!q) return prev;
        const key = placementKey(q);
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [removeEnabled, onQuestionRemove, placementQuestions]
  );

  const handleStartLabelEdit = useCallback(
    (questionIndex) => {
      if (!labelEditEnabled) return;
      setEditingLabelIndex(questionIndex);
    },
    [labelEditEnabled]
  );

  const handleCancelLabelEdit = useCallback(() => {
    setEditingLabelIndex(null);
  }, []);

  const handleCommitLabel = useCallback(
    (placementIndex, raw) => {
      setEditingLabelIndex(null);
      if (!labelEditEnabled || placementIndex == null) return;
      const next = normalizeQuestionLabelInput(raw);
      if (!next) return;
      onQuestionLabelChange({ placementIndex, questionNumber: next });
    },
    [labelEditEnabled, onQuestionLabelChange]
  );

  useEffect(() => {
    zoomRef.current = zoomLevel;
  }, [zoomLevel]);

  /** Debounce expensive PDF re-renders during wheel/pinch; buttons update renderZoom via applyZoomAtPoint. */
  useEffect(() => {
    if (Math.abs(zoomLevel - renderZoom) < 0.001) return undefined;
    const timer = window.setTimeout(() => {
      setRenderZoom(zoomLevel);
    }, RENDER_ZOOM_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [zoomLevel, renderZoom]);

  useEffect(() => {
    setLocalPlacement({});
    setLocalColumnWidthPct(null);
    setZoomLevel(DEFAULT_ZOOM);
    setRenderZoom(DEFAULT_ZOOM);
    setEditingLabelIndex(null);
  }, [url]);

  useEffect(() => {
    if (!rootRef.current) return;
    const el = rootRef.current;
    const measure = (width) => {
      if (width && width > 0) {
        setContainerWidth(Math.min(Math.floor(width - 12), MAX_RENDER_WIDTH));
      }
    };
    measure(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      measure(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    if (!fitMenuOpen) return;
    const onDocClick = (e) => {
      if (fitMenuRef.current && !fitMenuRef.current.contains(e.target)) {
        setFitMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [fitMenuOpen]);

  useEffect(() => {
    if (!contentRef.current) return;
    const el = contentRef.current;
    const measure = () => setContentHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [numPages, effectiveRenderWidth, url]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === rootRef.current);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    if (!url) {
      setPdf(null);
      setNumPages(0);
      setLoading(false);
      return;
    }

    const sameSession =
      pdfSessionKey != null && pdfSessionKey === pdfSessionRef.current;
    pdfSessionRef.current = pdfSessionKey ?? null;
    if (!sameSession) structuralRetryCountRef.current = 0;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPageAspects([]);
    if (!sameSession) {
      setCurrentPage(1);
      currentPageRef.current = 1;
      setZoomLevel(DEFAULT_ZOOM);
      setRenderZoom(DEFAULT_ZOOM);
    }

    (async () => {
      try {
        const doc = await loadPdfDocumentFromUrl(url);
        if (cancelled) {
          await doc.destroy();
          return;
        }
        setPdf(doc);
        setNumPages(doc.numPages);
        onDocumentLoaded?.(url);
        if (sameSession) {
          const restore = Math.min(
            Math.max(1, currentPageRef.current),
            doc.numPages || 1
          );
          setCurrentPage(restore);
          currentPageRef.current = restore;
        }

        // Fire-and-forget: prefetch every page's real dimensions (cheap —
        // the whole file is already local bytes, this just reads each page's
        // MediaBox, it doesn't rasterize anything) so LazyPdfPage can reserve
        // accurate placeholder heights via pageAspect before a page has ever
        // rendered. Doesn't block `loading`; the preview is usable either way.
        Promise.all(
          Array.from({ length: doc.numPages || 0 }, (_, i) =>
            doc
              .getPage(i + 1)
              .then((page) => {
                const vp = page.getViewport({ scale: 1 });
                return { w: vp.width, h: vp.height };
              })
              .catch(() => undefined)
          )
        ).then((dims) => {
          if (!cancelled) setPageAspects(dims);
        });
      } catch (err) {
        if (!cancelled) {
          console.error("[AnnotatedPdfPreview] load:", err);
          const structural = /no pdf header|missing %pdf-? header|invalid root reference|invalid xref|xref.*(invalid|missing)|trailer.*root/i.test(
            String(err?.message || err || "")
          );
          const localHandoffFailure = /network error|failed to fetch|failed to read preview pdf/i.test(
            String(err?.message || err || "")
          );
          if (
            (structural || localHandoffFailure) &&
            onStructuralError &&
            structuralRetryUrlRef.current !== url &&
            structuralRetryCountRef.current < 1
          ) {
            structuralRetryUrlRef.current = url;
            structuralRetryCountRef.current += 1;
            setError(
              structural
                ? "The generated preview was incomplete. Sahahly is rebuilding it automatically."
                : "The preview connection was interrupted. Sahahly is rebuilding it automatically."
            );
            onStructuralError();
          } else {
            setError(friendlyPdfLoadError(err));
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      setPdf((prev) => {
        if (prev) prev.destroy().catch(() => {});
        return null;
      });
    };
  }, [url, loadNonce, pdfSessionKey, onStructuralError, onDocumentLoaded]);

  const effectiveQuestions = useMemo(() => {
    if (!placementEnabled) return [];
    return placementQuestions.map((q, placementIndex) => {
      const key = placementKey(q);
      const override = localPlacement[key];
      return {
        ...q,
        _placementIndex: q._placementIndex ?? placementIndex,
        pageNumber: Math.max(
          1,
          Number(override?.pageNumber ?? q.pageNumber) || 1
        ),
        yPercent: clampYPercent(override?.yPercent ?? q.yPercent),
        noteBoxHeightPercent:
          override?.noteBoxHeightPercent ?? q.noteBoxHeightPercent,
        examinerColumnWidthPercent:
          localColumnWidthPct ?? q.examinerColumnWidthPercent,
      };
    });
  }, [placementEnabled, placementQuestions, localPlacement, localColumnWidthPct]);

  const columnWidthPct = clampExaminerColumnWidthPercent(
    localColumnWidthPct ?? examinerColumnWidthPercentFromQuestions(effectiveQuestions)
  );
  const columnLeftPct = 100 - columnWidthPct;

  const duplicateQuestionNumbers = useMemo(
    () => buildDuplicateQuestionNumberSet(effectiveQuestions),
    [effectiveQuestions]
  );

  const byStudentPage = useMemo(() => {
    const map = new Map();
    const byPageRaw = new Map();

    for (const q of effectiveQuestions) {
      const p = Math.max(1, Number(q.pageNumber) || 1);
      if (!byPageRaw.has(p)) byPageRaw.set(p, []);
      byPageRaw.get(p).push(q);
    }

    for (const [pageNum, group] of byPageRaw) {
      const resolvedY = resolveBadgeYPercentsForPage(group);
      if (!map.has(pageNum)) map.set(pageNum, []);
      for (const q of group) {
        map.get(pageNum).push({
          q,
          yPercent: clampYPercent(
            resolvedY.get(placementKey(q)) ?? q.yPercent
          ),
          placementIndex: q._placementIndex,
        });
      }
    }

    return map;
  }, [effectiveQuestions]);

  const handlePointerDown = useCallback(
    (e, q, column, displayedYPercent) => {
      if (!placementEnabled) return;
      e.preventDefault();
      e.stopPropagation();

      const key = placementKey(q);
      const studentPage = Math.max(1, Number(q.pageNumber) || 1);
      const startY = clampYPercent(displayedYPercent ?? q.yPercent);

      const rect = e.currentTarget.getBoundingClientRect();
      const grabOffsetY = e.clientY - (rect.top + rect.height / 2);

      dragRef.current = {
        mode: "move",
        key,
        column,
        placementIndex: q._placementIndex,
        questionNumber: q.questionNumber,
        pageNumber: studentPage,
        startY,
        grabOffsetY,
      };
      setDragKey(`${key}:${column}`);
      setEditingLabelIndex(null);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [placementEnabled]
  );

  const handleBoxResizePointerDown = useCallback(
    (e, q, displayedYPercent, heightPct, edge) => {
      if (!placementEnabled) return;
      e.preventDefault();
      e.stopPropagation();

      const key = placementKey(q);
      const pageEl = e.currentTarget.closest(".pdf-preview-page");
      const rect = pageEl?.getBoundingClientRect();
      dragRef.current = {
        mode: "height",
        edge: edge === "top" ? "top" : "bottom",
        key,
        placementIndex: q._placementIndex,
        questionNumber: q.questionNumber,
        pageNumber: Math.max(1, Number(q.pageNumber) || 1),
        startY: clampYPercent(displayedYPercent ?? q.yPercent),
        startHeight: clampNoteBoxHeightPercent(heightPct) ?? MIN_NOTE_BOX_HEIGHT_PCT,
        startClientY: e.clientY,
        pageHeight: rect?.height || 1,
      };
      setDragKey(`${key}:height`);
      setEditingLabelIndex(null);
    },
    [placementEnabled]
  );

  const handleColumnResizePointerDown = useCallback(
    (e) => {
      if (!placementEnabled) return;
      e.preventDefault();
      e.stopPropagation();

      const pageEl = e.currentTarget.closest(".pdf-preview-page");
      const rect = pageEl?.getBoundingClientRect();
      dragRef.current = {
        mode: "column",
        startWidth: columnWidthPct,
        startX: e.clientX,
        pageWidth: rect?.width || 1,
      };
      setDragKey("column");
      setEditingLabelIndex(null);
    },
    [placementEnabled, columnWidthPct]
  );

  useEffect(() => {
    if (!dragKey) return;

    const onMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.mode === "column") {
        e.preventDefault();
        const dx = e.clientX - drag.startX;
        const next = clampExaminerColumnWidthPercent(
          drag.startWidth - (dx / Math.max(1, drag.pageWidth)) * 100
        );
        setLocalColumnWidthPct(next);
        drag.currentWidth = next;
        return;
      }

      if (drag.mode === "height") {
        e.preventDefault();
        const dyPct = ((e.clientY - drag.startClientY) / Math.max(1, drag.pageHeight)) * 100;
        let newHeight;
        let newY;
        if (drag.edge === "top") {
          newHeight =
            clampNoteBoxHeightPercent(drag.startHeight - dyPct) ?? MIN_NOTE_BOX_HEIGHT_PCT;
          const bottom = drag.startY + drag.startHeight / 2;
          newY = clampYPercent(bottom - newHeight / 2);
        } else {
          newHeight =
            clampNoteBoxHeightPercent(drag.startHeight + dyPct) ?? MIN_NOTE_BOX_HEIGHT_PCT;
          const top = drag.startY - drag.startHeight / 2;
          newY = clampYPercent(top + newHeight / 2);
        }
        setLocalPlacement((prev) => ({
          ...prev,
          [drag.key]: {
            ...prev[drag.key],
            pageNumber: drag.pageNumber,
            yPercent: newY,
            noteBoxHeightPercent: newHeight,
          },
        }));
        drag.currentY = newY;
        drag.currentHeight = newHeight;
        return;
      }

      const anchorY = e.clientY - (drag.grabOffsetY || 0);
      const hit = resolveStudentPageUnderPointer(
        scrollRef.current,
        anchorY,
        Math.max(0, Number(reportPageCount) || 0)
      );
      if (!hit) return;

      const root = scrollRef.current;
      if (root) {
        const rootRect = root.getBoundingClientRect();
        const edge = 48;
        if (e.clientY < rootRect.top + edge) {
          root.scrollTop -= 18;
        } else if (e.clientY > rootRect.bottom - edge) {
          root.scrollTop += 18;
        }
      }

      setLocalPlacement((prev) => ({
        ...prev,
        [drag.key]: {
          ...prev[drag.key],
          pageNumber: hit.studentPage,
          yPercent: hit.yPercent,
        },
      }));
      drag.pageNumber = hit.studentPage;
      drag.startY = hit.yPercent;
    };

    const onUp = (e) => {
      const drag = dragRef.current;
      if (!drag) return;

      if (drag.mode === "column") {
        const width = clampExaminerColumnWidthPercent(
          drag.currentWidth ?? drag.startWidth
        );
        dragRef.current = null;
        setDragKey(null);
        onPlacementChange?.({ examinerColumnWidthPercent: width });
        return;
      }

      if (drag.mode === "height") {
        const yPercent = drag.currentY ?? drag.startY;
        const noteBoxHeightPercent = drag.currentHeight ?? drag.startHeight;
        dragRef.current = null;
        setDragKey(null);
        onPlacementChange?.({
          placementIndex: drag.placementIndex,
          questionNumber: drag.questionNumber,
          pageNumber: drag.pageNumber,
          yPercent,
          noteBoxHeightPercent,
        });
        return;
      }

      const anchorY = e.clientY - (drag.grabOffsetY || 0);
      const hit = resolveStudentPageUnderPointer(
        scrollRef.current,
        anchorY,
        Math.max(0, Number(reportPageCount) || 0)
      );
      const pageNumber = hit?.studentPage ?? drag.pageNumber;
      const yPercent = hit?.yPercent ?? drag.startY;

      setLocalPlacement((prev) => ({
        ...prev,
        [drag.key]: { ...prev[drag.key], pageNumber, yPercent },
      }));
      dragRef.current = null;
      setDragKey(null);
      onPlacementChange?.({
        placementIndex: drag.placementIndex,
        questionNumber: drag.questionNumber,
        pageNumber,
        yPercent,
      });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragKey, onPlacementChange, reportPageCount]);

  const scrollToPage = useCallback((pageNum) => {
    const safePage = Math.min(Math.max(1, pageNum), numPages || 1);
    const root = scrollRef.current;
    if (!root) {
      setCurrentPage(safePage);
      setPageInput(String(safePage));
      return;
    }
    const target = root.querySelector(`[data-page="${safePage}"]`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setCurrentPage(safePage);
    setPageInput(String(safePage));
  }, [numPages]);

  const goPrev = () => scrollToPage(currentPage - 1);
  const goNext = () => scrollToPage(currentPage + 1);

  useEffect(() => {
    if (!pdf || numPages < 1) return;
    const page = currentPageRef.current;
    if (page <= 1) return;
    const frame = requestAnimationFrame(() => {
      scrollToPage(Math.min(page, numPages));
    });
    return () => cancelAnimationFrame(frame);
  }, [pdf, numPages, url, scrollToPage]);

  const commitPageInput = () => {
    const parsed = Number.parseInt(pageInput, 10);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(currentPage));
      return;
    }
    scrollToPage(parsed);
  };

  const applyZoomAtPoint = useCallback((newZoom, clientX, clientY) => {
    const root = scrollRef.current;
    const oldZoom = zoomRef.current;
    const clamped = clampZoom(newZoom);
    if (Math.abs(clamped - oldZoom) < 0.001) return;

    if (!root) {
      setZoomLevel(clamped);
      zoomRef.current = clamped;
      return;
    }

    const rect = root.getBoundingClientRect();
    const ratio = clamped / oldZoom;
    const offsetX = clientX - rect.left + root.scrollLeft;
    const offsetY = clientY - rect.top + root.scrollTop;

    zoomRef.current = clamped;

    // flushSync, not requestAnimationFrame: a wheel or pinch gesture calls
    // this many times in a row, faster than a frame apart. The old code read
    // scrollLeft/scrollTop above (fine) but deferred the write to the next
    // frame — so a second call in the same frame read the SAME
    // not-yet-written scroll position as the first, computed its own
    // target from that stale value, and whichever deferred write landed
    // last won, discarding the other. That's what was landing on the wrong
    // page after zooming. flushSync commits the zoomLevel-driven layout
    // (the scaled width/height this scroll math depends on) before this
    // function returns, so the scrollTop/scrollLeft write below always
    // lands against up-to-date layout, and the next call in the same burst
    // starts from the position THIS call actually wrote, every time.
    flushSync(() => {
      setZoomLevel(clamped);
    });
    root.scrollLeft = offsetX * ratio - (clientX - rect.left);
    root.scrollTop = offsetY * ratio - (clientY - rect.top);
  }, []);

  const zoomOut = () => {
    const root = scrollRef.current;
    if (!root) {
      setZoomLevel((z) => {
        const next = clampZoom(z - ZOOM_STEP_BTN);
        setRenderZoom(next);
        zoomRef.current = next;
        return next;
      });
      return;
    }
    const rect = root.getBoundingClientRect();
    applyZoomAtPoint(zoomRef.current - ZOOM_STEP_BTN, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const zoomIn = () => {
    const root = scrollRef.current;
    if (!root) {
      setZoomLevel((z) => {
        const next = clampZoom(z + ZOOM_STEP_BTN);
        setRenderZoom(next);
        zoomRef.current = next;
        return next;
      });
      return;
    }
    const rect = root.getBoundingClientRect();
    applyZoomAtPoint(zoomRef.current + ZOOM_STEP_BTN, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const resetZoom = () => {
    setZoomLevel(DEFAULT_ZOOM);
    setRenderZoom(DEFAULT_ZOOM);
    zoomRef.current = DEFAULT_ZOOM;
    scrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };

  const fitWidth = useCallback(() => {
    setZoomLevel(DEFAULT_ZOOM);
    setRenderZoom(DEFAULT_ZOOM);
    zoomRef.current = DEFAULT_ZOOM;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollTop, left: 0, behavior: "smooth" });
  }, []);

  const fitPage = useCallback(async () => {
    if (!pdf || !scrollRef.current) return;
    try {
      const page = await pdf.getPage(currentPage);
      const viewport = page.getViewport({ scale: 1 });
      const pageHeightAtBase = (baseRenderWidth / viewport.width) * viewport.height;
      const available = scrollRef.current.clientHeight - 8;
      const nextZoom = clampZoom(available / pageHeightAtBase);
      setZoomLevel(nextZoom);
      setRenderZoom(nextZoom);
      zoomRef.current = nextZoom;
      scrollRef.current.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    } catch (err) {
      console.warn("[AnnotatedPdfPreview] fit page:", err);
    }
  }, [pdf, currentPage, baseRenderWidth]);

  const handleZoomSelect = (e) => {
    const value = e.target.value;
    if (value === "fit-page") {
      fitPage();
      return;
    }
    if (value === "fit-width") {
      fitWidth();
      return;
    }
    const preset = Number(value);
    if (!Number.isFinite(preset)) return;
    const root = scrollRef.current;
    if (root) {
      const rect = root.getBoundingClientRect();
      applyZoomAtPoint(preset, rect.left + rect.width / 2, rect.top + rect.height / 2);
    } else {
      setZoomLevel(clampZoom(preset));
    }
  };

  const nearestPresetValue = ZOOM_PRESETS.reduce((best, preset) =>
    Math.abs(preset - zoomLevel) < Math.abs(best - zoomLevel) ? preset : best
  , ZOOM_PRESETS[0]);

  const zoomSelectValue =
    Math.abs(zoomLevel - nearestPresetValue) < 0.02
      ? String(nearestPresetValue)
      : String(zoomLevel);

  const toggleFullscreen = async () => {
    if (phone) { setPhoneFullscreen(full => !full); return; }
    const el = rootRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch (err) {
      console.warn("[AnnotatedPdfPreview] fullscreen:", err);
    }
  };

  const openExternal = useCallback(() => {
    if (!url) return;
    window.open(url, "_blank", "noopener,noreferrer");
  }, [url]);

  const handlePreviewWheel = useCallback((e) => {
    const wantsZoom = e.ctrlKey || e.metaKey || e.altKey;
    if (!wantsZoom) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_WHEEL_STEP : ZOOM_WHEEL_STEP;
    applyZoomAtPoint(zoomRef.current + delta, e.clientX, e.clientY);
  }, [applyZoomAtPoint]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e) => handlePreviewWheel(e);
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [handlePreviewWheel, scrollRoot]);

  const handleScrollAreaPointerDown = useCallback((e) => {
    if (e.target.closest(".pdf-place-handle") || e.target.closest(".pdf-examiner-col-resize")) return;

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      pinchRef.current = {
        startDistance: pointerDistance(pts[0], pts[1]),
        startZoom: zoomRef.current,
        centerX: (pts[0].x + pts[1].x) / 2,
        centerY: (pts[0].y + pts[1].y) / 2,
        // Each contact's own starting position, so a move handler can tell
        // whether BOTH of them have actually moved (see below) before ever
        // acting on this as a pinch.
        starts: new Map(pointersRef.current),
        confirmed: false,
      };
    }

    const now = Date.now();
    const last = lastTapRef.current;
    const isDoubleTap =
      pointersRef.current.size === 1 &&
      now - last.time < 320 &&
      Math.hypot(e.clientX - last.x, e.clientY - last.y) < 24;

    if (isDoubleTap) {
      const targetZoom = zoomRef.current < 1.5 ? 2 : DEFAULT_ZOOM;
      applyZoomAtPoint(targetZoom, e.clientX, e.clientY);
      lastTapRef.current = { time: 0, x: 0, y: 0 };
      return;
    }

    lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };
  }, [applyZoomAtPoint]);

  const handleScrollAreaPointerMove = useCallback((e) => {
    if (!pointersRef.current.has(e.pointerId)) return;
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size !== 2 || !pinchRef.current) return;
    const pinch = pinchRef.current;

    if (!pinch.confirmed) {
      // Require BOTH contacts to have actually moved from where they first
      // touched down before this counts as a pinch. One finger scrolling
      // near a second, essentially-stationary contact — a resting thumb or
      // palm while holding the tablet one-handed and scrolling with the
      // other hand — changes the gap between the two points too, so
      // checking only that gap (an earlier version of this check) still let
      // a scroll get misread as a pinch. Until confirmed here, this handler
      // never calls preventDefault or touches zoom/scroll, so a false start
      // costs nothing — native scrolling runs completely unimpeded for as
      // long as it takes to tell the difference, instead of being hijacked
      // and then handed back mid-gesture (which is what was causing pages
      // to get skipped: the browser's own scroll math doesn't know we'd
      // been overwriting scrollTop out from under it).
      let minMove = Infinity;
      for (const [id, start] of pinch.starts) {
        const current = pointersRef.current.get(id);
        if (!current) {
          minMove = 0;
          break;
        }
        minMove = Math.min(minMove, pointerDistance(current, start));
      }
      if (minMove < PINCH_MIN_PER_POINTER_MOVE_PX) return;
      pinch.confirmed = true;
    }

    e.preventDefault();
    const pts = [...pointersRef.current.values()];
    const dist = pointerDistance(pts[0], pts[1]);
    const { startDistance, startZoom, centerX, centerY } = pinch;
    if (startDistance <= 0) return;

    applyZoomAtPoint(clampZoom(startZoom * (dist / startDistance)), centerX, centerY);
  }, [applyZoomAtPoint]);

  const handleScrollAreaPointerUp = useCallback((e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
  }, []);

  // Tracks "current page" for the toolbar's page indicator. The native
  // scroll event can fire many times per animation frame (especially a
  // touch fling), and this was running unthrottled — a querySelectorAll
  // plus a getBoundingClientRect() per page, forcing a layout, on every
  // single one of those events. Coalescing to one pass per frame keeps the
  // same responsiveness while cutting that layout-thrash way down, which
  // matters most on the lower-powered tablets this file already works
  // around elsewhere (IS_LOW_MEMORY_CANVAS_DEVICE).
  const handleScroll = useCallback(() => {
    if (scrollRafRef.current != null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const root = scrollRef.current;
      if (!root) return;
      const mid = root.getBoundingClientRect().top + root.clientHeight * 0.35;
      const pages = root.querySelectorAll("[data-page]");
      for (const node of pages) {
        const rect = node.getBoundingClientRect();
        if (mid >= rect.top && mid < rect.bottom) {
          const p = Number(node.getAttribute("data-page"));
          setCurrentPage((prev) => (p && p !== prev ? p : prev));
          break;
        }
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (scrollRafRef.current != null) cancelAnimationFrame(scrollRafRef.current);
    };
  }, []);

  if (loading) {
    return <div className="pdf-preview-status">Loading preview pages…</div>;
  }
  if (error) {
    return (
      <div className="pdf-preview-status pdf-preview-status--error">
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, maxWidth: 360, textAlign: "center" }}>
          <span>{error}</span>
          <button
            type="button"
            className="pdf-preview-tool-btn"
            onClick={() => setLoadNonce((n) => n + 1)}
            style={{ padding: "6px 12px" }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (!pdf || numPages === 0) {
    return <div className="pdf-preview-status">No preview available</div>;
  }

  const offset = Math.max(0, Number(reportPageCount) || 0);

  return (
    <div
      ref={rootRef}
      className={[
        "pdf-preview-root",
        placementEnabled ? "pdf-preview-root--placeable" : "",
        isFullscreen ? "pdf-preview-root--fullscreen" : "",
        phone && phoneFullscreen ? "pdf-preview-root--phone-fullscreen" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="pdf-preview-toolbar">
        <div className="pdf-preview-toolbar-section pdf-preview-toolbar-section--pages">
          <button
            type="button"
            className="pdf-preview-tool-btn"
            onClick={goPrev}
            disabled={currentPage <= 1}
            title="Previous page"
            aria-label="Previous page"
          >
            <FiChevronLeft size={15} />
          </button>
          <label className="pdf-preview-page-field">
            <input
              type="text"
              inputMode="numeric"
              className="pdf-preview-page-input"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value.replace(/[^\d]/g, ""))}
              onBlur={commitPageInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitPageInput();
                }
              }}
              aria-label="Current page"
            />
            <span className="pdf-preview-page-total">/ {numPages}</span>
          </label>
          <button
            type="button"
            className="pdf-preview-tool-btn"
            onClick={goNext}
            disabled={currentPage >= numPages}
            title="Next page"
            aria-label="Next page"
          >
            <FiChevronRight size={15} />
          </button>
        </div>

        <div className="pdf-preview-toolbar-section pdf-preview-toolbar-section--zoom">
          <button
            type="button"
            className="pdf-preview-tool-btn"
            onClick={zoomOut}
            disabled={zoomLevel <= ZOOM_MIN + 0.001}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <FiZoomOut size={14} />
          </button>
          <select
            className="pdf-preview-zoom-select"
            value={zoomSelectValue}
            onChange={handleZoomSelect}
            title="Zoom level"
            aria-label="Zoom level"
          >
            <optgroup label="Fit">
              <option value="fit-page">Fit page</option>
              <option value="fit-width">Fit width</option>
            </optgroup>
            <optgroup label="Zoom">
              {ZOOM_PRESETS.map((preset) => (
                <option key={preset} value={String(preset)}>
                  {Math.round(preset * 100)}%
                </option>
              ))}
              {!ZOOM_PRESETS.some((p) => Math.abs(p - zoomLevel) < 0.02) && (
                <option value={String(zoomLevel)}>{zoomPercent}%</option>
              )}
            </optgroup>
          </select>
          <button
            type="button"
            className="pdf-preview-tool-btn"
            onClick={zoomIn}
            disabled={zoomLevel >= ZOOM_MAX - 0.001}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <FiZoomIn size={14} />
          </button>
        </div>

        <div className="pdf-preview-toolbar-section pdf-preview-toolbar-section--actions">
          <button
            type="button"
            className="pdf-preview-tool-btn pdf-preview-tool-btn--text"
            onClick={openExternal}
            title="Open this PDF in the browser so extensions like Kami can use it"
            aria-label={openExternalLabel}
          >
            <FiExternalLink size={14} />
            {openExternalLabel}
          </button>
          <div className="pdf-preview-fit-menu" ref={fitMenuRef}>
            <button
              type="button"
              className="pdf-preview-tool-btn pdf-preview-tool-btn--text"
              onClick={() => setFitMenuOpen((open) => !open)}
              title="View options"
              aria-expanded={fitMenuOpen}
            >
              Fit
            </button>
            {fitMenuOpen && (
              <div className="pdf-preview-fit-dropdown">
                <button type="button" onClick={() => { fitPage(); setFitMenuOpen(false); }}>
                  Fit page
                </button>
                <button type="button" onClick={() => { fitWidth(); setFitMenuOpen(false); }}>
                  Fit width
                </button>
                <button type="button" onClick={() => { resetZoom(); setFitMenuOpen(false); }}>
                  Actual size (100%)
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="pdf-preview-tool-btn"
            onClick={toggleFullscreen}
            title={isFullscreen || (phone && phoneFullscreen) ? "Exit fullscreen" : "Fullscreen"}
            aria-label={isFullscreen || (phone && phoneFullscreen) ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen || (phone && phoneFullscreen) ? <FiMinimize2 size={14} /> : <FiMaximize2 size={14} />}
          </button>
        </div>
      </div>

      {mobileEditing && placementEnabled && <MobilePlacementControls
        questions={effectiveQuestions}
        pageCount={Math.max(1, numPages - offset)}
        columnWidth={columnWidthPct}
        onPlacement={(patch) => {
          if (patch.examinerColumnWidthPercent != null) {
            const width = clampExaminerColumnWidthPercent(patch.examinerColumnWidthPercent);
            setLocalColumnWidthPct(width);
            onPlacementChange({ examinerColumnWidthPercent: width });
            return;
          }
          const q = effectiveQuestions.find(row => row._placementIndex === patch.placementIndex);
          if (q) setLocalPlacement(previous => ({ ...previous, [placementKey(q)]: { ...previous[placementKey(q)], ...patch } }));
          onPlacementChange(patch);
        }}
        onRename={onQuestionLabelChange}
        onRemove={removeEnabled ? handleQuestionRemove : null}
      />}
      <div
        ref={attachScrollRoot}
        className="pdf-preview-scroll"
        title={
          placementEnabled
            ? "Scroll to pan · Ctrl/⌘/Alt + wheel or pinch to zoom · drag boxes to move · drag box edges to resize · drag the notes column edge to widen it"
            : "Scroll to pan · Ctrl/⌘/Alt + wheel or pinch to zoom · double-click to zoom"
        }
        onPointerDown={handleScrollAreaPointerDown}
        onPointerMove={handleScrollAreaPointerMove}
        onPointerUp={handleScrollAreaPointerUp}
        onPointerCancel={handleScrollAreaPointerUp}
        onScroll={handleScroll}
      >
        <div
          className="pdf-preview-zoom-spacer"
          style={{
            width: Math.max(scaledWidth, baseRenderWidth),
            height: scaledHeight || undefined,
            minHeight: scaledHeight ? undefined : "100%",
          }}
        >
          <div
            ref={contentRef}
            className="pdf-preview-scroll-inner"
            style={{
              width: effectiveRenderWidth,
              transform: Math.abs(visualScale - 1) > 0.001 ? `scale(${visualScale})` : undefined,
              transformOrigin: "top left",
            }}
          >
            {Array.from({ length: numPages }, (_, i) => {
              const pageNumber = i + 1;
              const studentPageNumber = pageNumber - offset;
              const pageQuestions =
                placementEnabled && studentPageNumber > 0
                  ? byStudentPage.get(studentPageNumber) || []
                  : null;
              return (
                <LazyPdfPage
                  // No renderWidth in the key: LazyPdfPage's own effects already
                  // re-render its canvas at the new width in place (see the
                  // renderWidth-keyed effects inside it). Keying on renderWidth
                  // forced every page to fully unmount/remount on each zoom
                  // step, which for an instant briefly collapsed every page's
                  // canvas back to its unstyled default size — shrinking the
                  // measured scroll-content height enough that the browser
                  // clamped scrollTop back near 0, i.e. "zooming jumps to page 1".
                  key={`${url}-p${pageNumber}`}
                  pdf={pdf}
                  pageNumber={pageNumber}
                  renderWidth={effectiveRenderWidth}
                  scrollRoot={scrollRoot}
                  pageAspect={pageAspects[i]}
                  studentPageNumber={studentPageNumber}
                  pageQuestions={pageQuestions}
                  labelGuidance={labelGuidance}
                  duplicateQuestionNumbers={duplicateQuestionNumbers}
                  dragKey={dragKey}
                  editingLabelIndex={labelEditEnabled ? editingLabelIndex : null}
                  columnLeftPct={columnLeftPct}
                  columnWidthPct={columnWidthPct}
                  showColumnResize={placementEnabled && studentPageNumber > 0}
                  onHandlePointerDown={handlePointerDown}
                  onBoxResizePointerDown={handleBoxResizePointerDown}
                  onColumnResizePointerDown={handleColumnResizePointerDown}
                  onStartLabelEdit={labelEditEnabled ? handleStartLabelEdit : null}
                  onCommitLabel={handleCommitLabel}
                  onCancelLabelEdit={handleCancelLabelEdit}
                  onQuestionRemove={handleQuestionRemove}
                  showRemove={removeEnabled}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
