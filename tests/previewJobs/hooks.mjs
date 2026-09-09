import assert from 'node:assert/strict';
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__previewReact = React;
let buildMode = 'success';
let pendingBuild;
let builds = 0;
globalThis.__previewBuild = async options => {
  builds++;
  if (buildMode === 'failure') throw Error('Synthetic generation failure');
  if (buildMode === 'pending') return new Promise(resolve => { pendingBuild = resolve; });
  return Object.assign(new Uint8Array([1, 2, 3]), { reportPageCount: options.questions.length });
};
const result = await build({
  stdin: { contents: 'export { useExternalAnnotatedPreview } from "./src/hooks/useExternalAnnotatedPreview.js";', resolveDir: root },
  write: false, bundle: true, platform: 'node', format: 'esm',
  plugins: [{ name: 'isolated-io', setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const { useState, useEffect, useRef, useCallback, useMemo } = globalThis.__previewReact;' }));
    b.onLoad({ filter: /[\\/]utils[\\/]annotatePdf\.js$/ }, () => ({ contents: 'export const annotatePdf = options => globalThis.__previewBuild(options);' }));
  } }],
});
const { useExternalAnnotatedPreview } = await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
const questions = [{ questionNumber: '1', maxMarks: 2, marksAwarded: 1, pageNumber: 1 }];
const file = new File(['synthetic'], 'test.pdf');
const modal = id => ({ submissionId: id, result: { questions, maxTotalMarks: 2, summary: '' }, studentFile: file });
let props = { resultModal: modal('a'), editingQuestions: questions, editingAnnotations: [], editingSummary: '', effectiveMaxTotal: 2, editingMaxTotal: null, resolvePdfSummary: () => '', getStudentFile: async () => file, editorReadySubmissionId: 'a' };
let state;
function Harness() { state = useExternalAnnotatedPreview(props); return null; }
let renderer;
const settle = async (ms = 340) => act(async () => { await new Promise(r => setTimeout(r, ms)); });
await act(async () => { renderer = TestRenderer.create(React.createElement(Harness)); });
assert.equal(state.previewLoading, true);
await settle();
assert.equal(state.previewLoading, false);
assert.ok(state.annotatedPreviewUrl);
const previous = state.annotatedPreviewUrl;
buildMode = 'pending';
await act(async () => { state.retryPreview(); });
assert.equal(state.annotatedPreviewUrl, previous, 'old preview remains while updating');
await settle();
await act(async () => {
  props = { ...props, resultModal: modal('b'), editorReadySubmissionId: 'b' };
  renderer.update(React.createElement(Harness));
});
assert.equal(state.annotatedPreviewUrl, null, 'student A cannot remain visible for B');
buildMode = 'success';
await act(async () => { pendingBuild(new Uint8Array([9])); });
assert.equal(state.annotatedPreviewUrl, null, 'late A response cannot replace B');
await settle();
assert.ok(state.annotatedPreviewUrl);
assert.equal(state.previewLoading, false);
buildMode = 'failure';
await act(async () => { state.retryPreview(); });
await settle();
assert.equal(state.previewLoading, false);
assert.match(state.previewError, /Synthetic generation failure/);
buildMode = 'success';
await act(async () => { state.retryPreview(); });
await settle();
assert.equal(state.previewError, null);
const before = builds;
await act(async () => { for (let i = 0; i < 8; i++) state.refreshPreviewFromQuestions(questions); });
await settle();
assert.equal(builds, before + 1);
buildMode = 'pending';
let saved;
await act(async () => { saved = await state.confirmEdits(async ({ finalResult }) => finalResult); });
assert.ok(saved);
assert.equal(state.confirmingEdits, false, 'saving is released without waiting for generation');
assert.equal(state.previewLoading, true);
await settle();
await act(async () => { renderer.unmount(); });
pendingBuild(new Uint8Array([3]));
console.log('React lifecycle: initial load, rapid edits, preserved preview, switching students, stale response, failure, Retry, save independence and unmount passed.');
