import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { installFixtures } from './fixtures.mjs';

const require = createRequire(import.meta.url);
const runtime = process.env.CODEX_NODE_MODULES || 'C:/Users/ROG STRIX/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const { chromium } = require(path.join(runtime, 'playwright'));
const { PDFDocument, StandardFonts } = require('pdf-lib');
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (let i = 1; i <= 2; i++) { const p = doc.addPage([595, 842]); p.drawText(`Physics assessment - page ${i}`, { x: 40, y: 790, font, size: 20 }); p.drawText('Force increases acceleration. F = ma.', { x: 40, y: 680, font, size: 15 }); }
const pdf = Buffer.from(await doc.save());
const out = process.env.QA_OUTPUT || '../mobile-qa-results/flows';
await fs.mkdir(out, { recursive: true });
const base = process.env.QA_BASE_URL || 'http://127.0.0.1:5179';
const widths = (process.env.QA_WIDTHS || '320,375,390,412,430').split(',').map(Number);
const suites = (process.env.QA_SUITES || 'manager,assistant,indexing').split(',');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const report = [];
async function capture(page, name, width) {
  await page.screenshot({ path: path.join(out, `${name}-${width}.png`), animations: 'disabled' });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false, `${name}: horizontal page overflow`);
}
try {
  for (const width of widths) for (const suite of suites) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', timezoneId: 'UTC' });
    const requests = [], errors = [], checks = [];
    await installFixtures(context, { pdf, selected: suite === 'manager', provider: suite === 'provider', role: suite === 'assistant' ? 'assistant' : 'manager', requests });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.setDefaultTimeout(20000);
    try {
      if (suite !== 'indexing') {
        await page.goto(base + (suite === 'provider' ? '/manager/drpeter-indexing' : suite === 'manager' ? '/manager/submissions' : '/assistant/assignments/qa-assignment'));
        await page.locator('.ma-row').first().waitFor();
        await page.locator('.msv-student-search').fill('Mariam');
        await page.waitForTimeout(800);
        assert.equal(await page.locator('.ma-row').count(), 1);
        await page.locator('.msv-student-search').fill('');
        await page.waitForTimeout(800);
        checks.push('search and clear');
        await page.getByRole('button', { name: 'Select page', exact: true }).click();
        await page.locator('.msv-mark-select-count').waitFor();
        assert.equal(await page.getByRole('button', { name: 'Mark with indexing (Instant)', exact: true }).isVisible(), true);
        await page.getByRole('button', { name: 'Clear', exact: true }).click();
        checks.push('bulk selection reveals indexing actions');
        await page.locator('.ma-row').first().scrollIntoViewIfNeeded();
        await capture(page, `${suite}-cards`, width);
        await page.getByRole('button', { name: 'View submission for Youssef Mohamed Abdelrahman', exact: true }).click();
        await page.locator('.msv-mobile-document canvas').first().waitFor();
        await page.locator('.msv-mobile-document').getByRole('button', { name: 'Zoom in', exact: true }).click();
        await capture(page, `${suite}-document`, width);
        await page.getByRole('button', { name: 'Close viewer', exact: true }).click();
        checks.push('raw document loads, zooms, closes');
        await page.locator('.msv-action-btn--done').first().click();
        const modal = page.locator('.msv-review-workspace');
        await modal.waitFor();
        await modal.locator('.msv-q-card').first().waitFor();
        await capture(page, `${suite}-review`, width);
        const marks = modal.getByRole('textbox', { name: 'Marks awarded', exact: true }).first();
        await marks.fill('6'); await marks.press('Tab');
        await modal.getByRole('button', { name: 'Save changes', exact: true }).click({ timeout: 60000 });
        await page.waitForTimeout(600);
        assert.ok(requests.some(r => suite === 'provider' ? r.method === 'PUT' && r.path.endsWith('/draft') : r.method === 'POST' && r.path.endsWith('/save-results')), 'Save calls existing API');
        checks.push('edit question and save to existing API');
        await modal.getByRole('button', { name: 'Paper', exact: true }).click();
        await modal.locator('.msv-paper-pane .pdf-preview-root').waitFor({ timeout: 60000 });
        await modal.locator('.msv-paper-pane .pdf-preview-page--ready').first().waitFor({ timeout: 30000 });
        await capture(page, `${suite}-paper`, width);
        await modal.getByText('Adjust annotations', { exact: true }).click();
        await modal.getByLabel('Position (%)', { exact: true }).fill('40');
        await modal.getByText('Adjust annotations', { exact: true }).click();
        await modal.getByRole('button', { name: 'Mark scheme', exact: true }).click();
        await modal.locator('.msv-scheme-pane canvas').first().waitFor();
        await capture(page, `${suite}-scheme`, width);
        await modal.getByRole('button', { name: 'Actions', exact: true }).click();
        await capture(page, `${suite}-actions`, width);
        assert.equal(await modal.getByRole('button', { name: /Download PDF/ }).isVisible(), true);
        await modal.getByRole('button', { name: 'Close viewer', exact: true }).click();
        checks.push('review tabs, annotations, mark scheme, actions and close');
        await page.locator('.dpi-mobile-toggle').click();
        await page.getByRole('button', { name: 'Import index from another assignment', exact: true }).click();
        await page.locator('.dpi-import-list label').first().click();
        assert.equal(await page.getByRole('button', { name: 'Import selected index', exact: true }).isEnabled(), true);
        await capture(page, `${suite}-import`, width);
        await page.getByRole('button', { name: 'Import selected index', exact: true }).click();
        assert.ok(requests.some(r => r.method === 'POST' && r.path.endsWith('/exams/import')), 'Import calls existing API');
        await page.locator('.dpi-workspace iframe').waitFor();
        await capture(page, `${suite}-embedded`, width);
        await page.getByRole('button', { name: 'Close indexing workspace', exact: true }).click();
        checks.push('index import saves and opens embedded review');
      } else {
        await page.goto(base + '/drpeter-indexing/index.html#/exams/qa-exam');
        await page.getByRole('button', { name: /Edit index/i }).first().click();
        await capture(page, 'index-editor', width);
        await page.locator('.q-toggle').first().click();
        await page.locator('.q-edit-grid textarea').first().fill('Edited question stem for phone QA');
        await page.locator('.mobile-index-dock').getByRole('button', { name: /Save/i }).click();
        assert.ok(requests.some(r => r.method === 'PUT' && r.path.includes('/pack')), 'Index save calls existing API');
        checks.push('index edit/save');
        await page.goto(base + '/drpeter-indexing/index.html#/runs/qa-run');
        await page.locator('.mobile-paper-card').waitFor();
        await capture(page, 'index-run-cards', width);
        await page.goto(base + '/drpeter-indexing/index.html#/papers/qa-grading');
        await page.locator('.ap-page canvas').first().waitFor();
        await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
        await page.locator('.ap-mobile-editor summary').click();
        await page.locator('.ap-mobile-editor input[type="range"]').first().fill('40');
        await page.locator('.mobile-paper-save button').click();
        assert.ok(requests.some(r => r.method === 'PUT' && r.path.endsWith('/placement')), 'Placement save calls existing API');
        await capture(page, 'index-placement', width);
        checks.push('run cards, PDF zoom, annotation placement/save');
      }
      assert.deepEqual(errors, []);
      report.push({ suite, width, checks, passed: true });
      console.log(`PASS ${suite} ${width}: ${checks.join('; ')}`);
    } catch (e) {
      await capture(page, `${suite}-failure`, width).catch(() => {});
      report.push({ suite, width, checks, error: e.message, errors, requests, body: await page.locator('body').innerText() });
      console.log(`FAIL ${suite} ${width}: ${e.message.slice(0, 250)}`);
    }
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await context.close();
  }
} finally { await browser.close(); }
if (report.some(row => !row.passed)) process.exitCode = 1;
