import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { FiChevronLeft, FiChevronRight, FiZoomIn, FiZoomOut } from "react-icons/fi";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { version as pdfjsVersion } from "pdfjs-dist/package.json";

// CDN worker avoids nginx serving bundled .mjs as application/octet-stream on VPS
GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

/** Fit-to-width scale; cap pixel width so huge scans stay scrollable. */
const MAX_RENDER_WIDTH = 920;
const PREVIEW_SCALE_CAP = 1.35;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 3;
const ZOOM_STEP_BTN = 0.1;
const ZOOM_SLIDER_STEP = 5;
const DEFAULT_ZOOM = 1;
const PAN_ZOOM_THRESHOLD = 1.02;

function clampZoom(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_ZOOM;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(n * 100) / 100));
}

/** Examiner column is ~178pt on ~595pt paper → ~23% of annotated page width. */
const RIGHT_COL_LEFT_PCT = 76;
const LEFT_COL_WIDTH_PCT = 11;
const RIGHT_COL_WIDTH_PCT = 23;

function clampYPercent(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 30;
  return Math.min(92, Math.max(5, Math.round(v * 100) / 100));
}

function questionKey(q) {
  return String(q?.questionNumber ?? "");
}

function PlacementHandle({
  q,
  column,
  yPercent,
  active,
  onPointerDown,
  onRemove,
  showRemove,
}) {
  const label =
    column === "left"
      ? `Q${q.questionNumber} ${q.marksAwarded ?? "?"}/${q.maxMarks ?? "?"}`
      : `Q${q.questionNumber}`;

  return (
    <div
      className={`pdf-place-handle pdf-place-handle--${column}${active ? " pdf-place-handle--active" : ""}`}
      style={{
        top: `${yPercent}%`,
        left: column === "left" ? "0.6%" : `${RIGHT_COL_LEFT_PCT}%`,
        width: column === "left" ? `${LEFT_COL_WIDTH_PCT}%` : `${RIGHT_COL_WIDTH_PCT}%`,
      }}
      onPointerDown={(e) => onPointerDown(e, q, column)}
      title="Drag to move this marking box (any page). Positions apply on Confirm Edits."
    >
      {showRemove && column === "left" && (
        <button
          type="button"
          className="pdf-place-handle__remove"
          title={`Remove Q${q.questionNumber} from marking`}
          aria-label={`Remove question ${q.questionNumber}`}
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
      <span className="pdf-place-handle__grip" aria-hidden>
        ⠿
      </span>
      <span className="pdf-place-handle__label">{label}</span>
    </div>
  );
}

function LazyPdfPage({
  pdf,
  pageNumber,
  renderWidth,
  zoomLevel,
  scrollRoot,
  studentPageNumber,
  pageQuestions,
  dragKey,
  onHandlePointerDown,
  onQuestionRemove,
  showRemove,
}) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const renderedRef = useRef(false);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    renderedRef.current = false;
    setRendered(false);
  }, [pdf, pageNumber, renderWidth]);

  useEffect(() => {
    if (!pdf || !wrapRef.current || !scrollRoot) return;

    const el = wrapRef.current;

    const renderPage = async () => {
      if (renderedRef.current) return;
      renderedRef.current = true;

      try {
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        let scale = renderWidth / baseViewport.width;
        if (zoomLevel <= 1.001 && renderWidth <= MAX_RENDER_WIDTH) {
          scale = Math.min(scale, PREVIEW_SCALE_CAP);
        }
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d", { alpha: false });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        setRendered(true);

        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // ignore
          }
        }

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (err) {
        if (err?.name !== "RenderingCancelledException") {
          console.warn("[AnnotatedPdfPreview] page render:", err);
        }
        renderedRef.current = false;
        setRendered(false);
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          renderPage();
        }
      },
      { root: scrollRoot, rootMargin: "240px 0px", threshold: 0.01 }
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdf, pageNumber, renderWidth, zoomLevel, scrollRoot]);

  const showHandles = Array.isArray(pageQuestions) && pageQuestions.length > 0;

  return (
    <div
      ref={wrapRef}
      className={`pdf-preview-page${rendered ? " pdf-preview-page--ready" : ""}`}
      data-page={pageNumber}
      data-student-page={studentPageNumber > 0 ? studentPageNumber : undefined}
    >
      <canvas ref={canvasRef} className="pdf-preview-canvas" />
      {showHandles &&
        pageQuestions.map((item) => {
          const { q, yPercent } = item;
          const key = questionKey(q);
          return (
            <div key={`place-${item.placementIndex}`} className="pdf-place-layer">
              <PlacementHandle
                q={q}
                column="left"
                yPercent={yPercent}
                active={dragKey === `${key}:left`}
                onPointerDown={onHandlePointerDown}
                onRemove={onQuestionRemove}
                showRemove={showRemove}
              />
              <PlacementHandle
                q={q}
                column="right"
                yPercent={yPercent}
                active={dragKey === `${key}:right`}
                onPointerDown={onHandlePointerDown}
                showRemove={false}
              />
            </div>
          );
        })}
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
      // Pointer is between pages: snap to the nearest edge of this page
      // instead of extrapolating a percentage past its bounds.
      const yPercent = clientY < rect.top ? 5 : 92;
      best = { studentPage, yPercent, pageEl: el };
    }
  }

  if (best) return best;

  // Fallback: first student page
  const first = Math.max(1, 1);
  void reportOffset;
  return { studentPage: first, yPercent: 30, pageEl: null };
}

