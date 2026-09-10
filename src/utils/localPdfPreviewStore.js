// Generated annotated previews already live in this browser tab. Retain their
// bytes beside the object URL so pdf.js is independent of blob URL lifecycle.
const previewBytes = new Map();

export function hasPdfHeader(bytes) {
  if (!bytes) return false;
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // ISO 32000 readers permit a small amount of leading transport junk, though
  // Sahahly-generated files normally begin with the header at byte zero.
  const limit = Math.min(view.byteLength - 4, 1024);
  for (let i = 0; i <= limit; i += 1) {
    if (
      view[i] === 0x25 && // %
      view[i + 1] === 0x50 && // P
      view[i + 2] === 0x44 && // D
      view[i + 3] === 0x46 && // F
      view[i + 4] === 0x2d // -
    ) {
      return true;
    }
  }
  return false;
}

export function rememberLocalPdfPreview(url, bytes) {
  if (!url || !bytes) return;
  previewBytes.set(url, bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
}

export function readLocalPdfPreview(url) {
  return previewBytes.get(url) || null;
}

export function forgetLocalPdfPreview(url) {
  if (url) previewBytes.delete(url);
}
