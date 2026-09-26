import { PDFDocument } from "pdf-lib";

const A4_WIDTH_PT = 595.28;
const A4_HEIGHT_PT = 841.89;
/** Pages larger than this edge (pt) are phone/scan PDFs placed 1px≈1pt. */
const DEFAULT_MAX_EDGE_PT = 1000;

function pageContentSizePt(page) {
  const box = page.getCropBox();
  const rot = (((page.getRotation?.().angle || 0) % 360) + 360) % 360;
  if (rot === 90 || rot === 270) {
    return { width: box.height, height: box.width };
  }
  return { width: box.width, height: box.height };
}

/**
 * True when any page is large enough that absolute-pt annotation fonts look tiny.
 */
export async function pdfNeedsPageNormalize(inputBytes, maxEdgePt = DEFAULT_MAX_EDGE_PT) {
  try {
    const src = await PDFDocument.load(inputBytes, { ignoreEncryption: true });
    for (const page of src.getPages()) {
      const { width, height } = pageContentSizePt(page);
      if (width > maxEdgePt || height > maxEdgePt) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Fit oversized scan pages onto A4 (portrait or landscape). Same rule as the
 * server-side indexing prepare path — normal pages are copied unchanged.
 */
export async function normalizePdfPagesToA4(inputBytes, label = "pdf") {
  if (!inputBytes?.byteLength && !inputBytes?.length) {
    return { bytes: inputBytes, applied: false, pagesNormalized: 0, reason: "empty file" };
  }

  let src;
  try {
    src = await PDFDocument.load(inputBytes, { ignoreEncryption: true });
  } catch (err) {
    return { bytes: inputBytes, applied: false, pagesNormalized: 0, reason: err.message };
  }

  const maxEdge = DEFAULT_MAX_EDGE_PT;
  const srcPages = src.getPages();
  const oversize = [];
  for (let i = 0; i < srcPages.length; i++) {
    const { width, height } = pageContentSizePt(srcPages[i]);
    if (width > maxEdge || height > maxEdge) oversize.push(i);
  }

  if (!oversize.length) {
    return { bytes: inputBytes, applied: false, pagesNormalized: 0 };
  }

  try {
    const out = await PDFDocument.create();
    const oversizeSet = new Set(oversize);

    for (let i = 0; i < srcPages.length; i++) {
      if (!oversizeSet.has(i)) {
        const [copied] = await out.copyPages(src, [i]);
        out.addPage(copied);
        continue;
      }

      const srcPage = srcPages[i];
      const { width: contentW, height: contentH } = pageContentSizePt(srcPage);
      const landscape = contentW > contentH;
      const targetW = landscape ? A4_HEIGHT_PT : A4_WIDTH_PT;
      const targetH = landscape ? A4_WIDTH_PT : A4_HEIGHT_PT;
      const scale = Math.min(targetW / contentW, targetH / contentH);
      const drawnW = contentW * scale;
      const drawnH = contentH * scale;

      const embedded = await out.embedPage(srcPage);
      const page = out.addPage([targetW, targetH]);
      page.drawPage(embedded, {
        x: (targetW - drawnW) / 2,
        y: (targetH - drawnH) / 2,
        width: drawnW,
        height: drawnH,
      });
    }

    const saved = await out.save({ useObjectStreams: false });
    console.info(
      `[pdf-normalize] ${label}: fitted ${oversize.length}/${srcPages.length} oversized page(s) to A4`
    );
    return { bytes: saved, applied: true, pagesNormalized: oversize.length };
  } catch (err) {
    console.warn(`[pdf-normalize] ${label}:`, err.message);
    return { bytes: inputBytes, applied: false, pagesNormalized: 0, reason: err.message };
  }
}
