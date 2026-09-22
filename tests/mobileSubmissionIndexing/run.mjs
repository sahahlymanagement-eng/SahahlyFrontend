import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { installFixtures } from './fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const runtime = process.env.CODEX_NODE_MODULES || 'C:/Users/ROG STRIX/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = require(path.join(runtime, 'playwright'));
const { PDFDocument, StandardFonts } = require('pdf-lib');
const pdfDoc = await PDFDocument.create();
const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 2; i++) {
  const page = pdfDoc.addPage([595, 842]);
  page.drawText(`Physics assessment - page ${i}`, { x: 45, y: 780, size: 21, font });
  page.drawText('Explain the relationship between force and acceleration.', { x: 45, y: 725, size: 13, font });
  page.drawText('Acceleration increases as force increases. F = ma.', { x: 45, y: 675, size: 14, font });
}
const pdf = Buffer.from(await pdfDoc.save());
const out = process.env.QA_OUTPUT || path.resolve(here, '../../../mobile-qa-results');
await fs.mkdir(out, { recursive: true });
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5179';
const widths = (process.env.QA_WIDTHS || '320,375,390,412,430').split(',').map(Number);
const suites = (process.env.QA_SUITES || 'manager,assistant,library,exam,grade,run,paper').split(',');
const browser = await chromium.launch({ headless: true, channel: process.env.QA_BROWSER_CHANNEL || 'msedge' });
const report = [];
const targets = {
  manager: { route: '/manager/submissions', selected: true, ready: '.ma-row' },
  assistant: { route: '/assistant/assignments/qa-assignment', role: 'assistant', ready: '.ma-row' },
  provider: { route: '/manager/drpeter-indexing', provider: true, ready: '.ma-row' },
  library: { route: '/drpeter-indexing/index.html#/', ready: '.hero' },
  exam: { route: '/drpeter-indexing/index.html#/exams/qa-exam', ready: '.panel' },
  grade: { route: '/drpeter-indexing/index.html#/grade', ready: '.panel' },
  run: { route: '/drpeter-indexing/index.html#/runs/qa-run', ready: '.panel' },
  paper: { route: '/drpeter-indexing/index.html#/papers/qa-grading', ready: '.panel' },
};
export async function snapshot(page) {
  return page.evaluate(() => {
    const visible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const all = [...document.querySelectorAll('button,input,select,textarea,a,[role="button"]')].filter(visible);
    const controls = all.map(el => { const r = el.getBoundingClientRect(); return { tag: el.tagName, label: el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent.trim().replace(/\s+/g, ' ').slice(0, 80) || el.getAttribute('placeholder') || '', width: Math.round(r.width), height: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; });
    const overflowing = [...document.body.querySelectorAll('*')].filter(visible).filter(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth + 1 && !el.closest('iframe') && getComputedStyle(el).position !== 'fixed'; }).slice(0, 25).map(el => ({ tag: el.tagName, class: el.className?.baseVal ?? el.className, right: Math.round(el.getBoundingClientRect().right) }));
    return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, title: document.title, controls, overflowing, bodyText: document.body.innerText.slice(0, 4000) };
  });
}
try {
  for (const width of widths) for (const suite of suites) {
    const target = targets[suite];
    const requests = []; const errors = [];
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce', timezoneId: 'UTC' });
    await installFixtures(context, { pdf, requests, ...target });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error' && !message.text().includes('Failed to load resource')) errors.push(message.text()); });
    try {
      await page.goto(base + target.route, { waitUntil: 'networkidle', timeout: 60000 });
      await page.locator(target.ready).first().waitFor({ timeout: 15000 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(out, `${suite}-${width}.png`), fullPage: true, animations: 'disabled' });
      const state = await snapshot(page);
      report.push({ suite, width, ...state, errors, requests });
      console.log(`${suite} ${width}: scroll=${state.scrollWidth}, controls=${state.controls.length}, errors=${errors.length}`);
    } catch (error) {
      await page.screenshot({ path: path.join(out, `${suite}-${width}-error.png`), fullPage: true });
      report.push({ suite, width, error: error.message, errors, requests, bodyText: await page.locator('body').innerText() });
      console.log(`${suite} ${width}: ERROR ${error.message.slice(0, 130)}`);
    }
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await context.close();
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
}
