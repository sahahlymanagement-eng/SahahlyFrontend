import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { compressAnnotatedPdf } from "./compressAnnotatedPdf";
import { enrichMarkingQuestions, isBlankQuestion } from "./blankQuestionFeedback";
import {
  compareQuestionNumbers,
  normalizeQuestionPlacement,
  paperAnchorY,
  resolveVerticalCollisions,
  yPercentOf,
} from "./normalizeQuestionPlacement";
import { resolveTeacherAnnotationsForPdf } from "./teacherAnnotations";

// ── Colours ───────────────────────────────────────────────────────────────────
const GREEN = rgb(0.04, 0.60, 0.25);
const RED = rgb(0.85, 0.12, 0.12);
const AMBER = rgb(0.88, 0.52, 0.02);
const NAVY = rgb(0.05, 0.10, 0.30);
const WHITE = rgb(1, 1, 1);
const GREY = rgb(0.55, 0.55, 0.60);
const LGREY = rgb(0.88, 0.90, 0.94);
const COL_BG = rgb(0.96, 0.97, 1);
const COL_BORDER = rgb(0.72, 0.78, 0.92);
const TEACHER_COL = rgb(0.30, 0.42, 0.90);
const TEACHER_BG = rgb(0.93, 0.95, 1.0);

/** Fixed-width examiner notes column appended to the right of each page. */
const EXAMINER_COL_W = 178;
const COL_PAD = 8;

function scoreCol(awarded, max) {
  const p = max > 0 ? awarded / max : 0;
  return p >= 0.75 ? GREEN : p >= 0.5 ? AMBER : RED;
}

function scoreBg(awarded, max) {
  const p = max > 0 ? awarded / max : 0;
  return p >= 0.75
    ? rgb(0.88, 0.97, 0.91)
    : p >= 0.5
      ? rgb(0.99, 0.95, 0.87)
      : rgb(0.99, 0.90, 0.90);
}

function extractOptionLetter(text) {
  if (!text || text === "Not attempted") return null;
  const s = String(text).trim();
  const m =
    s.match(/^(?:option\s*)?([A-E])\b/i) ||
    s.match(/^([A-E])\s*[-–—:.]/i) ||
    s.match(/\(([A-E])\)/i);
  return m ? m[1].toUpperCase() : null;
}

function looksLikeMcq(q) {
  if (q?.isMcq === true || q?.questionType === "mcq") return true;
  const max = Number(q?.maxMarks ?? 0);
  if (max > 2) return false;
  const blob = [
    q?.studentAnswer,
    q?.correctAnswer,
    q?.reason,
    ...(q?.markedKeywords || []),
    ...(q?.missingKeywords || []),
  ]
    .filter(Boolean)
    .join(" ");
  if (/\b(mcq|multiple choice|tick|circle one)\b/i.test(blob)) return true;
  if (/\b[A-E]\s*[-–—:]/i.test(blob)) return true;
  if (max === 1 && (extractOptionLetter(q?.studentAnswer) || extractOptionLetter(q?.correctAnswer))) {
    return true;
  }
  return false;
}

function mcqChoiceSummary(q) {
  const isMcq = looksLikeMcq(q);
  const student =
    q?.studentAnswer && q.studentAnswer !== "Not attempted" ? q.studentAnswer : null;
  const correct = q?.correctAnswer || null;
  const awarded = Number(q?.marksAwarded ?? 0);
  const max = Number(q?.maxMarks ?? 0);
  const full = max > 0 && awarded >= max;
  return { isMcq, student, correct, full, notAttempted: q?.studentAnswer === "Not attempted" };
}

