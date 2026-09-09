// Session-only, bounded cache. Keys are content hashes, never logged.
const completed = new Map();
const pending = new Map();
let bytesHeld = 0;
const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 6;

export function clearGeneratedPdfCache() {
  completed.clear();
  bytesHeld = 0;
}

export function previewTiming(stage, started, details = {}) {
  console.debug('[pdf-preview]', { stage, ms: Math.round(performance.now() - started), ...details });
}

export function abortError() {
  return new DOMException('Preview cancelled', 'AbortError');
}

export function waitForPreview(promise, signal, timeout = 120_000) {
  return new Promise((resolve, reject) => {
    const abort = () => finish(reject, signal.reason || abortError());
    const timer = setTimeout(() => finish(reject, new Error('Preview timed out. Please Retry.')), timeout);
    const finish = (fn, value) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      fn(value);
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    Promise.resolve(promise).then(v => finish(resolve, v), e => finish(reject, e));
  });
}

export async function digest(data) {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

export function stableJson(value) {
  if (Array.isArray(value)) return '[' + value.map(v => stableJson(v) ?? 'null').join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort()
    .filter(k => value[k] !== undefined).map(k => JSON.stringify(k) + ':' + stableJson(value[k])).join(',') + '}';
  return JSON.stringify(value);
}

export async function cachedPdf(key, build, signal) {
  signal?.throwIfAborted();
  const started = performance.now();
  if (completed.has(key)) {
    const bytes = completed.get(key);
    completed.delete(key);
    completed.set(key, bytes);
    previewTiming('cache', started, { hit: true });
    return bytes;
  }
  let entry = pending.get(key);
  if (!entry) {
    const controller = new AbortController();
    entry = { controller, users: 0 };
    entry.promise = waitForPreview(Promise.resolve().then(() => build(controller.signal)), controller.signal)
      .then(bytes => {
        if (!controller.signal.aborted && bytes.byteLength <= MAX_BYTES) {
          completed.set(key, bytes);
          bytesHeld += bytes.byteLength;
          while (bytesHeld > MAX_BYTES || completed.size > MAX_ENTRIES) {
            const oldest = completed.keys().next().value;
            bytesHeld -= completed.get(oldest).byteLength;
            completed.delete(oldest);
          }
        }
        return bytes;
      }).finally(() => {
        controller.abort();
        if (pending.get(key) === entry) pending.delete(key);
      });
    pending.set(key, entry);
  }
  entry.users++;
  try {
    return await waitForPreview(entry.promise, signal);
  } finally {
    entry.users--;
    if (!entry.users && pending.get(key) === entry) {
      pending.delete(key);
      entry.controller.abort();
    }
    previewTiming('generation', started);
  }
}

export function previewDelay(signal, ms = 300) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason || abortError()); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  });
}
