import assert from 'node:assert/strict';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import TestRenderer, { act } from 'react-test-renderer';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__previewReact = React;
globalThis.__previewJsx = jsxRuntime;
process.on('uncaughtException', err => { console.error(err.name + ': ' + err.message); process.exit(1); });
globalThis.window = { addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout };
globalThis.document = { addEventListener() {}, removeEventListener() {} };
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0);
globalThis.cancelAnimationFrame = clearTimeout;
globalThis.fetch = async () => new Response(new Uint8Array(200));
let loads = 0;
let complete;
let fail;
globalThis.__pdfLoad = () => {
  loads++;
  return { promise: new Promise((resolve, reject) => { complete = resolve; fail = reject; }), destroy: async () => {} };
};
const bundle = await build({
  stdin: { contents: 'export { default as Viewer } from "./src/components/AnnotatedPdfPreview.jsx";', resolveDir: root },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  define: { 'import.meta.env': JSON.stringify({ BASE_URL: '/' }) },
  plugins: [{ name: 'mock-platform', setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: 'react', namespace: 'mock-react' }));
    b.onLoad({ filter: /.*/, namespace: 'mock-react' }, () => ({ contents: 'export default globalThis.__previewReact; export const { useState, useEffect, useRef, useCallback, useMemo, useContext, createContext, forwardRef, createElement } = globalThis.__previewReact;' }));
    b.onResolve({ filter: /^react\/jsx-runtime$/ }, () => ({ path: 'jsx', namespace: 'mock-jsx' }));
    b.onLoad({ filter: /.*/, namespace: 'mock-jsx' }, () => ({ contents: 'export const { jsx, jsxs, Fragment } = globalThis.__previewJsx;' }));
    b.onResolve({ filter: /^pdfjs-dist\/legacy\/build\/pdf\.mjs$/ }, () => ({ path: 'pdf', namespace: 'mock-pdf' }));
    b.onLoad({ filter: /.*/, namespace: 'mock-pdf' }, () => ({ contents: 'export const GlobalWorkerOptions = {}; export const getDocument = () => globalThis.__pdfLoad();' }));
  } }],
});
const { Viewer } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
let renderer;
let loaded = 0;
let retries = 0;
const props = { url: 'blob:first', pdfSessionKey: 'student', onDocumentLoaded: () => loaded++, onStructuralError: () => retries++ };
await act(async () => { renderer = TestRenderer.create(React.createElement(Viewer, props)); });
assert.equal(loads, 1);
let firstDestroyed = false;
await act(async () => { complete({ numPages: 1, destroy: async () => { firstDestroyed = true; } }); });
assert.equal(loaded, 1);
const firstCanvas = renderer.root.findByType("canvas");
await act(async () => { renderer.update(React.createElement(Viewer, { ...props, onDocumentLoaded: () => loaded++ })); });
assert.equal(loads, 1, 'callback identity changes cannot reload the PDF');
await act(async () => { renderer.update(React.createElement(Viewer, { ...props, url: 'blob:second' })); });
assert.equal(firstDestroyed, false, 'previous document survives replacement loading');
assert.equal(renderer.root.findByType('canvas'), firstCanvas, 'same-student updates keep the current canvas mounted');
await act(async () => { fail(Error('Invalid Root reference')); });
assert.equal(retries, 1);
assert.equal(firstDestroyed, false, 'previous document survives replacement failure');
await act(async () => { renderer.update(React.createElement(Viewer, { ...props, url: 'blob:third' })); });
await act(async () => { fail(Error('Invalid Root reference')); });
assert.equal(retries, 1, 'automatic regeneration is bounded across new blob URLs');
await act(async () => { renderer.update(React.createElement(Viewer, { ...props, url: 'blob:fourth' })); });
let latestDestroyed = false;
await act(async () => { complete({ numPages: 1, destroy: async () => { latestDestroyed = true; } }); });
assert.equal(firstDestroyed, true);
await act(async () => { renderer.unmount(); });
assert.equal(latestDestroyed, true);
console.log('Viewer lifecycle: stable callbacks, retained document, failed replacement, bounded recovery and cleanup passed.');