function san(s) {
  return (s || "")
    .replace(/[\u2019\u2018\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u2022/g, "*")
    .replace(/\u00D7/g, "x")
    .replace(/[^\x00-\xFF]/g, "?");
}

function wrap(text, font, size, maxW) {
  const words = san(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  const pushLine = (value) => {
    if (value) lines.push(value);
  };

  const breakWord = (word) => {
    let chunk = "";
    for (const ch of word) {
      const test = chunk + ch;
      if (font.widthOfTextAtSize(test, size) <= maxW) {
        chunk = test;
      } else {
        if (chunk) pushLine(chunk);
        chunk = font.widthOfTextAtSize(ch, size) <= maxW ? ch : "";
      }
    }
    return chunk;
  };

  for (const w of words) {
    if (font.widthOfTextAtSize(w, size) > maxW) {
      if (line) {
        pushLine(line);
        line = "";
      }
      line = breakWord(w);
      continue;
    }

    const t = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(t, size) <= maxW) {
      line = t;
    } else {
      pushLine(line);
      line = w;
    }
  }

  if (line) pushLine(line);
  return lines;
}

const BD_NOTE_SIZE = 5.7;
const BD_TOPIC_SIZE = 6.1;
const BD_LINE_H = 7;
const BD_ROW_PAD = 5;
const BD_MIN_ROW_H = 14;
const BD_FOOTER_Y = 45;
const BD_TOPIC_W = 124;
const BD_NOTE_W_OFFSET = 245;

function measureBreakdownRow(q, reg, bold, noteW) {
  const topicLines = wrap(q.studyTopic || "-", bold, BD_TOPIC_SIZE, BD_TOPIC_W);
  const noteLines = wrap(q.reason || "-", reg, BD_NOTE_SIZE, noteW);
  const lineCount = Math.max(topicLines.length, noteLines.length, 1);
  const rowH = Math.max(BD_MIN_ROW_H, lineCount * BD_LINE_H + BD_ROW_PAD);
  return { topicLines, noteLines, rowH };
}

function drawBreakdownColumnHeaders(page, yPos, M, CW, bold) {
  page.drawRectangle({
    x: M,
    y: yPos - 15,
    width: CW,
    height: 15,
    color: NAVY,
  });

  const headers = [
    { label: "Q", x: M + 5 },
    { label: "Score", x: M + 38 },
    { label: "Pg", x: M + 82 },
    { label: "Topic", x: M + 110 },
    { label: "Examiner Note", x: M + 240 },
  ];

  headers.forEach((h) => {
    page.drawText(h.label, {
      x: h.x,
      y: yPos - 10,
      size: 6.5,
      font: bold,
      color: WHITE,
    });
  });

  return yPos - 15;
}

function drawReportFooter(page, sw, reg) {
  page.drawLine({
    start: { x: 38, y: 28 },
    end: { x: sw - 38, y: 28 },
    thickness: 0.5,
    color: LGREY,
  });

  const footerText = "Generated by Sahahly";
  page.drawText(footerText, {
    x: sw / 2 - reg.widthOfTextAtSize(footerText, 8) / 2,
    y: 16,
    size: 8,
    font: reg,
    color: GREY,
  });
}

/** Insert the next report page immediately before the marked student work. */
function openNextReportPage(pdfDoc, reportPageCount, currentPage, sw, sh, M, bold, reg, title) {
  drawReportFooter(currentPage, sw, reg);
  const page = pdfDoc.insertPage(reportPageCount, [sw, sh]);
  page.drawRectangle({ x: 0, y: sh - 40, width: sw, height: 40, color: NAVY });
  page.drawText(title, {
    x: M,
    y: sh - 26,
    size: 11,
    font: bold,
    color: WHITE,
  });
  return { page, yPos: sh - 52, reportPageCount: reportPageCount + 1 };
}

function drawBoldText(page, text, { x, y, size, font, color }) {
  const line = san(text);
  page.drawText(line, { x, y, size, font, color });
  page.drawText(line, { x: x + 0.35, y, size, font, color });
}

function drawTick(page, cx, cy, size, color) {
  const s = size;
  page.drawLine({
    start: { x: cx, y: cy + s * 0.45 },
    end: { x: cx + s * 0.35, y: cy },
    thickness: size * 0.18,
    color,
  });
  page.drawLine({
    start: { x: cx + s * 0.35, y: cy },
    end: { x: cx + s, y: cy + s * 0.75 },
    thickness: size * 0.18,
    color,
  });
}

function drawCross(page, cx, cy, size, color) {
  const s = size;
  page.drawLine({
    start: { x: cx, y: cy + s },
    end: { x: cx + s, y: cy },
    thickness: size * 0.18,
    color,
  });
  page.drawLine({
    start: { x: cx + s, y: cy + s },
    end: { x: cx, y: cy },
    thickness: size * 0.18,
    color,
  });
}

function buildTopicsMap(questions) {
  const topicsMap = {};

  questions
    .filter((q) => Number(q.marksAwarded) < Number(q.maxMarks))
    .forEach((q) => {
      const topic = q.studyTopic || "General Revision";
      const lost = Number(q.maxMarks || 0) - Number(q.marksAwarded || 0);

      if (!topicsMap[topic]) {
        topicsMap[topic] = {
          questions: [],
          advice: [],
          totalLost: 0,
        };
      }

      topicsMap[topic].questions.push(`Q${q.questionNumber} (-${lost})`);
      topicsMap[topic].totalLost += lost;

      if (q.mistakeAdvice) {
        topicsMap[topic].advice.push(q.mistakeAdvice);
      }
    });

  return Object.entries(topicsMap).sort((a, b) => b[1].totalLost - a[1].totalLost);
}

/** Widen page: student paper on the left, dedicated examiner column on the right. */
async function appendExaminerColumn(pdfDoc, page, stripH) {
  const { width: paperW, height } = page.getSize();
  const embedded = await pdfDoc.embedPage(page);

  page.setSize(paperW + EXAMINER_COL_W, height);
  page.drawPage(embedded, { x: 0, y: 0, width: paperW, height });

  const colLeft = paperW;
  const colTop = height - stripH - 4;

  page.drawRectangle({
    x: colLeft,
    y: stripH,
    width: EXAMINER_COL_W,
    height: height - stripH,
    color: COL_BG,
  });

  page.drawRectangle({
    x: colLeft,
    y: stripH,
    width: 3,
    height: height - stripH,
    color: NAVY,
  });

  page.drawLine({
    start: { x: colLeft + EXAMINER_COL_W, y: stripH },
    end: { x: colLeft + EXAMINER_COL_W, y: height },
    thickness: 0.6,
    color: COL_BORDER,
  });

  return {
    paperW,
    totalW: paperW + EXAMINER_COL_W,
    colX: colLeft + COL_PAD,
    colWidth: EXAMINER_COL_W - COL_PAD * 2,
    colLeft,
    colTop,
    colBottom: stripH + 6,
  };
}

function drawColumnHeader(page, layout, bold) {
  const title = "EXAMINER NOTES";
  const sub = "Feedback only — not on student work";
  const titleY = layout.colTop - 12;

  drawBoldText(page, title, {
    x: layout.colX,
    y: titleY,
    size: 7.5,
    font: bold,
    color: NAVY,
  });

  const subLines = wrap(sub, bold, 6.2, layout.colWidth);
  subLines.forEach((line, i) => {
    page.drawText(line, {
      x: layout.colX,
      y: titleY - 10 - i * 7,
      size: 6.2,
      font: bold,
      color: GREY,
    });
  });

  const headerBottom = titleY - 10 - subLines.length * 7 - 4;
  page.drawLine({
    start: { x: layout.colX, y: headerBottom },
    end: { x: layout.colX + layout.colWidth, y: headerBottom },
    thickness: 0.5,
    color: COL_BORDER,
  });

  return headerBottom - 6;
}

function buildColumnBlock(q, font, noteSize, colWidth) {
  const marked = (q.markedKeywords || []).filter(Boolean);
  const missing = (q.missingKeywords || []).filter(Boolean);
  const mcq = mcqChoiceSummary(q);
  const blank = isBlankQuestion(q);
  const noteLines = q.reason ? wrap(q.reason, font, noteSize, colWidth) : [];
  const studentLines =
    mcq.isMcq && (mcq.student || mcq.notAttempted)
      ? wrap(mcq.student || "Question left blank — no answer provided.", font, noteSize - 0.5, colWidth)
      : [];
  const blankAnswerLines =
    !mcq.isMcq && blank && q.studentAnswer
      ? wrap(q.studentAnswer, font, noteSize - 0.5, colWidth)
      : [];
  const correctLines =
    mcq.isMcq && mcq.correct ? wrap(mcq.correct, font, noteSize - 0.5, colWidth) : [];

  const kwLineH = noteSize + 5;
  const noteLineH = noteSize + 2.5;
  const sectionGap = 5;
  const blockPad = 6;
  const labelH = 9;

  let h = 14 + blockPad; // Q header

  if (mcq.isMcq) {
    if (studentLines.length) h += labelH + studentLines.length * kwLineH;
    if (correctLines.length && (!mcq.full || mcq.notAttempted)) h += labelH + correctLines.length * kwLineH;
    if (noteLines.length) h += sectionGap + labelH + noteLines.length * noteLineH;
  } else {
    if (blankAnswerLines.length) h += labelH + blankAnswerLines.length * kwLineH;
    if (marked.length) {
      h += 9 + marked.reduce((s, kw) => s + wrap(kw, font, noteSize - 0.5, colWidth).length * kwLineH, 0);
    }
    if (missing.length) {
      h += 9 + missing.reduce((s, kw) => s + wrap(kw, font, noteSize - 0.5, colWidth).length * kwLineH, 0);
    }
    if (noteLines.length) h += sectionGap + noteLines.length * noteLineH;
  }

  h += blockPad + 4;

  return {
    q,
    marked,
    missing,
    noteLines,
    studentLines,
    blankAnswerLines,
    correctLines,
    mcq,
    blank,
    kwLineH,
    noteLineH,
    sectionGap,
    blockPad,
    height: h,
  };
}

function measureColumnLayout(blocks, headerBottom, colBottom, noteSize, colWidth, font) {
  const built = blocks.map((q) => buildColumnBlock(q, font, noteSize, colWidth));
  const gap = 4;
  const totalH = built.reduce((s, b) => s + b.height, 0) + Math.max(0, built.length - 1) * gap;
  const available = headerBottom - colBottom;
  return { built, totalH, available, gap };
}

function pickColumnFontSize(blocks, headerBottom, colBottom, colWidth, font) {
  for (let size = 7.5; size >= 4.75; size -= 0.25) {
    const m = measureColumnLayout(blocks, headerBottom, colBottom, size, colWidth, font);
    if (m.totalH <= m.available) return { noteSize: size, ...m };
  }
  const m = measureColumnLayout(blocks, headerBottom, colBottom, 4.75, colWidth, font);
  return { noteSize: 4.75, gap: 2, ...m };
}

function drawWrappedLines(page, lines, { x, y, size, font, color, lineH }) {
  let cy = y;
  for (const line of lines) {
    page.drawText(line, { x, y: cy, size, font, color });
    cy -= lineH;
  }
  return cy;
}

function drawExaminerColumn(page, layout, questions, bold, reg, pageHeight) {
  const headerBottom = drawColumnHeader(page, layout, bold);
  if (!questions.length) return;

  const sorted = [...questions].sort(
    (a, b) => yPercentOf(a) - yPercentOf(b) || compareQuestionNumbers(a.questionNumber, b.questionNumber)
  );

  const { noteSize } = pickColumnFontSize(
    sorted,
    headerBottom,
    layout.colBottom,
    layout.colWidth,
    bold
  );

  const built = sorted.map((q) => {
    const paperY = paperAnchorY(q, pageHeight);
    return {
      ...buildColumnBlock(q, bold, noteSize, layout.colWidth),
      targetCenter: paperY,
      paperY,
    };
  });

  const minCenter = layout.colBottom + Math.max(...built.map((b) => b.height)) / 2;
  const maxCenter = headerBottom - Math.max(...built.map((b) => b.height)) / 2;
  const placed = resolveVerticalCollisions(
    built.map((b) => ({ ...b, targetCenter: b.targetCenter, height: b.height })),
    { minCenter, maxCenter, gap: 3 }
  );

  for (const block of placed) {
    const {
      q,
      marked,
      missing,
      noteLines,
      studentLines,
      blankAnswerLines,
      correctLines,
      mcq,
      blank,
      kwLineH,
      noteLineH,
      sectionGap,
      blockPad,
      height: blockH,
      center,
      paperY,
    } = block;

    const col = scoreCol(Number(q.marksAwarded || 0), Number(q.maxMarks || 0));
    const blockTop = center + blockH / 2;

    page.drawRectangle({
      x: layout.colX - 2,
      y: blockTop - blockH + blockPad,
      width: layout.colWidth + 4,
      height: blockH,
      color: WHITE,
      borderColor: COL_BORDER,
      borderWidth: 0.6,
    });

    drawBoldText(page, `Q${san(q.questionNumber)} · ${q.marksAwarded}/${q.maxMarks}`, {
      x: layout.colX,
      y: blockTop - 11,
      size: noteSize + 0.5,
      font: bold,
      color: col,
    });

    let cy = blockTop - 18;

    if (mcq.isMcq) {
      if (studentLines.length > 0) {
        const studentLabel = mcq.notAttempted ? "Not answered:" : mcq.full ? "Chose:" : "Wrong:";
        const studentColor = mcq.notAttempted ? AMBER : mcq.full ? GREEN : RED;
        drawBoldText(page, studentLabel, {
          x: layout.colX,
          y: cy,
          size: noteSize - 0.5,
          font: bold,
          color: studentColor,
        });
        cy -= 8;
        cy = drawWrappedLines(page, studentLines, {
          x: layout.colX + 2,
          y: cy,
          size: noteSize - 0.5,
          font: reg,
          color: studentColor,
          lineH: kwLineH,
        });
        cy -= 2;
      }

      if (correctLines.length > 0 && (!mcq.full || mcq.notAttempted)) {
        drawBoldText(page, "Correct:", {
          x: layout.colX,
          y: cy,
          size: noteSize - 0.5,
          font: bold,
          color: GREEN,
        });
        cy -= 8;
        cy = drawWrappedLines(page, correctLines, {
          x: layout.colX + 2,
          y: cy,
          size: noteSize - 0.5,
          font: reg,
          color: GREEN,
          lineH: kwLineH,
        });
        cy -= 2;
      }

      if (noteLines.length > 0) {
        cy -= sectionGap;
        page.drawLine({
          start: { x: layout.colX, y: cy + 4 },
          end: { x: layout.colX + layout.colWidth, y: cy + 4 },
          thickness: 0.4,
          color: LGREY,
        });
        cy -= 4;
        drawBoldText(page, "Why:", {
          x: layout.colX,
          y: cy,
          size: noteSize - 0.5,
          font: bold,
          color: NAVY,
        });
        cy -= 8;
        drawWrappedLines(page, noteLines, {
          x: layout.colX,
          y: cy,
          size: noteSize,
          font: reg,
          color: rgb(0.12, 0.14, 0.22),
          lineH: noteLineH,
        });
      }
    } else {
      if (blank && blankAnswerLines.length > 0) {
        drawBoldText(page, "Not answered:", {
          x: layout.colX,
          y: cy,
          size: noteSize - 0.5,
          font: bold,
          color: AMBER,
        });
        cy -= 8;
        cy = drawWrappedLines(page, blankAnswerLines, {
          x: layout.colX + 2,
          y: cy,
          size: noteSize - 0.5,
          font: reg,
          color: AMBER,
          lineH: kwLineH,
        });
        cy -= 2;
      }

      if (marked.length > 0) {
        drawBoldText(page, "Earned:", { x: layout.colX, y: cy, size: noteSize - 0.5, font: bold, color: GREEN });
        cy -= 8;
        for (const kw of marked) {
          const lines = wrap(kw, bold, noteSize - 0.5, layout.colWidth);
          cy = drawWrappedLines(page, lines, {
            x: layout.colX + 2,
            y: cy,
            size: noteSize - 0.5,
            font: reg,
            color: GREEN,
            lineH: kwLineH,
          });
        }
        cy -= 2;
      }

      if (missing.length > 0) {
        drawBoldText(page, "Missing:", { x: layout.colX, y: cy, size: noteSize - 0.5, font: bold, color: RED });
        cy -= 8;
        for (const kw of missing) {
          const lines = wrap(kw, bold, noteSize - 0.5, layout.colWidth);
          cy = drawWrappedLines(page, lines, {
            x: layout.colX + 2,
            y: cy,
            size: noteSize - 0.5,
            font: reg,
            color: RED,
            lineH: kwLineH,
          });
        }
        cy -= 2;
      }

      if (noteLines.length > 0) {
        cy -= sectionGap;
        page.drawLine({
          start: { x: layout.colX, y: cy + 4 },
          end: { x: layout.colX + layout.colWidth, y: cy + 4 },
          thickness: 0.4,
          color: LGREY,
        });
        cy -= 4;
        drawWrappedLines(page, noteLines, {
          x: layout.colX,
          y: cy,
          size: noteSize,
          font: reg,
          color: rgb(0.12, 0.14, 0.22),
          lineH: noteLineH,
        });
      }
    }

    page.drawLine({
      start: { x: layout.paperW - 1, y: paperY },
      end: { x: layout.colLeft + 2, y: center },
      thickness: 0.5,
      color: col,
      dashArray: [2, 2],
      dashPhase: 0,
    });
  }
}

/** Prepend all grading report pages (1, 2, 3…) before the student work. */
function prependGradingReport(pdfDoc, { bold, reg, questions, totalMarks, maxTotalMarks, summary }) {
  const summaryPage = pdfDoc.insertPage(0, [595, 842]);
  const { width: sw, height: sh } = summaryPage.getSize();
  const M = 38;
  const CW = sw - M * 2;
  let reportPage = summaryPage;
  let reportPageCount = 1;

  const pct = maxTotalMarks > 0 ? Math.round((totalMarks / maxTotalMarks) * 100) : 0;
  const sCol = scoreCol(totalMarks, maxTotalMarks);
  const sBg = scoreBg(totalMarks, maxTotalMarks);
  const grade = pct >= 75 ? "Strong Performance" : pct >= 50 ? "Satisfactory" : "Needs Improvement";

  summaryPage.drawRectangle({ x: 0, y: sh - 62, width: sw, height: 62, color: NAVY });

  summaryPage.drawText("GRADING REPORT", {
    x: M,
    y: sh - 28,
    size: 18,
    font: bold,
    color: WHITE,
  });

  summaryPage.drawText("Sahahly • Performance Report", {
    x: M,
    y: sh - 44,
    size: 8,
    font: reg,
    color: rgb(0.6, 0.72, 0.95),
  });

  const dateStr = new Date().toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  summaryPage.drawText(dateStr, {
    x: sw - M - reg.widthOfTextAtSize(dateStr, 8),
    y: sh - 44,
    size: 8,
    font: reg,
    color: rgb(0.6, 0.72, 0.95),
  });

  let yPos = sh - 85;

  summaryPage.drawRectangle({
    x: M,
    y: yPos - 58,
    width: CW,
    height: 58,
    color: sBg,
    borderColor: sCol,
    borderWidth: 1.5,
  });

  summaryPage.drawRectangle({
    x: M,
    y: yPos - 58,
    width: 5,
    height: 58,
    color: sCol,
  });

  const isUngraded =
    totalMarks === "Ungraded" || maxTotalMarks == null || maxTotalMarks === "";

  const scoreText = isUngraded ? "Ungraded" : `${totalMarks} / ${maxTotalMarks}`;

  summaryPage.drawText(scoreText, {
    x: M + 14,
    y: yPos - 26,
    size: 28,
    font: bold,
    color: sCol,
  });

  summaryPage.drawText(`${pct}%`, {
    x: M + 14,
    y: yPos - 44,
    size: 10,
    font: bold,
    color: sCol,
  });

  summaryPage.drawText(grade, {
    x: M + 155,
    y: yPos - 22,
    size: 13,
    font: bold,
    color: NAVY,
  });

  summaryPage.drawRectangle({
    x: M + 155,
    y: yPos - 38,
    width: CW - 180,
    height: 7,
    color: rgb(0.86, 0.88, 0.94),
  });

  summaryPage.drawRectangle({
    x: M + 155,
    y: yPos - 38,
    width: Math.round((CW - 180) * (maxTotalMarks > 0 ? totalMarks / maxTotalMarks : 0)),
    height: 7,
    color: sCol,
  });

  yPos -= 78;

  summaryPage.drawText("OVERALL SUMMARY", {
    x: M,
    y: yPos,
    size: 8,
    font: bold,
    color: rgb(0.35, 0.42, 0.58),
  });

  yPos -= 12;

  const summaryLines = wrap(summary || "No overall summary provided.", reg, 8, CW).slice(0, 8);
  summaryLines.forEach((line) => {
    summaryPage.drawText(san(line), {
      x: M,
      y: yPos,
      size: 8,
      font: reg,
      color: rgb(0.25, 0.25, 0.3),
    });
    yPos -= 10;
  });

  yPos -= 14;

  summaryPage.drawText("TIME TO FOCUS YOUR REVISION", {
    x: M,
    y: yPos,
    size: 8,
    font: bold,
    color: rgb(0.35, 0.42, 0.58),
  });

  yPos -= 12;

  const focusIntro =
    "Below is a list of every question where you lost marks. For each, the examiner has recommended the chapter to review and what specifically to focus on.";

  wrap(focusIntro, reg, 7.4, CW)
    .slice(0, 2)
    .forEach((line) => {
      summaryPage.drawText(san(line), {
        x: M,
        y: yPos,
        size: 7.4,
        font: reg,
        color: rgb(0.25, 0.25, 0.3),
      });
      yPos -= 9;
    });

  yPos -= 10;

  const topics = buildTopicsMap(questions);

  if (topics.length === 0) {
    const boxH = 44;
    if (yPos - boxH < BD_FOOTER_Y + 20) {
      const next = openNextReportPage(
        pdfDoc,
        reportPageCount,
        reportPage,
        sw,
        sh,
        M,
        bold,
        reg,
        "GRADING REPORT (continued)"
      );
      reportPage = next.page;
      reportPageCount = next.reportPageCount;
      yPos = next.yPos;
    }
    reportPage.drawRectangle({
      x: M,
      y: yPos - boxH,
      width: CW,
      height: boxH,
      color: rgb(0.88, 0.97, 0.91),
      borderColor: GREEN,
      borderWidth: 0.7,
    });
    reportPage.drawText("Excellent Work", {
      x: M + 14,
      y: yPos - 18,
      size: 11,
      font: bold,
      color: GREEN,
    });
    reportPage.drawText("No revision topics — full marks on all questions.", {
      x: M + 14,
      y: yPos - 32,
      size: 7.4,
      font: reg,
      color: rgb(0.25, 0.25, 0.3),
    });
    yPos -= boxH + 9;
  } else {
    topics.forEach(([topic, data]) => {
      const boxH = 52;
      if (yPos - boxH < BD_FOOTER_Y + 20) {
        const next = openNextReportPage(
          pdfDoc,
          reportPageCount,
          reportPage,
          sw,
          sh,
          M,
          bold,
          reg,
          "GRADING REPORT (continued)"
        );
        reportPage = next.page;
        reportPageCount = next.reportPageCount;
        yPos = next.yPos;
      }

      reportPage.drawRectangle({
        x: M,
        y: yPos - boxH,
        width: CW,
        height: boxH,
        color: rgb(0.96, 0.97, 1),
        borderColor: rgb(0.82, 0.84, 0.9),
        borderWidth: 0.7,
      });

      reportPage.drawRectangle({
        x: M,
        y: yPos - boxH,
        width: 5,
        height: boxH,
        color: NAVY,
      });

      reportPage.drawText(san(topic).substring(0, 60), {
        x: M + 14,
        y: yPos - 16,
        size: 10,
        font: bold,
        color: NAVY,
      });

      const qText = `Questions: ${data.questions.join(", ")}`;
      wrap(qText, bold, 6.4, CW - 25)
        .slice(0, 1)
        .forEach((line) => {
          reportPage.drawText(san(line), {
            x: M + 14,
            y: yPos - 30,
            size: 6.4,
            font: bold,
            color: RED,
          });
        });

      const advice =
        data.advice[0] || "Revise this topic carefully and practise similar exam questions.";

      wrap(advice, reg, 6.8, CW - 25)
        .slice(0, 2)
        .forEach((line, i) => {
          reportPage.drawText(san(line), {
            x: M + 14,
            y: yPos - 43 - i * 8,
            size: 6.8,
            font: reg,
            color: rgb(0.25, 0.25, 0.3),
          });
        });

      yPos -= boxH + 9;
    });
  }

  yPos -= 4;

  if (yPos - 25 < BD_FOOTER_Y) {
    const next = openNextReportPage(
      pdfDoc,
      reportPageCount,
      reportPage,
      sw,
      sh,
      M,
      bold,
      reg,
      "GRADING REPORT (continued)"
    );
    reportPage = next.page;
    reportPageCount = next.reportPageCount;
    yPos = next.yPos;
  }

  reportPage.drawText("QUESTION BREAKDOWN", {
    x: M,
    y: yPos,
    size: 8,
    font: bold,
    color: rgb(0.35, 0.42, 0.58),
  });

  yPos -= 5;

  const noteW = CW - BD_NOTE_W_OFFSET;
  let rowIndex = 0;
  yPos = drawBreakdownColumnHeaders(reportPage, yPos, M, CW, bold);

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const { topicLines, noteLines, rowH } = measureBreakdownRow(q, reg, bold, noteW);

    if (yPos - rowH < BD_FOOTER_Y) {
      const next = openNextReportPage(
        pdfDoc,
        reportPageCount,
        reportPage,
        sw,
        sh,
        M,
        bold,
        reg,
        "QUESTION BREAKDOWN (continued)"
      );
      reportPage = next.page;
      reportPageCount = next.reportPageCount;
      yPos = next.yPos;
      yPos = drawBreakdownColumnHeaders(reportPage, yPos, M, CW, bold);
    }

    const qCol = scoreCol(Number(q.marksAwarded || 0), Number(q.maxMarks || 0));
    const qBg = rowIndex % 2 === 0 ? rgb(0.96, 0.97, 1) : WHITE;

    reportPage.drawRectangle({
      x: M,
      y: yPos - rowH,
      width: CW,
      height: rowH,
      color: qBg,
    });

    reportPage.drawRectangle({
      x: M,
      y: yPos - rowH,
      width: 3,
      height: rowH,
      color: qCol,
    });

    const textY = yPos - 10;
    reportPage.drawText(san(`Q${q.questionNumber}`).substring(0, 11), {
      x: M + 5,
      y: textY,
      size: 6.3,
      font: bold,
      color: rgb(0.1, 0.1, 0.15),
    });

    reportPage.drawText(`${q.marksAwarded}/${q.maxMarks}`, {
      x: M + 38,
      y: textY,
      size: 6.3,
      font: bold,
      color: qCol,
    });

    reportPage.drawText(String(q.pageNumber || "?"), {
      x: M + 84,
      y: textY,
      size: 6.3,
      font: reg,
      color: rgb(0.35, 0.35, 0.4),
    });

    topicLines.forEach((line, li) => {
      reportPage.drawText(line, {
        x: M + 110,
        y: textY - li * BD_LINE_H,
        size: BD_TOPIC_SIZE,
        font: bold,
        color: NAVY,
      });
    });

    noteLines.forEach((line, li) => {
      reportPage.drawText(line, {
        x: M + 240,
        y: textY - li * BD_LINE_H,
        size: BD_NOTE_SIZE,
        font: reg,
        color: rgb(0.25, 0.25, 0.3),
      });
    });

    yPos -= rowH;
    rowIndex += 1;
  }

  drawReportFooter(reportPage, sw, reg);
  return reportPageCount;
}

