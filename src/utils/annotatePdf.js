import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// ── Colours ───────────────────────────────────────────────────────────────────
const GREEN = rgb(0.04, 0.60, 0.25);
const RED = rgb(0.85, 0.12, 0.12);
const AMBER = rgb(0.88, 0.52, 0.02);
const NAVY = rgb(0.05, 0.10, 0.30);
const WHITE = rgb(1, 1, 1);
const GREY = rgb(0.55, 0.55, 0.60);
const LGREY = rgb(0.88, 0.90, 0.94);

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

function truncateToWidth(text, font, size, maxW) {
  let value = san(text);
  if (font.widthOfTextAtSize(value, size) <= maxW) return value;

  while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > maxW) {
    value = value.slice(0, -1);
  }

  return value.length < san(text).length ? `${value}...` : value;
}

<<<<<<< Updated upstream
/** Reserve space for scanned exam right margin (e.g. "IN THIS AREA" strip). */
function rightAnnotationBox(pageWidth) {
  const reserve = Math.max(155, Math.round(pageWidth * 0.24));
  const pad = 10;
  const rx = pageWidth - reserve + pad;
  const rWidth = reserve - pad * 2;
  const maxX = pageWidth - pad;
  return { rx, rWidth, maxX, reserve };
}

function rightBlockHeight(marked, missing, noteLines, kwLineH, noteLineH) {
  const kwH = marked.length > 0 ? 11 + marked.length * kwLineH : 0;
  const misH = missing.length > 0 ? 11 + missing.length * kwLineH : 0;
  const noteH = noteLines.length > 0 ? 11 + noteLines.length * noteLineH : 0;
  return kwH + misH + noteH + 6;
}

