// Generated annotated previews already live in this browser tab. Retain their
// bytes beside the object URL so pdf.js is independent of blob URL lifecycle.
const previewBytes = new Map();

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