function drawOutOfScopeNote(page, note, paperW, bold) {
  const { height } = page.getSize();
  const yPct = Math.min(92, Math.max(5, note.yPercent ?? 30));
  const anchorY = height - (height * yPct) / 100;
  const label = san(note.label || "not included in your assignment");
  const boxH = 24;
  const boxW = Math.min(paperW - 16, Math.max(160, bold.widthOfTextAtSize(label, 8) + 16));
  const boxX = 8;
  const boxY = Math.max(30, anchorY - boxH / 2);

  page.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxW,
    height: boxH,
    color: rgb(0.99, 0.95, 0.87),
    borderColor: AMBER,
    borderWidth: 1.2,
  });
  page.drawText(label, {
    x: boxX + 8,
    y: boxY + 8,
    size: 8,
    font: bold,
    color: AMBER,
  });
}

function wrapTeacherLines(text, font, size, maxWidth, maxLines = 5) {
  const words = san(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

function drawTeacherAnnotationOnPaper(page, note, paperW, LM, height, bold, reg) {
  const yPct = Math.min(92, Math.max(5, note.yPercent ?? 30));
  const anchorY = height - (height * yPct) / 100;
  const label = note.questionLabel ? `Teacher · ${note.questionLabel}` : "Teacher note";
  const lines = wrapTeacherLines(note.text, reg, 7, paperW - LM - 24, 4);
  const lineH = 9;
  const boxH = 12 + lines.length * lineH;
  const boxW = Math.min(paperW - LM - 14, 130);
  const boxX = LM + 8;
  const boxY = Math.max(34, Math.min(anchorY - boxH / 2, height - boxH - 30));

  page.drawLine({
    start: { x: LM + 2, y: anchorY },
    end: { x: boxX, y: boxY + boxH / 2 },
    thickness: 0.75,
    color: TEACHER_COL,
    dashArray: [2, 2],
  });

  page.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxW,
    height: boxH,
    color: TEACHER_BG,
    borderColor: TEACHER_COL,
    borderWidth: 1,
  });
  page.drawText(san(label), {
    x: boxX + 5,
    y: boxY + boxH - 10,
    size: 7,
    font: bold,
    color: TEACHER_COL,
  });
  let ty = boxY + boxH - 20;
  for (const ln of lines) {
    page.drawText(ln, { x: boxX + 5, y: ty, size: 7, font: reg, color: NAVY });
    ty -= lineH;
  }
}

