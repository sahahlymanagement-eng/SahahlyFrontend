import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { installFixtures, assignment } from "../mobileSubmissionIndexing/fixtures.mjs";

const require = createRequire(import.meta.url);
const runtime =
  process.env.CODEX_NODE_MODULES ||
  "C:/Users/ROG STRIX/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const { chromium } = require(path.join(runtime, "playwright"));
const base = process.env.QA_BASE_URL || "http://127.0.0.1:5179";
const widths = (process.env.QA_WIDTHS || "320,375,390,412,430")
  .split(",")
  .map(Number);
const out = process.env.QA_OUTPUT || "../tmp/qa-mobile-reports-ai";
const desktop = process.env.QA_DESKTOP === "1";

await fs.mkdir(out, { recursive: true });

function agentStream(reply) {
  return `event: final\ndata: ${JSON.stringify({ reply })}\n\n`;
}

async function assertNoPageOverflow(page, name) {
  const state = await page.evaluate(() => ({
    viewport: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(
    state.scrollWidth <= state.viewport + 1,
    `${name}: horizontal page overflow (${state.scrollWidth}px in ${state.viewport}px)`
  );
}

async function assertVisibleTouchTargets(page, selector, name) {
  const undersized = await page.locator(selector).evaluateAll((nodes) =>
    nodes
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
      })
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { label: node.getAttribute("aria-label") || node.textContent.trim(), width: rect.width, height: rect.height };
      })
      .filter((item) => item.width < 44 || item.height < 44)
  );
  assert.deepEqual(undersized, [], `${name}: controls below the 44px touch target`);
}

async function installReportFixtures(context) {
  await context.route("**/api/manager-assignments/classroom/qa-classroom/assignments**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ data: [assignment], total: 1, totalPages: 1, page: 1 }),
    })
  );

  await context.route("**/api/reports/sent-history**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [
          {
            id: "qa-send",
            sentAt: "2026-09-20T12:30:00Z",
            reportTypeLabel: "Assignment report",
            recipientType: "parent",
            recipientLabel: "Parents",
            classroomName: "Year 11 Physics — Cambridge",
            assignmentTitles: [assignment.title],
            sentCount: 3,
            studentCount: 3,
            coverageLabel: "3 of 3 students",
            sentByPersonName: "Demo Reviewer",
          },
        ],
        latest: null,
        coverage: { studentsSent: 3, studentsTotal: 3 },
        page: 1,
        totalPages: 1,
        total: 1,
      }),
    })
  );
}

function directorData() {
  return {
    generatedAt: "2026-09-20T12:30:00Z",
    overview: {
      classroomCount: 4,
      activeClassroomCount: 3,
      studentCount: 92,
      assignmentCount: 16,
      teacherCount: 5,
      managerCount: 2,
      assistantCount: 2,
      qualityManagerCount: 1,
      classroomsWithoutTeacher: 0,
      classroomsWithoutSubject: 1,
      markedSubmissionCount: 68,
      googleAccountCount: 10,
      pipeline: { completionRate: 72, done: 9, assigned: 4, unassigned: 2, failedDeadline: 0, overdueUnassigned: 1 },
      delivery: { teacherSubmissionReportSent: 8, executiveReportAssignments: 3 },
    },
    academic: {
      overall: { avgPercent: 74, markedCount: 68, gradeBands: { excellent: 22, good: 28, fair: 13, weak: 5 } },
      assignmentsWithGrades: 12,
      bySubject: [],
    },
    attendance: {
      monthly: { avgPresentRate: 94, classroomsWithRecords: 3, recordsCount: 12, recentMonths: [] },
      lesson: { avgPresentRate: 92, recordsCount: 22, classroomsWithRecords: 3 },
    },
    insights: {
      summary: { totalCostUsd: 4.23, totalRequests: 81, totalEdits: 7, totalMappingEdits: 3 },
      correctedByTeacher: [{ id: "teacher-1", name: "Dr Amira Hassan", correctedAssignments: 4 }],
      correctedByManager: [{ id: "manager-1", name: "Demo Reviewer", correctedAssignments: 3, classrooms: 2 }],
      correctedByAssistant: [{ id: "assistant-1", name: "Sara Ali", correctedAssignments: 2, subjects: 1 }],
      editsByTeacher: [],
      editsByAssignment: [],
      editsByClassroom: [],
    },
    coverage: { topClassroomsByAssignments: [], missingTeacher: [], missingSubject: [] },
  };
}

