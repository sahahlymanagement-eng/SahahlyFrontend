import { PDFDocument } from "pdf-lib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import "./uint8ArrayToHexPolyfill";

// Some tablet annotation apps save a PDF with encrypted or non-standard page
// resources. pdf-lib can read those files, but copying their original drawing
// instructions into a new PDF can leave a viewer with black panels or missing
// annotation layers. Re-rendering the visible page into a clean PDF removes
// those fragile internals before Sahahly adds its own feedback.
const RASTER_SCALE = 1.5;

function createCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(width, height);
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error("This browser cannot create a PDF fallback canvas");
}

async function canvasToPngBytes(canvas) {
  if (typeof canvas.convertToBlob === "function") {
    return new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
  }
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Could not encode PDF page"))), "image/png");
  });
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Make a standards-safe visual copy of a source PDF. This is deliberately a
 * fallback: normal PDFs retain selectable text and stay much smaller.
 */
export async function flattenPdfForAnnotation(sourceBytes) {
  const loadingTask = getDocument({
    data: new Uint8Array(sourceBytes).slice(),
    // Works both in the normal export path and the preview Web Worker, and
    // avoids depending on a second worker URL while we are recovering a file.
    disableWorker: true,
    disableFontFace: true,
    isEvalSupported: false,
  });

  let source;
  try {
    source = await loadingTask.promise;
    const clean = await PDFDocument.create();

    for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber += 1) {
      const sourcePage = await source.getPage(pageNumber);
      const pageViewport = sourcePage.getViewport({ scale: 1 });
      const renderViewport = sourcePage.getViewport({ scale: RASTER_SCALE });
      const canvas = createCanvas(
        Math.max(1, Math.ceil(renderViewport.width)),
        Math.max(1, Math.ceil(renderViewport.height))
      );
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await sourcePage.render({ canvasContext: context, viewport: renderViewport }).promise;

      const image = await clean.embedPng(await canvasToPngBytes(canvas));
      const page = clean.addPage([pageViewport.width, pageViewport.height]);
      page.drawImage(image, {
        x: 0,
        y: 0,
        width: pageViewport.width,
        height: pageViewport.height,
      });
      sourcePage.cleanup?.();
      // Release the backing pixels before processing the next long scan.
      canvas.width = 1;
      canvas.height = 1;
    }

    return clean;
  } finally {
    try {
      await loadingTask.destroy();
    } catch {
      // Best-effort cleanup; the generated document is already independent.
    }
  }
}