function drawTeacherAnnotationsInColumn(page, layout, notes, bold, reg) {
  if (!notes?.length) return;
  let y = layout.colBottom + 8;

  for (const note of notes) {
    const label = note.questionLabel ? `Teacher · ${note.questionLabel}` : "Teacher note";
    const lines = wrapTeacherLines(note.text, reg, 6.5, layout.colWidth - 4, 4);
    const blockH = 14 + lines.length * 7.5;
    if (y + blockH > layout.colTop - 20) break;

    page.drawRectangle({
      x: layout.colX - 2,
      y,
      width: layout.colWidth + 4,
      height: blockH,
      color: TEACHER_BG,
      borderColor: TEACHER_COL,
      borderWidth: 0.8,
    });
    page.drawText(san(label), {
      x: layout.colX,
      y: y + blockH - 10,
      size: 6.5,
      font: bold,
      color: TEACHER_COL,
    });
    let cy = y + blockH - 18;
    for (const ln of lines) {
      page.drawText(ln, { x: layout.colX + 1, y: cy, size: 6.5, font: reg, color: NAVY });
      cy -= 7.5;
    }
    y += blockH + 4;
  }
}

export async function annotatePdf({
  studentFile,
  questions,
  totalMarks,
  maxTotalMarks,
  summary,
  outOfScopeNotes = [],
  teacherAnnotations = [],
  skipCompress = false,
}) {
  const buf = await studentFile.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const studentPageCount = pdfDoc.getPageCount();
  const enrichedQuestions = normalizeQuestionPlacement(
    enrichMarkingQuestions(questions || []),
    studentPageCount
  );

  const byPage = {};
  for (const q of enrichedQuestions) {
    const p = Math.max(1, Math.min(q.pageNumber || 1, studentPageCount));
    (byPage[p] = byPage[p] || []).push(q);
  }

  const scopeByPage = {};
  for (const note of outOfScopeNotes || []) {
    const p = Math.max(1, Math.min(note.pageNumber || 1, studentPageCount));
    (scopeByPage[p] = scopeByPage[p] || []).push(note);
  }

  const resolvedTeacher = resolveTeacherAnnotationsForPdf(
    teacherAnnotations,
    enrichedQuestions
  );
  const teacherByPage = {};
  for (const note of resolvedTeacher) {
    const p = Math.max(1, Math.min(note.pageNumber || 1, studentPageCount));
    (teacherByPage[p] = teacherByPage[p] || []).push(note);
  }

  const reportPageCount = prependGradingReport(pdfDoc, {
    bold,
    reg,
    questions: enrichedQuestions,
    totalMarks,
    maxTotalMarks,
    summary,
  });

  const pages = pdfDoc.getPages();
  const STRIP_H = 22;
  const LM = 50;

  for (let i = reportPageCount; i < pages.length; i++) {
    const page = pages[i];
    const pageNum = i - reportPageCount + 1;
    const qs = byPage[pageNum] || [];

    const layout = await appendExaminerColumn(pdfDoc, page, STRIP_H);
    const { paperW, totalW, height } = { paperW: layout.paperW, totalW: layout.totalW, height: page.getSize().height };

    const PAGE_BOTTOM = STRIP_H + 6;
    const PAGE_TOP = height - 8;
    const badgeH = 18;
    const badgeBlockH = badgeH + 28;

    const sortedQs = [...qs].sort(
      (a, b) => yPercentOf(a) - yPercentOf(b) || compareQuestionNumbers(a.questionNumber, b.questionNumber)
    );

    const badgePlacements = resolveVerticalCollisions(
      sortedQs.map((q) => ({
        q,
        targetCenter: paperAnchorY(q, height),
        height: badgeBlockH,
      })),
      {
        minCenter: PAGE_BOTTOM + badgeBlockH / 2,
        maxCenter: PAGE_TOP - badgeBlockH / 2,
        gap: 6,
      }
    );

    for (const { q, center: anchorY } of badgePlacements) {
      const col = scoreCol(Number(q.marksAwarded || 0), Number(q.maxMarks || 0));
      const bg = scoreBg(Number(q.marksAwarded || 0), Number(q.maxMarks || 0));
      const full = Number(q.marksAwarded || 0) >= Number(q.maxMarks || 0);
      const none = Number(q.marksAwarded || 0) === 0;
      const notAttempted = q.studentAnswer === "Not attempted";

      const scoreTxt = `${q.marksAwarded}/${q.maxMarks}`;
      const badgeW = Math.max(34, bold.widthOfTextAtSize(scoreTxt, 10) + 10);
      const badgeX = 3;
      const badgeY = anchorY - badgeH / 2;

      page.drawRectangle({
        x: badgeX,
        y: badgeY,
        width: badgeW,
        height: badgeH,
        color: bg,
        borderColor: col,
        borderWidth: 1.2,
      });

      page.drawText(scoreTxt, {
        x: badgeX + 5,
        y: badgeY + 5,
        size: 11,
        font: bold,
        color: col,
      });

      page.drawText(san(`Q${q.questionNumber}`).substring(0, 9), {
        x: badgeX,
        y: badgeY + badgeH + 3,
        size: 9,
        font: bold,
        color: NAVY,
      });

      const mcq = mcqChoiceSummary(q);
      const symbolY = badgeY - 18;

      if (notAttempted) {
        page.drawText("?", { x: badgeX + 9, y: symbolY + 2, size: 14, font: bold, color: AMBER });
      } else if (mcq.isMcq && mcq.student) {
        const letter = extractOptionLetter(mcq.student) || san(mcq.student).substring(0, 6);
        const choiceColor = full ? GREEN : RED;
        const tag = full ? letter : `${letter} X`;
        page.drawText(san(tag), {
          x: badgeX + 2,
          y: symbolY + 2,
          size: 9,
          font: bold,
          color: choiceColor,
        });
      } else if (full) {
        drawTick(page, badgeX + 3, symbolY, 14, GREEN);
      } else if (none) {
        drawCross(page, badgeX + 3, symbolY, 13, RED);
      } else {
        drawTick(page, badgeX + 1, symbolY, 12, GREEN);
        drawCross(page, badgeX + 16, symbolY, 12, RED);
      }

      page.drawLine({
        start: { x: badgeX + badgeW, y: anchorY },
        end: { x: LM + 2, y: anchorY },
        thickness: 0.85,
        color: col,
        dashArray: [2, 2],
        dashPhase: 0,
      });
    }

    drawExaminerColumn(page, layout, qs, bold, reg, height);

    for (const note of teacherByPage[pageNum] || []) {
      drawTeacherAnnotationOnPaper(page, note, paperW, LM, height, bold, reg);
    }
    drawTeacherAnnotationsInColumn(page, layout, teacherByPage[pageNum] || [], bold, reg);

    for (const note of scopeByPage[pageNum] || []) {
      drawOutOfScopeNote(page, note, paperW, bold);
    }

    const pageAwarded = qs.reduce((s, q) => s + Number(q.marksAwarded || 0), 0);
    const pageMax = qs.reduce((s, q) => s + Number(q.maxMarks || 0), 0);
    const stripH = 18;

    page.drawRectangle({ x: 0, y: 0, width: totalW, height: stripH, color: NAVY });
    page.drawText("MARKED  ·  Sahahly", {
      x: 8,
      y: 5,
      size: 9,
      font: bold,
      color: rgb(0.6, 0.72, 0.95),
    });

    if (qs.length > 0) {
      const ptxt = `Page marks: ${pageAwarded}/${pageMax}`;
      const ptxtW = bold.widthOfTextAtSize(ptxt, 9);
      page.drawText(ptxt, {
        x: paperW / 2 - ptxtW / 2,
        y: 5,
        size: 9,
        font: bold,
        color: WHITE,
      });
    }
  }

  const rawBytes = await pdfDoc.save();
  if (skipCompress) return rawBytes;
  return await compressAnnotatedPdf(rawBytes);
}
