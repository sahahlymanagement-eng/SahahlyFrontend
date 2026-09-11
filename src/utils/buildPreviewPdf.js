// Keep expensive pdf-lib parsing/layout/serialization off the UI thread.
// Identity-based file keys prevent a replacement upload reusing an old preview.
const identities = new WeakMap();
let nextIdentity = 0;
const cache = new Map();
let cachedBytes = 0;
const MAX_BYTES = 80 * 1024 * 1024;
function identity(value) {
  if (!value || typeof value !== "object") return value;
  if (!identities.has(value)) identities.set(value, ++nextIdentity);
  return identities.get(value);
}

export async function buildPreviewPdf(options, { signal } = {}) {
  if (signal?.aborted) throw new DOMException("Preview cancelled", "AbortError");
  const { studentFile, teacherLogoBytes, ...settings } = options;
  const key = JSON.stringify([identity(studentFile), identity(teacherLogoBytes), settings]);
  if (cache.has(key)) {
    const bytes = cache.get(key);
    cache.delete(key);
    cache.set(key, bytes);
    return bytes;
  }
  const bytes = await new Promise((resolve, reject) => {
    let worker;
    let timer;
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      worker?.terminate();
      if (error) reject(error);
      else resolve(result);
    };
    const abort = () => finish(new DOMException("Preview cancelled", "AbortError"));
    try {
      worker = new Worker(new URL("./previewPdf.worker.js", import.meta.url), { type: "module" });
      signal?.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => finish(new Error("Building PDF preview timed out")), 300_000);
      worker.onerror = () => finish(new Error("PDF preview worker failed to start. Refresh the page and retry."));
      worker.onmessage = ({ data }) => {
        if (data.error) return finish(new Error(data.error));
        data.bytes.reportPageCount = data.reportPageCount;
        finish(null, data.bytes);
      };
      worker.postMessage(options);
    } catch (error) {
      finish(error);
    }
  });
  if (bytes.byteLength <= MAX_BYTES) {
    if (cache.has(key)) cachedBytes -= cache.get(key).byteLength;
    cache.set(key, bytes);
    cachedBytes += bytes.byteLength;
    while (cache.size > 6 || cachedBytes > MAX_BYTES) {
      const oldest = cache.keys().next().value;
      cachedBytes -= cache.get(oldest).byteLength;
      cache.delete(oldest);
    }
  }
  return bytes;
}