/**
 * Lazy page-by-page PDF preview.
 * Optional placementQuestions + onPlacementChange: drag boxes across pages;
 * parent should apply pageNumber/yPercent and only regenerate on Confirm Edits.
 */
export default function AnnotatedPdfPreview({
  url,
  placementQuestions = null,
  reportPageCount = 0,
  onPlacementChange = null,
  onQuestionRemove = null,
}) {
  const scrollRef = useRef(null);
  const [scrollRoot, setScrollRoot] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [containerWidth, setContainerWidth] = useState(MAX_RENDER_WIDTH);
  const [zoomLevel, setZoomLevel] = useState(DEFAULT_ZOOM);
  const [currentPage, setCurrentPage] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  /** Local drag overrides: { [questionNumber]: { pageNumber, yPercent } } */
  const [localPlacement, setLocalPlacement] = useState({});
  const [dragKey, setDragKey] = useState(null);
  const dragRef = useRef(null);
  const panRef = useRef(null);

  const placementEnabled =
    Array.isArray(placementQuestions) && typeof onPlacementChange === "function";
  const removeEnabled = typeof onQuestionRemove === "function";

  const handleQuestionRemove = useCallback(
    (questionIndex) => {
      if (!removeEnabled) return;
      onQuestionRemove(questionIndex);
      setLocalPlacement((prev) => {
        const q = placementQuestions?.[questionIndex];
        if (!q) return prev;
        const key = questionKey(q);
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [removeEnabled, onQuestionRemove, placementQuestions]
  );

  useEffect(() => {
    setLocalPlacement({});
    setZoomLevel(DEFAULT_ZOOM);
  }, [url]);

  useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 0) {
        setContainerWidth(Math.min(Math.floor(w - 16), MAX_RENDER_WIDTH));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!url) {
      setPdf(null);
      setNumPages(0);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setCurrentPage(1);
    setZoomLevel(DEFAULT_ZOOM);

    (async () => {
      try {
        const loadingTask = getDocument({ url, disableAutoFetch: false, disableStream: false });
        const doc = await loadingTask.promise;
        if (cancelled) {
          await doc.destroy();
          return;
        }
        setPdf(doc);
        setNumPages(doc.numPages);
      } catch (err) {
        if (!cancelled) {
          console.error("[AnnotatedPdfPreview] load:", err);
          setError(err.message || "Failed to load PDF preview");
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
  }, [url]);

  const effectiveQuestions = useMemo(() => {
    if (!placementEnabled) return [];
    return placementQuestions.map((q, placementIndex) => {
      const key = questionKey(q);
      const override = localPlacement[key];
      return {
        ...q,
        _placementIndex: q._placementIndex ?? placementIndex,
        pageNumber: Math.max(
          1,
          Number(override?.pageNumber ?? q.pageNumber) || 1
        ),
        yPercent: clampYPercent(override?.yPercent ?? q.yPercent),
      };
    });
  }, [placementEnabled, placementQuestions, localPlacement]);

  const byStudentPage = useMemo(() => {
    const map = new Map();
    for (const q of effectiveQuestions) {
      const p = Math.max(1, Number(q.pageNumber) || 1);
      if (!map.has(p)) map.set(p, []);
      map.get(p).push({ q, yPercent: clampYPercent(q.yPercent), placementIndex: q._placementIndex });
    }
    return map;
  }, [effectiveQuestions]);

  const handlePointerDown = useCallback(
    (e, q, column) => {
      if (!placementEnabled) return;
      e.preventDefault();
      e.stopPropagation();

      const key = questionKey(q);
      const studentPage = Math.max(1, Number(q.pageNumber) || 1);
      const startY = clampYPercent(q.yPercent);

      // The handle is centered on its anchor line (translateY(-50%)). Remember
      // where inside the handle the user grabbed so the anchor doesn't snap to
      // the cursor on the first move — that jump made drags land inaccurately.
      const rect = e.currentTarget.getBoundingClientRect();
      const grabOffsetY = e.clientY - (rect.top + rect.height / 2);

      dragRef.current = {
        key,
        column,
        questionNumber: q.questionNumber,
        pageNumber: studentPage,
        startY,
        grabOffsetY,
      };
      setDragKey(`${key}:${column}`);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [placementEnabled]
  );

  useEffect(() => {
    if (!dragKey) return;

    const onMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      const anchorY = e.clientY - (drag.grabOffsetY || 0);
      const hit = resolveStudentPageUnderPointer(
        scrollRef.current,
        anchorY,
        Math.max(0, Number(reportPageCount) || 0)
      );
      if (!hit) return;

      // Auto-scroll near edges while dragging across pages
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
        [drag.key]: { pageNumber, yPercent },
      }));
      dragRef.current = null;
      setDragKey(null);
      // Parent updates editingQuestions only — PDF regenerates on Confirm Edits
      onPlacementChange?.({
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
    const root = scrollRef.current;
    if (!root) return;
    const target = root.querySelector(`[data-page="${pageNum}"]`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    setCurrentPage(pageNum);
  }, []);

  const goPrev = () => scrollToPage(Math.max(1, currentPage - 1));
  const goNext = () => scrollToPage(Math.min(numPages, currentPage + 1));

  const renderWidth = Math.max(240, Math.floor(containerWidth * zoomLevel));
  const zoomPercent = Math.round(zoomLevel * 100);
  const canPan = zoomLevel > PAN_ZOOM_THRESHOLD;

  const zoomOut = () => setZoomLevel((z) => clampZoom(z - ZOOM_STEP_BTN));
  const zoomIn = () => setZoomLevel((z) => clampZoom(z + ZOOM_STEP_BTN));
  const resetZoom = () => setZoomLevel(DEFAULT_ZOOM);
  const setZoomFromSlider = (pct) => setZoomLevel(clampZoom(pct / 100));

  const handlePreviewWheel = useCallback((e) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoomLevel((z) => clampZoom(z + delta));
  }, []);

  const handlePanPointerDown = useCallback(
    (e) => {
      if (dragKey) return;
      if (e.target.closest(".pdf-place-handle")) return;

      const root = scrollRef.current;
      if (!root) return;

      const middleClick = e.button === 1;
      const leftClick = e.button === 0;
      if (!middleClick && !(leftClick && canPan)) return;

      e.preventDefault();
      e.stopPropagation();
      panRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: root.scrollLeft,
        scrollTop: root.scrollTop,
      };
      setIsPanning(true);
    },
    [canPan, dragKey]
  );

  useEffect(() => {
    if (!isPanning) return;

    const onMove = (e) => {
      const pan = panRef.current;
      if (!pan || pan.pointerId !== e.pointerId) return;
      const root = scrollRef.current;
      if (!root) return;
      e.preventDefault();
      root.scrollLeft = pan.scrollLeft - (e.clientX - pan.startX);
      root.scrollTop = pan.scrollTop - (e.clientY - pan.startY);
    };

    const onUp = (e) => {
      const pan = panRef.current;
      if (!pan || (e.pointerId != null && pan.pointerId !== e.pointerId)) return;
      panRef.current = null;
      setIsPanning(false);
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [isPanning]);

  if (loading) {
    return <div className="pdf-preview-status">Loading preview pages…</div>;
  }
  if (error) {
    return <div className="pdf-preview-status pdf-preview-status--error">{error}</div>;
  }
  if (!pdf || numPages === 0) {
    return <div className="pdf-preview-status">No preview available</div>;
  }

  const offset = Math.max(0, Number(reportPageCount) || 0);

  return (
    <div className={`pdf-preview-root${placementEnabled ? " pdf-preview-root--placeable" : ""}`}>
      <div className="pdf-preview-toolbar">
        <div className="pdf-preview-toolbar-group">
          <button type="button" className="pdf-preview-nav" onClick={goPrev} disabled={currentPage <= 1}>
            <FiChevronLeft size={16} />
          </button>
          <span className="pdf-preview-page-label">
            Page {currentPage} / {numPages}
          </span>
          <button
            type="button"
            className="pdf-preview-nav"
            onClick={goNext}
            disabled={currentPage >= numPages}
          >
            <FiChevronRight size={16} />
          </button>
        </div>
        <div className="pdf-preview-toolbar-group pdf-preview-zoom">
          <button
            type="button"
            className="pdf-preview-nav"
            onClick={zoomOut}
            disabled={zoomLevel <= ZOOM_MIN + 0.001}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <FiZoomOut size={15} />
          </button>
          <input
            type="range"
            className="pdf-preview-zoom-slider"
            min={ZOOM_MIN * 100}
            max={ZOOM_MAX * 100}
            step={ZOOM_SLIDER_STEP}
            value={zoomPercent}
            onChange={(e) => setZoomFromSlider(Number(e.target.value))}
            aria-label="Zoom level"
            title="Drag to adjust zoom"
          />
          <span className="pdf-preview-zoom-readout">{zoomPercent}%</span>
          <button
            type="button"
            className="pdf-preview-nav"
            onClick={zoomIn}
            disabled={zoomLevel >= ZOOM_MAX - 0.001}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <FiZoomIn size={15} />
          </button>
          <button
            type="button"
            className="pdf-preview-fit-btn"
            onClick={resetZoom}
            title="Fit to panel width"
          >
            Fit
          </button>
        </div>
        <span className="pdf-preview-pan-hint">Ctrl+scroll to zoom · drag to pan when zoomed</span>
        {placementEnabled && (
          <span className="pdf-preview-place-hint">
            Drag boxes to any page · × removes a question — applies on Confirm Edits
          </span>
        )}
      </div>
      <div
        ref={(node) => {
          scrollRef.current = node;
          setScrollRoot(node);
        }}
        className={[
          "pdf-preview-scroll",
          zoomLevel > PAN_ZOOM_THRESHOLD ? "pdf-preview-scroll--zoomed" : "",
          canPan ? "pdf-preview-scroll--pan-ready" : "",
          isPanning ? "pdf-preview-scroll--panning" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onWheel={handlePreviewWheel}
        onPointerDown={handlePanPointerDown}
        onScroll={() => {
          const root = scrollRef.current;
          if (!root) return;
          const mid = root.scrollTop + root.clientHeight * 0.35;
          const pages = root.querySelectorAll("[data-page]");
          for (const node of pages) {
            const top = node.offsetTop;
            const bottom = top + node.offsetHeight;
            if (mid >= top && mid < bottom) {
              const p = Number(node.getAttribute("data-page"));
              if (p && p !== currentPage) setCurrentPage(p);
              break;
            }
          }
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
              key={`${url}-p${pageNumber}-z${zoomLevel}`}
              pdf={pdf}
              pageNumber={pageNumber}
              renderWidth={renderWidth}
              zoomLevel={zoomLevel}
              scrollRoot={scrollRoot}
              studentPageNumber={studentPageNumber}
              pageQuestions={pageQuestions}
              dragKey={dragKey}
              onHandlePointerDown={handlePointerDown}
              onQuestionRemove={handleQuestionRemove}
              showRemove={removeEnabled}
            />
          );
        })}
      </div>
    </div>
  );
}
