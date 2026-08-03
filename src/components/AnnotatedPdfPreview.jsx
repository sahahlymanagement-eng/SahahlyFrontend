import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  FiChevronLeft,
  FiChevronRight,
  FiZoomIn,
  FiZoomOut,
  FiMaximize2,
  FiMinimize2,
} from "react-icons/fi";
import "../utils/uint8ArrayToHexPolyfill";
// Legacy build includes browser polyfills (e.g. Uint8Array#toHex) so PDF preview
// works on Chromium/Edge builds that don't ship that API yet.
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";
import { version as pdfjsVersion } from "pdfjs-dist/package.json";
import { buildDuplicateQuestionNumberSet, formatQuestionLabelWithPage } from "../utils/questionLabelDisplay";
import { placementKey } from "../utils/markingFormData";
import { resolveBadgeYPercentsForPage } from "../utils/normalizeQuestionPlacement";

// CDN legacy worker must match the legacy API build above
GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/legacy/build/pdf.worker.min.mjs`;

const MAX_RENDER_WIDTH = 720;
const MAX_RENDER_PIXEL_WIDTH = 3200;
const RENDER_ZOOM_DEBOUNCE_MS = 120;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP_BTN = 0.1;
const ZOOM_WHEEL_STEP = 0.08;
const DEFAULT_ZOOM = 1;
const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

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

/** Examiner column is ~178pt on ~595pt paper → ~23% of annotated page width. */
const RIGHT_COL_LEFT_PCT = 76;
const LEFT_COL_WIDTH_PCT = 11;
const RIGHT_COL_WIDTH_PCT = 23;

function clampYPercent(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 30;
  return Math.min(92, Math.max(5, Math.round(v * 100) / 100));
}

function PlacementHandle({
  q,
  displayNumber,
  column,
  yPercent,
  active,
  onPointerDown,
  onRemove,
  showRemove,
  zIndex,
}) {
  const labelNum = displayNumber || q?.questionNumber;
  const label =
    column === "left"
      ? `Q${labelNum} ${q.marksAwarded ?? "?"}/${q.maxMarks ?? "?"}`
      : `Q${labelNum}`;

  return (
    <div
      className={`pdf-place-handle pdf-place-handle--${column}${active ? " pdf-place-handle--active" : ""}`}
      style={{
        top: `${yPercent}%`,
        left: column === "left" ? "0.6%" : `${RIGHT_COL_LEFT_PCT}%`,
        width: column === "left" ? `${LEFT_COL_WIDTH_PCT}%` : `${RIGHT_COL_WIDTH_PCT}%`,
        zIndex: zIndex ?? undefined,
      }}
      onPointerDown={(e) => onPointerDown(e, q, column, yPercent)}
      title="Drag to move this marking box (any page). Positions apply on Confirm Edits."
    >
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
      <span className="pdf-place-handle__label">{label}</span>
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
        const maxScale = MAX_RENDER_PIXEL_WIDTH / baseViewport.width;
        scale = Math.min(scale, maxScale);
        const viewport = page.getViewport({ scale });
        const dpr = Math.min(window.devicePixelRatio || 1, 3);

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d", { alpha: false });
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        setRendered(true);

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
      { root: scrollRoot, rootMargin: "320px 0px", threshold: 0.01 }
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
  }, [pdf, pageNumber, renderWidth, scrollRoot]);

  const showHandles = Array.isArray(pageQuestions) && pageQuestions.length > 0;

  return (
    <div
      ref={wrapRef}
      className={`pdf-preview-page${rendered ? " pdf-preview-page--ready" : ""}`}
      data-page={pageNumber}
      data-student-page={studentPageNumber > 0 ? studentPageNumber : undefined}
    >
      <canvas ref={canvasRef} className="pdf-preview-canvas" />
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
            return (
              <div key={`place-${item.placementIndex ?? key}`} className="pdf-place-handle-group">
                <PlacementHandle
                  q={q}
                  displayNumber={displayNumber}
                  column="left"
                  yPercent={yPercent}
                  zIndex={stackZ}
                  active={dragKey === `${key}:left`}
                  onPointerDown={onHandlePointerDown}
                  onRemove={onQuestionRemove}
                  showRemove={showRemove}
                />
                <PlacementHandle
                  q={q}
                  displayNumber={displayNumber}
                  column="right"
                  yPercent={yPercent}
                  zIndex={stackZ + 1}
                  active={dragKey === `${key}:right`}
                  onPointerDown={onHandlePointerDown}
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
 * Optional placementQuestions + onPlacementChange: drag boxes across pages;
 * parent should apply pageNumber/yPercent and only regenerate on Confirm Edits.
 */
export default function AnnotatedPdfPreview({
  url,
  placementQuestions = null,
  reportPageCount = 0,
  onPlacementChange = null,
  onQuestionRemove = null,
  labelGuidance = "",
}) {
  const rootRef = useRef(null);
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const [scrollRoot, setScrollRoot] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
  const [dragKey, setDragKey] = useState(null);
  const fitMenuRef = useRef(null);
  const dragRef = useRef(null);
  const pinchRef = useRef(null);
  const pointersRef = useRef(new Map());
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });
  const zoomRef = useRef(DEFAULT_ZOOM);

  const placementEnabled =
    Array.isArray(placementQuestions) && typeof onPlacementChange === "function";
  const removeEnabled = typeof onQuestionRemove === "function";

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
        const q = placementQuestions?.[questionIndex];
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
    setZoomLevel(DEFAULT_ZOOM);
    setRenderZoom(DEFAULT_ZOOM);
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
    setRenderZoom(DEFAULT_ZOOM);

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
      };
    });
  }, [placementEnabled, placementQuestions, localPlacement]);

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
        key,
        column,
        placementIndex: q._placementIndex,
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
      setRenderZoom(clamped);
      zoomRef.current = clamped;
      return;
    }

    const rect = root.getBoundingClientRect();
    const ratio = clamped / oldZoom;
    const offsetX = clientX - rect.left + root.scrollLeft;
    const offsetY = clientY - rect.top + root.scrollTop;

    setZoomLevel(clamped);
    zoomRef.current = clamped;
    setRenderZoom(clamped);

    requestAnimationFrame(() => {
      root.scrollLeft = offsetX * ratio - (clientX - rect.left);
      root.scrollTop = offsetY * ratio - (clientY - rect.top);
    });
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
    if (e.target.closest(".pdf-place-handle")) return;

    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointersRef.current.size === 2) {
      const pts = [...pointersRef.current.values()];
      pinchRef.current = {
        startDistance: pointerDistance(pts[0], pts[1]),
        startZoom: zoomRef.current,
        centerX: (pts[0].x + pts[1].x) / 2,
        centerY: (pts[0].y + pts[1].y) / 2,
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
    e.preventDefault();

    const pts = [...pointersRef.current.values()];
    const dist = pointerDistance(pts[0], pts[1]);
    const { startDistance, startZoom, centerX, centerY } = pinchRef.current;
    if (startDistance <= 0) return;

    applyZoomAtPoint(clampZoom(startZoom * (dist / startDistance)), centerX, centerY);
  }, [applyZoomAtPoint]);

  const handleScrollAreaPointerUp = useCallback((e) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) {
      pinchRef.current = null;
    }
  }, []);

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
    <div
      ref={rootRef}
      className={[
        "pdf-preview-root",
        placementEnabled ? "pdf-preview-root--placeable" : "",
        isFullscreen ? "pdf-preview-root--fullscreen" : "",
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
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <FiMinimize2 size={14} /> : <FiMaximize2 size={14} />}
          </button>
        </div>
      </div>

      <div
        ref={(node) => {
          scrollRef.current = node;
          setScrollRoot(node);
        }}
        className="pdf-preview-scroll"
        title={
          placementEnabled
            ? "Scroll to pan · Ctrl/⌘/Alt + wheel or pinch to zoom · double-click to zoom · drag boxes to reposition"
            : "Scroll to pan · Ctrl/⌘/Alt + wheel or pinch to zoom · double-click to zoom"
        }
        onPointerDown={handleScrollAreaPointerDown}
        onPointerMove={handleScrollAreaPointerMove}
        onPointerUp={handleScrollAreaPointerUp}
        onPointerCancel={handleScrollAreaPointerUp}
        onScroll={() => {
          const root = scrollRef.current;
          if (!root) return;
          const mid = root.getBoundingClientRect().top + root.clientHeight * 0.35;
          const pages = root.querySelectorAll("[data-page]");
          for (const node of pages) {
            const rect = node.getBoundingClientRect();
            if (mid >= rect.top && mid < rect.bottom) {
              const p = Number(node.getAttribute("data-page"));
              if (p && p !== currentPage) setCurrentPage(p);
              break;
            }
          }
        }}
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
                  key={`${url}-p${pageNumber}-w${effectiveRenderWidth}`}
                  pdf={pdf}
                  pageNumber={pageNumber}
                  renderWidth={effectiveRenderWidth}
                  scrollRoot={scrollRoot}
                  studentPageNumber={studentPageNumber}
                  pageQuestions={pageQuestions}
                  labelGuidance={labelGuidance}
                  duplicateQuestionNumbers={duplicateQuestionNumbers}
                  dragKey={dragKey}
                  onHandlePointerDown={handlePointerDown}
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
