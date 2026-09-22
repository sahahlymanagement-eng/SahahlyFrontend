import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const runtime = process.env.CODEX_NODE_MODULES || 'C:/Users/ROG STRIX/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const sharp = require(path.join(runtime, 'sharp'));
const root = process.env.QA_COMPARE_ROOT || '../mobile-qa-results';
const names = (await fs.readdir(path.join(root, 'desktop'))).filter(name => name.endsWith('.png') && !name.includes('-error'));
const report = [];
for (const name of names) {
  const before = await sharp(path.join(root, 'baseline', name)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const after = await sharp(path.join(root, 'desktop', name)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (before.info.width !== after.info.width || before.info.height !== after.info.height) { report.push({ name, error: 'Screenshot dimensions changed' }); continue; }
  let changed = 0;
  for (let i = 0; i < before.data.length; i += 4) if (!before.data.subarray(i, i + 4).equals(after.data.subarray(i, i + 4))) changed++;
  report.push({ name, changedPixels: changed, totalPixels: before.info.width * before.info.height });
}
await fs.writeFile(path.join(root, 'desktop-comparison.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (report.some(row => row.error || row.changedPixels)) process.exitCode = 1;
