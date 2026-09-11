import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import vm from "node:vm";
import { PDFDocument } from "pdf-lib";
import { buildPreviewPdf } from "../src/utils/buildPreviewPdf.js";

let starts = 0;
let stops = 0;
class TestWorker {
  constructor() { starts++; }
  postMessage() {
    queueMicrotask(() => this.onmessage({ data: {
      bytes: new TextEncoder().encode("%PDF-1.7 test"), reportPageCount: 2,
    } }));
  }
  terminate() { stops++; }
}
globalThis.Worker = TestWorker;
const file = new Blob(["source"]);
const options = { studentFile: file, questions: [], summary: "original" };
const first = await buildPreviewPdf(options);
assert.equal(first.reportPageCount, 2);
assert.equal(await buildPreviewPdf(options), first);
assert.equal(starts, 1, "Reopening unchanged file must reuse preview");
await buildPreviewPdf({ ...options, summary: "edited" });
assert.equal(starts, 2, "Editing must invalidate preview");
await buildPreviewPdf({ ...options, studentFile: new Blob(["replacement"]) });
assert.equal(starts, 3, "Replacing source must invalidate preview");
const controller = new AbortController();
const pending = buildPreviewPdf({ ...options, summary: "cancel" }, { signal: controller.signal });
controller.abort();
await assert.rejects(pending, { name: "AbortError" });
assert.equal(stops, starts, "Workers must terminate after completion or cancellation");

// Execute the actual production worker bundle and parse its resulting PDF.
const assets = new URL("../dist/assets/", import.meta.url);
const name = (await readdir(assets)).find((n) => n.startsWith("previewPdf.worker-") && n.endsWith(".js"));
assert.ok(name, "Run npm run build before this test");
const source = await readFile(new URL(name, assets), "utf8");
const logo = await readFile(new URL("../src/assets/images/Logo-removebg-preview.png", import.meta.url));
let output;
const self = { postMessage: (data) => { output = data; } };
const context = vm.createContext({
  self, console, Blob, FormData, URL, URLSearchParams, TextEncoder, TextDecoder,
  Uint8Array, ArrayBuffer, setTimeout, clearTimeout, atob, btoa,
  fetch: async () => ({ ok: true, arrayBuffer: async () => logo.buffer.slice(logo.byteOffset, logo.byteOffset + logo.byteLength) }),
});
vm.runInContext(source, context);
const original = await PDFDocument.create();
original.addPage([595, 842]);
await self.onmessage({ data: {
  studentFile: new Blob([await original.save()]), questions: [], maxTotalMarks: 10,
  summary: "Preview regression check", finalObtainedMarks: 0, finalMaximumMarks: 10,
} });
assert.equal(output.error, undefined);
const result = await PDFDocument.load(output.bytes);
assert.ok(output.reportPageCount > 0);
assert.equal(result.getPageCount(), original.getPageCount() + output.reportPageCount);
await self.onmessage({ data: { studentFile: new Blob(["not a pdf"]) } });
assert.ok(output.error, "Invalid input must produce a useful worker error");
console.log("Preview cache, invalidation, cancellation, worker PDF output and errors passed.");
