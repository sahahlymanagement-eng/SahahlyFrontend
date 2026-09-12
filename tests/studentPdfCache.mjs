import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { File } from 'node:buffer';

// Isolate caching from the UI validation dependency; downloads below are PDFs.
const source = (await readFile(new URL('../src/utils/studentPdfCache.js', import.meta.url), 'utf8'))
  .replace(/import \{ assertPdfBlob \} from [^;]+;/, '')
  .replace(/export /g, '');
const context = vm.createContext({ File, setTimeout, assertPdfBlob: async () => {} });
vm.runInContext(source + '\nthis.cacheApi = { fetchStudentPdf, invalidateStudentPdf, clearStudentPdfCache };', context);
const { fetchStudentPdf, invalidateStudentPdf, clearStudentPdfCache } = context.cacheApi;
const opts = { assignmentId: 'assignment', submissionId: 'student' };
const requests = [];
const api = { get: () => new Promise(resolve => requests.push(resolve)) };
const complete = (index, text) => requests[index]({ data: new Blob(['%PDF-1.7 ' + text]) });

const first = fetchStudentPdf(api, opts);
const concurrent = fetchStudentPdf(api, opts);
assert.equal(requests.length, 1);
complete(0, 'original');
const file = await first;
assert.equal(await concurrent, file);
assert.equal(await fetchStudentPdf(api, opts), file, 'Cached PDF retains its identity');
assert.equal(requests.length, 1);

invalidateStudentPdf(opts.assignmentId, opts.submissionId);
const stale = fetchStudentPdf(api, opts);
invalidateStudentPdf(opts.assignmentId, opts.submissionId);
const fresh = fetchStudentPdf(api, opts);
complete(1, 'stale');
await stale;
const alsoFresh = fetchStudentPdf(api, opts);
assert.equal(requests.length, 3, 'Old completion must not remove the new in-flight fetch');
complete(2, 'replacement');
const replacement = await fresh;
assert.notEqual(replacement, file);
assert.equal(await alsoFresh, replacement);
assert.equal(await fetchStudentPdf(api, opts), replacement);

clearStudentPdfCache();
const pending = fetchStudentPdf(api, opts);
clearStudentPdfCache();
complete(3, 'cleared');
await pending;
const afterClear = fetchStudentPdf(api, opts);
assert.equal(requests.length, 5, 'A completed old request must not undo a cache clear');
complete(4, 'new session');
await afterClear;
console.log('Student PDF reuse, concurrent fetches, replacement and clear races passed.');