function fitRightBlockContent({
  reason,
  markedKeywords,
  missingKeywords,
  font,
  noteSize,
  maxW,
  maxHeight,
  kwLineH,
  noteLineH,
}) {
=======
function rightBlockHeight(marked, missing, noteLines) {
  const kwH = marked.length > 0 ? 11 + marked.length * 13 : 0;
  const misH = missing.length > 0 ? 11 + missing.length * 13 : 0;
  const noteH = noteLines.length > 0 ? 11 + noteLines.length * 9 : 0;
  return kwH + misH + noteH + 6;
}

function fitRightBlockContent({ reason, markedKeywords, missingKeywords, font, noteSize, maxW, maxHeight }) {
>>>>>>> Stashed changes
  let marked = markedKeywords.slice(0, 3);
  let missing = missingKeywords.slice(0, 3);
  let noteLines = reason ? wrap(reason, font, noteSize, maxW) : [];

  const trimToHeight = () => {
<<<<<<< Updated upstream
    while (
      rightBlockHeight(marked, missing, noteLines, kwLineH, noteLineH) > maxHeight &&
      noteLines.length > 0
    ) {
      noteLines = noteLines.slice(0, -1);
    }
    while (
      rightBlockHeight(marked, missing, noteLines, kwLineH, noteLineH) > maxHeight &&
      missing.length > 0
    ) {
      missing = missing.slice(0, -1);
    }
    while (
      rightBlockHeight(marked, missing, noteLines, kwLineH, noteLineH) > maxHeight &&
      marked.length > 0
    ) {
=======
    while (rightBlockHeight(marked, missing, noteLines) > maxHeight && noteLines.length > 0) {
      noteLines = noteLines.slice(0, -1);
    }

    while (rightBlockHeight(marked, missing, noteLines) > maxHeight && missing.length > 0) {
      missing = missing.slice(0, -1);
    }

    while (rightBlockHeight(marked, missing, noteLines) > maxHeight && marked.length > 0) {
>>>>>>> Stashed changes
      marked = marked.slice(0, -1);
    }
  };

  trimToHeight();

<<<<<<< Updated upstream
  if (rightBlockHeight(marked, missing, noteLines, kwLineH, noteLineH) > maxHeight) {
=======
  if (rightBlockHeight(marked, missing, noteLines) > maxHeight) {
>>>>>>> Stashed changes
    marked = [];
    missing = [];
    noteLines = reason ? wrap(reason, font, noteSize, maxW).slice(0, 1) : [];
    trimToHeight();
  }

  return { marked, missing, noteLines };
}

<<<<<<< Updated upstream
function drawBoldText(page, text, { x, y, size, font, color, maxX }) {
  let line = san(text);
  if (maxX != null && font.widthOfTextAtSize(line, size) > maxX - x) {
    line = truncateToWidth(line, font, size, maxX - x);
  }
  page.drawText(line, { x, y, size, font, color });
  page.drawText(line, { x: x + 0.35, y, size, font, color });
}

=======
>>>>>>> Stashed changes
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
    .filter(q => Number(q.marksAwarded) < Number(q.maxMarks))
    .forEach(q => {
      const topic = q.studyTopic || "General Revision";
      const lost = Number(q.maxMarks || 0) - Number(q.marksAwarded || 0);

      if (!topicsMap[topic]) {
        topicsMap[topic] = {
          questions: [],
          advice: [],
          totalLost: 0
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

export async function annotatePdf({ studentFile, questions, totalMarks, maxTotalMarks, summary }) {
  const buf = await studentFile.arrayBuffer();
  const pdfDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const reg = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const pages = pdfDoc.getPages();

  const byPage = {};
  for (const q of questions) {
    const p = Math.max(1, Math.min(q.pageNumber || 1, pages.length));
    (byPage[p] = byPage[p] || []).push(q);
  }

  const LM = 50;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const pageNum = i + 1;
    const { width, height } = page.getSize();
    const qs = byPage[pageNum] || [];
    const { rx, rWidth, maxX, reserve: rightReserve } = rightAnnotationBox(width);

    const sortedQs = [...qs].sort((a, b) => (a.yPercent ?? 30) - (b.yPercent ?? 30));

<<<<<<< Updated upstream
    const STRIP_H = 22;
    const PAGE_BOTTOM = STRIP_H + 6;
    const PAGE_TOP = height - 8;
=======
    const STRIP_H = 16;
    const PAGE_BOTTOM = 24;
    const PAGE_TOP = height - STRIP_H - 4;
>>>>>>> Stashed changes
    let leftCursor = PAGE_TOP;
    let rightCursor = PAGE_TOP;

    for (const q of sortedQs) {
      const yPct = Math.min(92, Math.max(5, q.yPercent ?? 30));
      const anchorY = height - (height * yPct / 100);
      const col = scoreCol(Number(q.marksAwarded || 0), Number(q.maxMarks || 0));
      const bg = scoreBg(Number(q.marksAwarded || 0), Number(q.maxMarks || 0));
      const full = Number(q.marksAwarded || 0) >= Number(q.maxMarks || 0);
      const none = Number(q.marksAwarded || 0) === 0;
      const notAttempted = q.studentAnswer === "Not attempted";

      const badgeH = 18;
      const scoreTxt = `${q.marksAwarded}/${q.maxMarks}`;
      const badgeW = Math.max(34, bold.widthOfTextAtSize(scoreTxt, 10) + 10);
      const badgeX = 3;

      let leftBlockTop = Math.min(anchorY + badgeH / 2, leftCursor);
      let badgeY = Math.max(PAGE_BOTTOM, leftBlockTop - badgeH);
      leftBlockTop = badgeY + badgeH;

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

      const symbolY = Math.max(PAGE_BOTTOM, badgeY - 18);

      if (notAttempted) {
        page.drawText("?", { x: badgeX + 9, y: symbolY + 2, size: 14, font: bold, color: AMBER });
      } else if (full) {
        drawTick(page, badgeX + 3, symbolY, 14, GREEN);
      } else if (none) {
        drawCross(page, badgeX + 3, symbolY, 13, RED);
      } else {
        drawTick(page, badgeX + 1, symbolY, 12, GREEN);
        drawCross(page, badgeX + 16, symbolY, 12, RED);
      }

      leftCursor = Math.max(PAGE_BOTTOM, Math.min(leftCursor, symbolY - 8));

      page.drawLine({
        start: { x: badgeX + badgeW, y: Math.min(anchorY, leftBlockTop - badgeH / 2) },
        end: { x: LM + 2, y: Math.min(anchorY, leftBlockTop - badgeH / 2) },
        thickness: 0.85,
        color: col,
        dashArray: [2, 2],
        dashPhase: 0,
      });

<<<<<<< Updated upstream
      const noteSize = 7.5;
      const kwLineH = 14;
      const noteLineH = 9;
      const maxRightHeight = Math.max(28, rightCursor - PAGE_BOTTOM);
=======
      const rx = width - RM + 5;
      const rWidth = RM - 8;
      const noteSize = 7;
      const maxRightHeight = Math.max(24, rightCursor - PAGE_BOTTOM);
>>>>>>> Stashed changes
      const { marked, missing, noteLines } = fitRightBlockContent({
        reason: q.reason,
        markedKeywords: q.markedKeywords || [],
        missingKeywords: q.missingKeywords || [],
        font: bold,
        noteSize,
        maxW: rWidth,
        maxHeight: maxRightHeight,
<<<<<<< Updated upstream
        kwLineH,
        noteLineH,
      });
      const totalH = rightBlockHeight(marked, missing, noteLines, kwLineH, noteLineH);

      let ry = Math.min(anchorY + totalH / 2, rightCursor);
      if (ry - totalH < PAGE_BOTTOM) ry = PAGE_BOTTOM + totalH;
=======
      });
      const totalH = rightBlockHeight(marked, missing, noteLines);

      let ry = Math.min(anchorY + totalH / 2, rightCursor);
      if (ry - totalH < PAGE_BOTTOM) {
        ry = PAGE_BOTTOM + totalH;
      }
>>>>>>> Stashed changes
      ry = Math.min(ry, PAGE_TOP);

      const lineY = Math.min(anchorY, ry - totalH / 2);
      page.drawLine({
        start: { x: width - rightReserve + 4, y: lineY },
        end: { x: rx - 2, y: lineY },
        thickness: 0.85,
        color: col,
        dashArray: [2, 2],
        dashPhase: 0,
      });

      if (marked.length > 0) {
        drawBoldText(page, "Keywords:", { x: rx, y: ry, size: 8, font: bold, color: GREEN, maxX });
        ry -= 10;

        for (const kw of marked) {
<<<<<<< Updated upstream
          const kwTxt = truncateToWidth(kw, bold, 7.5, rWidth - 6);
          const kwW = Math.min(rWidth, bold.widthOfTextAtSize(kwTxt, 7.5) + 6);
=======
          const kwTxt = truncateToWidth(kw, bold, 7, rWidth - 6);
          const kwW = Math.min(rWidth, bold.widthOfTextAtSize(kwTxt, 7) + 6);
>>>>>>> Stashed changes

          page.drawRectangle({
            x: rx,
            y: ry - 3,
            width: kwW,
            height: 12,
            color: rgb(0.88, 0.97, 0.91),
            borderColor: GREEN,
            borderWidth: 0.9,
          });

<<<<<<< Updated upstream
          drawBoldText(page, kwTxt, {
            x: rx + 3,
            y: ry,
            size: 7.5,
            font: bold,
            color: GREEN,
            maxX,
          });
          ry -= kwLineH;
=======
          page.drawText(kwTxt, { x: rx + 3, y: ry, size: 7, font: bold, color: GREEN });
          ry -= 13;
>>>>>>> Stashed changes
        }
      }

      if (missing.length > 0) {
        drawBoldText(page, "Missing:", { x: rx, y: ry, size: 8, font: bold, color: RED, maxX });
        ry -= 10;

        for (const kw of missing) {
<<<<<<< Updated upstream
          const kwTxt = truncateToWidth(kw, bold, 7.5, rWidth - 6);
          const kwW = Math.min(rWidth, bold.widthOfTextAtSize(kwTxt, 7.5) + 6);
=======
          const kwTxt = truncateToWidth(kw, bold, 7, rWidth - 6);
          const kwW = Math.min(rWidth, bold.widthOfTextAtSize(kwTxt, 7) + 6);
>>>>>>> Stashed changes

          page.drawRectangle({
            x: rx,
            y: ry - 3,
            width: kwW,
            height: 12,
            color: rgb(0.99, 0.90, 0.90),
            borderColor: RED,
            borderWidth: 0.9,
          });

<<<<<<< Updated upstream
          drawBoldText(page, kwTxt, {
            x: rx + 3,
            y: ry,
            size: 7.5,
            font: bold,
            color: RED,
            maxX,
          });
          ry -= kwLineH;
=======
          page.drawText(kwTxt, { x: rx + 3, y: ry, size: 7, font: bold, color: RED });
          ry -= 13;
>>>>>>> Stashed changes
        }
      }

      if (noteLines.length > 0) {
        ry -= 3;
        page.drawLine({
          start: { x: rx, y: ry + 8 },
          end: { x: rx + rWidth, y: ry + 8 },
          thickness: 0.6,
          color: LGREY,
        });

        ry -= 2;

        for (const line of noteLines) {
          if (ry < PAGE_BOTTOM) break;
<<<<<<< Updated upstream
          drawBoldText(page, line, {
            x: rx,
            y: ry,
            size: noteSize,
            font: bold,
            color: rgb(0, 0, 0.82),
            maxX,
          });
          ry -= noteLineH;
=======
          page.drawText(san(line), { x: rx, y: ry, size: noteSize, font: bold, color: rgb(0, 0, 1) });
          ry -= 9;
>>>>>>> Stashed changes
        }
      }

      rightCursor = Math.max(PAGE_BOTTOM, Math.min(rightCursor, ry - 8));
    }

    const pageAwarded = qs.reduce((s, q) => s + Number(q.marksAwarded || 0), 0);
    const pageMax = qs.reduce((s, q) => s + Number(q.maxMarks || 0), 0);
    const stripH = 18;

    page.drawRectangle({ x: 0, y: 0, width, height: stripH, color: NAVY });
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
        x: width / 2 - ptxtW / 2,
        y: 5,
        size: 9,
        font: bold,
        color: WHITE,
      });
    }

    if (pageNum === pages.length) {
      const pct = maxTotalMarks > 0 ? Math.round((totalMarks / maxTotalMarks) * 100) : 0;
      const ttxt = `TOTAL: ${totalMarks}/${maxTotalMarks} (${pct}%)`;
      const ttxtW = bold.widthOfTextAtSize(ttxt, 9);

      page.drawText(ttxt, {
        x: width - ttxtW - 8,
        y: 5,
        size: 9,
        font: bold,
        color: scoreCol(totalMarks, maxTotalMarks),
      });
    }
  }

  // ── Report page at beginning ────────────────────────────────────────────────
  const summaryPage = pdfDoc.insertPage(0, [595, 842]);
  const { width: sw, height: sh } = summaryPage.getSize();
  const M = 38;
  const CW = sw - M * 2;

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

  // Score Card
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
  totalMarks === "Ungraded" ||
  maxTotalMarks == null ||
  maxTotalMarks === "";

const scoreText = isUngraded
  ? "Ungraded"
  : `${totalMarks} / ${maxTotalMarks}`;

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

  // Overall Summary
  summaryPage.drawText("OVERALL SUMMARY", {
    x: M,
    y: yPos,
    size: 8,
    font: bold,
    color: rgb(0.35, 0.42, 0.58),
  });

  yPos -= 12;

  const summaryLines = wrap(summary || "No overall summary provided.", reg, 8, CW).slice(0, 4);
  summaryLines.forEach(line => {
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

  // Topics to Focus
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

  wrap(focusIntro, reg, 7.4, CW).slice(0, 2).forEach(line => {
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

  topics.slice(0, 2).forEach(([topic, data]) => {
    const boxH = 52;

    summaryPage.drawRectangle({
      x: M,
      y: yPos - boxH,
      width: CW,
      height: boxH,
      color: rgb(0.96, 0.97, 1),
      borderColor: rgb(0.82, 0.84, 0.9),
      borderWidth: 0.7,
    });

    summaryPage.drawRectangle({
      x: M,
      y: yPos - boxH,
      width: 5,
      height: boxH,
      color: NAVY,
    });

    summaryPage.drawText(san(topic).substring(0, 60), {
      x: M + 14,
      y: yPos - 16,
      size: 10,
      font: bold,
      color: NAVY,
    });

    const qText = `Questions: ${data.questions.join(", ")}`;
    wrap(qText, bold, 6.4, CW - 25).slice(0, 1).forEach(line => {
      summaryPage.drawText(san(line), {
        x: M + 14,
        y: yPos - 30,
        size: 6.4,
        font: bold,
        color: RED,
      });
    });

    const advice =
      data.advice[0] || "Revise this topic carefully and practise similar exam questions.";

    wrap(advice, reg, 6.8, CW - 25).slice(0, 2).forEach((line, i) => {
      summaryPage.drawText(san(line), {
        x: M + 14,
        y: yPos - 43 - i * 8,
        size: 6.8,
        font: reg,
        color: rgb(0.25, 0.25, 0.3),
      });
    });

    yPos -= boxH + 9;
  });

  yPos -= 4;

  // Question Breakdown
  summaryPage.drawText("QUESTION BREAKDOWN", {
    x: M,
    y: yPos,
    size: 8,
    font: bold,
    color: rgb(0.35, 0.42, 0.58),
  });

  yPos -= 5;

  summaryPage.drawRectangle({
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

  headers.forEach(h => {
    summaryPage.drawText(h.label, {
      x: h.x,
      y: yPos - 10,
      size: 6.5,
      font: bold,
      color: WHITE,
    });
  });

  yPos -= 15;

  for (let i = 0; i < questions.length; i++) {
    if (yPos < 45) break;

    const q = questions[i];
    const qCol = scoreCol(Number(q.marksAwarded || 0), Number(q.maxMarks || 0));
    const qBg = i % 2 === 0 ? rgb(0.96, 0.97, 1) : WHITE;

    summaryPage.drawRectangle({
      x: M,
      y: yPos - 14,
      width: CW,
      height: 14,
      color: qBg,
    });

    summaryPage.drawRectangle({
      x: M,
      y: yPos - 14,
      width: 3,
      height: 14,
      color: qCol,
    });

    summaryPage.drawText(san(`Q${q.questionNumber}`).substring(0, 11), {
      x: M + 5,
      y: yPos - 10,
      size: 6.3,
      font: bold,
      color: rgb(0.1, 0.1, 0.15),
    });

    summaryPage.drawText(`${q.marksAwarded}/${q.maxMarks}`, {
      x: M + 38,
      y: yPos - 10,
      size: 6.3,
      font: bold,
      color: qCol,
    });

    summaryPage.drawText(String(q.pageNumber || "?"), {
      x: M + 84,
      y: yPos - 10,
      size: 6.3,
      font: reg,
      color: rgb(0.35, 0.35, 0.4),
    });

    summaryPage.drawText(san(q.studyTopic || "-").substring(0, 24), {
      x: M + 110,
      y: yPos - 10,
      size: 6.1,
      font: bold,
      color: NAVY,
    });

    summaryPage.drawText(san(q.reason || "-").substring(0, 55), {
      x: M + 240,
      y: yPos - 10,
      size: 5.7,
      font: reg,
      color: rgb(0.25, 0.25, 0.3),
    });

    yPos -= 14;
  }

  summaryPage.drawLine({
    start: { x: M, y: 28 },
    end: { x: sw - M, y: 28 },
    thickness: 0.5,
    color: LGREY,
  });

  const footerText = "Generated by Sahahly";
  summaryPage.drawText(footerText, {
    x: sw / 2 - reg.widthOfTextAtSize(footerText, 8) / 2,
    y: 16,
    size: 8,
    font: reg,
    color: GREY,
  });

  return await pdfDoc.save();
}