async function checkAgent(page, width, isDesktop) {
  await page.goto(`${base}/manager/ai-agent`, { waitUntil: "networkidle" });
  await page.locator(".dchat-page").waitFor();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.locator(".dchat-history-panel").waitFor();
  const historyPosition = await page.locator(".dchat-history-panel").evaluate((node) => getComputedStyle(node).position);
  assert.equal(
    historyPosition,
    isDesktop ? "absolute" : "fixed",
    isDesktop ? "AI history keeps its desktop popover" : "AI history uses a mobile sheet"
  );
  await assertNoPageOverflow(page, `AI history ${width}`);
  await page.locator(".dchat-panel-backdrop").click({ position: { x: 2, y: 2 } });

  await page.locator(".dchat-scope-btn").click();
  await page.locator(".dchat-scope-menu").waitFor();
  const scopePosition = await page.locator(".dchat-scope-menu").evaluate((node) => getComputedStyle(node).position);
  assert.equal(
    scopePosition,
    isDesktop ? "absolute" : "fixed",
    isDesktop ? "AI scope keeps its desktop popover" : "AI scope uses a mobile sheet"
  );
  await page.locator(".dchat-panel-backdrop").click({ position: { x: 2, y: 2 } });

  await page.getByLabel("Message the AI Agent").fill("Give me a concise grading summary.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page.getByText("Responsive report summary", { exact: false }).waitFor();
  if (!isDesktop) {
    await assertVisibleTouchTargets(page, ".dchat-page .tchat-msg-action", `AI actions ${width}`);
    await assertVisibleTouchTargets(page, ".dchat-page .dchat-scope-btn, .dchat-page .tchat-send", `AI composer ${width}`);
  }
  await assertNoPageOverflow(page, `AI response ${width}`);
  await page.screenshot({ path: path.join(out, `ai-${width}.png`), fullPage: true, animations: "disabled" });
}

async function checkReports(page, width, isDesktop) {
  await page.goto(`${base}/manager/assignments`, { waitUntil: "networkidle" });
  await page.locator(".rw-report-surface").waitFor();
  await page.locator(".ma-classroom-card").first().click();
  await page.locator(".ma-assignment-card").first().waitFor();
  await page.locator(".ma-assignment-card").first().click();
  await page.locator(".ma-table.sah-table--cards").first().waitFor();
  if (!isDesktop) await assertVisibleTouchTargets(page, ".rw-report-surface .ma-report-tab", `Report tabs ${width}`);
  await assertNoPageOverflow(page, `Report generator ${width}`);
  await page.getByRole("button", { name: "Reports Sent", exact: true }).click();
  await page.locator(".ma-sent-history-section").waitFor();
  if (!isDesktop) {
    await assertVisibleTouchTargets(
      page,
      ".rw-report-surface .dpf-input, .rw-report-surface .ma-sent-filter select, .rw-report-surface .ma-topbar-right .ma-send-btn, .rw-report-surface .ma-back-link",
      `Report filters ${width}`
    );
  }
  await assertNoPageOverflow(page, `Reports sent ${width}`);
  await page.screenshot({ path: path.join(out, `reports-${width}.png`), fullPage: true, animations: "disabled" });
}

async function checkDirectorReports(page, width, isDesktop) {
  await page.goto(`${base}/director/insights`, { waitUntil: "networkidle" });
  await page.locator(".directorReportsPage .dr-stat").first().waitFor();
  if (!isDesktop) {
    await assertVisibleTouchTargets(page, ".directorReportsPage .dr-tab, .directorReportsPage .dr-refresh-btn", `Director report controls ${width}`);
  }
  await assertNoPageOverflow(page, `Director reports ${width}`);
  await page.screenshot({ path: path.join(out, `director-reports-${width}.png`), fullPage: true, animations: "disabled" });
}

async function checkIndexingQueue(page, width, isDesktop) {
  await page.goto(`${base}/director/drpeter-indexing-queue`, { waitUntil: "networkidle" });
  await page.locator(".dpi-queue-card").first().waitFor();
  if (!isDesktop) {
    await assertVisibleTouchTargets(page, ".dpi-queue-header .msv-btn-ai, .dpi-queue-card__actions .msv-btn-ai", `Indexing queue controls ${width}`);
  }
  await assertNoPageOverflow(page, `Indexing queue ${width}`);
  await page.screenshot({ path: path.join(out, `indexing-queue-${width}.png`), fullPage: true, animations: "disabled" });
}

const browser = await chromium.launch({ headless: true, channel: "msedge" });
const report = [];
try {
  for (const width of widths) {
    const contextOptions = {
      viewport: { width, height: 844 },
      isMobile: !desktop,
      hasTouch: !desktop,
      reducedMotion: "reduce",
      timezoneId: "UTC",
    };
    const managerContext = await browser.newContext(contextOptions);
    const managerErrors = [];
    let directorContext;
    try {
      await installFixtures(managerContext, { role: "manager" });
      await installReportFixtures(managerContext);
      await managerContext.route("**/api/manager-chatbot/agent-stream", (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/event-stream",
          body: agentStream(
            "## Responsive report summary\n- Every primary action stays reachable.\n- Long evidence token: `very-long-unbroken-reference-token-that-must-wrap-without-making-the-page-scroll-sideways-0123456789`"
          ),
        })
      );
      const managerPage = await managerContext.newPage();
      managerPage.on("pageerror", (error) => managerErrors.push(error.message));
      managerPage.setDefaultTimeout(20000);

      await checkAgent(managerPage, width, desktop);
      await checkReports(managerPage, width, desktop);
      assert.deepEqual(managerErrors, [], `manager page errors at ${width}px`);
      await managerContext.close();

      directorContext = await browser.newContext(contextOptions);
      const directorErrors = [];
      await installFixtures(directorContext, { role: "director" });
      await directorContext.route("**/api/director/org-reports**", (route) =>
        route.fulfill({ contentType: "application/json", body: JSON.stringify(directorData()) })
      );
      await directorContext.route("**/api/drpeter-indexing-queue**", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({
            running: [
              {
                _id: "qa-running-job",
                examTitle: "Physics extended response — indexed source",
                assignmentName: assignment.title,
                provider: "drpeter",
                studentCount: 24,
                status: "running",
                mode: "batch",
                stage: "active",
                gradeModel: "gemini-2.5-flash",
                createdAt: "2026-09-20T12:00:00Z",
                startedAt: "2026-09-20T12:10:00Z",
                lastRunStatus: "processing",
                resultCounts: { paperCount: 24, readyCount: 9, failedCount: 1 },
              },
            ],
            queued: [
              {
                _id: "qa-queued-job",
                examTitle: "Forces revision pack",
                assignmentName: "Forces practice set",
                provider: "drpeter",
                studentCount: 18,
                status: "queued",
                mode: "instant",
                stage: "queued",
                createdAt: "2026-09-20T12:20:00Z",
              },
            ],
            history: [
              {
                _id: "qa-failed-job",
                examTitle: "Long source title that should wrap cleanly on a narrow screen",
                assignmentName: "Mechanics mock paper",
                provider: "drpeter",
                studentCount: 12,
                status: "failed",
                mode: "batch",
                stage: "failed",
                createdAt: "2026-09-20T10:00:00Z",
                startedAt: "2026-09-20T10:02:00Z",
                finishedAt: "2026-09-20T10:05:00Z",
                error: "The source could not be indexed. Review the mark scheme and retry the job.",
              },
            ],
          }),
        })
      );
      const directorPage = await directorContext.newPage();
      directorPage.on("pageerror", (error) => directorErrors.push(error.message));
      directorPage.setDefaultTimeout(20000);

      await checkDirectorReports(directorPage, width, desktop);
      await checkIndexingQueue(directorPage, width, desktop);
      assert.deepEqual(directorErrors, [], `director page errors at ${width}px`);
      report.push({ width, passed: true, checks: ["AI sheets, composer, long response", "report generator and history", "director insights", "indexing queue"] });
      console.log(`PASS reports-ai ${width}: AI sheets/composer; reports generator/history; director insights; indexing queue`);
    } catch (error) {
      report.push({ width, passed: false, error: error.message, errors: managerErrors });
      console.log(`FAIL reports-ai ${width}: ${error.message.slice(0, 300)}`);
    } finally {
      await managerContext.close().catch(() => {});
      await directorContext?.close().catch(() => {});
    }
    await fs.writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  }
} finally {
  await browser.close();
}

if (report.some((row) => !row.passed)) process.exitCode = 1;
