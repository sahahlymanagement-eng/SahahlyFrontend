import { useEffect, useRef, useState, useCallback } from "react";
import { FiChevronLeft, FiChevronRight } from "react-icons/fi";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

/** Fit-to-width scale; cap pixel width so huge scans stay scrollable. */
const MAX_RENDER_WIDTH = 920;
const PREVIEW_SCALE_CAP = 1.35;

function LazyPdfPage({ pdf, pageNumber, containerWidth, scrollRoot }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const renderTaskRef = useRef(null);
  const renderedRef = useRef(false);
  const [placeholderH, setPlaceholderH] = useState(480);

  useEffect(() => {
    renderedRef.current = false;
    setPlaceholderH(480);
  }, [pdf, pageNumber, containerWidth]);

  useEffect(() => {
    if (!pdf || !wrapRef.current || !scrollRoot) return;

    const el = wrapRef.current;

    const renderPage = async () => {
      if (renderedRef.current) return;
      renderedRef.current = true;

      try {
        const page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        let scale = containerWidth / baseViewport.width;
        scale = Math.min(scale, PREVIEW_SCALE_CAP);
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d", { alpha: false });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        setPlaceholderH(viewport.height);

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
  }, [pdf, pageNumber, containerWidth, scrollRoot]);

  return (
    <div
      ref={wrapRef}
      className="pdf-preview-page"
      style={{ minHeight: placeholderH }}
      data-page={pageNumber}
    >
      <canvas ref={canvasRef} className="pdf-preview-canvas" />
    </div>
  );
}

/**
 * Lazy page-by-page PDF preview (replaces iframe for smoother scrolling on large scans).
 */
export default function AnnotatedPdfPreview({ url }) {
  const scrollRef = useRef(null);
  const [scrollRoot, setScrollRoot] = useState(null);
  const [pdf, setPdf] = useState(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [containerWidth, setContainerWidth] = useState(MAX_RENDER_WIDTH);
  const [currentPage, setCurrentPage] = useState(1);

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

  if (loading) {
    return <div className="pdf-preview-status">Loading preview pages…</div>;
  }
  if (error) {
    return <div className="pdf-preview-status pdf-preview-status--error">{error}</div>;
  }
  if (!pdf || numPages === 0) {
    return <div className="pdf-preview-status">No preview available</div>;
  }

  return (
    <div className="pdf-preview-root">
      <div className="pdf-preview-toolbar">
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
      <div
        ref={(node) => {
          scrollRef.current = node;
          setScrollRoot(node);
        }}
        className="pdf-preview-scroll"
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
        {Array.from({ length: numPages }, (_, i) => (
          <LazyPdfPage
            key={`${url}-p${i + 1}`}
            pdf={pdf}
            pageNumber={i + 1}
            containerWidth={containerWidth}
            scrollRoot={scrollRoot}
          />
        ))}
      </div>
    </div>
  );
}
