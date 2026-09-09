import { assertPdfBlob } from './markingFormData';
import { withPdfFetchRetry } from './studentPdfCache';

const cache = new Map();
// The partner API has no stable file-version validator. Refresh source bytes
// after one minute; generated output is always keyed by their actual SHA-256.
export function fetchRemoteStudentPdf(api, endpoint) {
  const hit = cache.get(endpoint);
  if (hit && (hit.pending || hit.expires > Date.now())) return hit.promise;
  const entry = { pending: true };
  entry.promise = withPdfFetchRetry(async () => {
    const res = await api.get(endpoint, { responseType: 'blob', timeout: 30_000 });
    await assertPdfBlob(res.data, 'Student submission');
    return new File([res.data], 'submission.pdf', { type: 'application/pdf' });
  }, { attempts: 2 }).then(file => {
    entry.pending = false;
    entry.expires = Date.now() + 60_000;
    return file;
  }, err => {
    if (cache.get(endpoint) === entry) cache.delete(endpoint);
    throw err;
  });
  cache.set(endpoint, entry);
  while (cache.size > 4) cache.delete(cache.keys().next().value);
  return entry.promise;
}
