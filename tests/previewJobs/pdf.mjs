import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { PDFDocument, PDFName, PDFRawStream, pushGraphicsState, concatTransformationMatrix, drawObject, popGraphicsState } from 'pdf-lib';
import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../../', import.meta.url));
async function renderer(original) {
  const result = await build({
    stdin: { contents: 'export { annotatePdf } from "./src/utils/annotatePdf.js";', resolveDir: root },
    bundle: true, write: false, platform: 'node', format: 'esm', loader: { '.png': 'dataurl' },
    define: { 'import.meta.env': JSON.stringify({ VITE_API_BASE_URL: 'http://localhost:6001/api' }) },
    banner: { js: `import {createRequire as cr} from 'node:module'; const require = cr(${JSON.stringify(import.meta.url)});` },
    plugins: original ? [{ name: 'baseline', setup(b) {
      b.onLoad({ filter: /[\\/]utils[\\/]annotatePdf\.js$/ }, args => ({
        contents: readFileSync(process.env.PREVIEW_BASELINE_FILE, 'utf8'),
        loader: 'js', resolveDir: path.dirname(args.path),
      }));
    } }] : [],
  });
  return (await import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))).annotatePdf;
}
const baseline = process.env.PREVIEW_BASELINE_FILE ? await renderer(true) : null;
const updated = await renderer(false);
const pdf = await PDFDocument.create();
for (let i = 0; i < 100; i++) pdf.addPage([595, 842]).drawText('Synthetic quality test page ' + (i + 1), { x: 40, y: 700 });
const source = await pdf.save();
const options = { studentFile: new File([source], 'synthetic.pdf'), questions: [], maxTotalMarks: 1, summary: '', skipCompress: true, cacheScope: 'synthetic' };
const time = async fn => { const start = performance.now(); const value = await fn(); return { value, ms: Math.round(performance.now() - start) }; };
const before = baseline ? await time(() => baseline(options)) : null;
const beforeRepeat = baseline ? await time(() => baseline(options)) : null;
const after = await time(() => updated(options));
const afterRepeat = await time(() => updated(options));
assert.equal(after.value, afterRepeat.value);
const doc = await PDFDocument.load(after.value);
assert.equal(doc.getPageCount(), 100 + after.value.reportPageCount);
// Existing layout extends the right margin for feedback without scaling the paper.
assert.ok(doc.getPages().slice(after.value.reportPageCount).every(p => p.getHeight() === 842 && p.getWidth() > 595 && p.getRotation().angle === 0));
if (before) {
  const oldDoc = await PDFDocument.load(before.value);
  assert.deepEqual(doc.getPages().map(p => p.getSize()), oldDoc.getPages().map(p => p.getSize()));
}
const changed = await updated({ ...options, summary: 'Saved revision changed' });
assert.notEqual(changed, after.value);
const pdf2 = await PDFDocument.create();
pdf2.addPage([600, 800]);
const changedSource = await updated({ ...options, studentFile: new File([await pdf2.save()], 'synthetic.pdf') });
assert.notEqual(changedSource, after.value);
console.log(JSON.stringify({ fixture: '100 synthetic vector pages', sourceBytes: source.length, beforeMs: before?.ms, beforeRepeatMs: beforeRepeat?.ms, afterMs: after.ms, afterRepeatMs: afterRepeat.ms, outputBytes: after.value.length }));
console.log('Large PDF, cached reopen, changed saved revision, changed source bytes and page geometry passed.');

// A 21 MiB scan-like PDF exercises byte size independently of page count.
// Use deterministic RGB noise, stored as PDF image streams, with no external files.
const raster = await PDFDocument.create();
const pixels = Buffer.alloc(512 * 512 * 3);
let seed = 123456789;
for (let i = 0; i < pixels.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; pixels[i] = seed & 255; }
const encoded = deflateSync(pixels);
for (let i = 0; i < 28; i++) {
  const page = raster.addPage([595, 842]);
  const stream = PDFRawStream.of(raster.context.obj({ Type: 'XObject', Subtype: 'Image', Width: 512, Height: 512, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'FlateDecode' }), encoded);
  const name = page.node.newXObject('SyntheticScan', raster.context.register(stream));
  page.pushOperators(pushGraphicsState(), concatTransformationMatrix(512, 0, 0, 512, 30, 100), drawObject(name), popGraphicsState());
}
const rasterSource = await raster.save();
assert.ok(rasterSource.length > 20 * 1024 * 1024);
const large = await time(() => updated({ ...options, studentFile: new File([rasterSource], 'synthetic-scans.pdf') }));
const largeDoc = await PDFDocument.load(large.value);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const preservedImages = largeDoc.context.enumerateIndirectObjects().filter(([, object]) => object instanceof PDFRawStream && object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image') && hash(object.contents) === hash(encoded));
assert.equal(preservedImages.length, 28, 'every original compressed image stream is preserved byte-for-byte');
assert.equal(largeDoc.getPageCount(), 28 + large.value.reportPageCount);
console.log(JSON.stringify({ fixture: '28 synthetic scan pages', sourceBytes: rasterSource.length, generationMs: large.ms, outputBytes: large.value.length, originalImagesPreserved: preservedImages.length }));
