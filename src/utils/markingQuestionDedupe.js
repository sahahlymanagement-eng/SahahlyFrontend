/**
 * Collapse phantom 0-mark copies after page-chunked marking.
 * Keep in sync with backend/src/utils/markingGrades.js dropGhostDuplicateQuestions.
 */

export function sanitizeQuestionNumber(raw) {
  let s = String(raw ?? "").trim();
  if (!s) return s;
  s = s.replace(/^(upper|lower|top|bottom)\s+/i, "");
  s = s.replace(/^questions?\s+/i, "");
  s = s.replace(/^q(?=[\d(])/i, "");
  s = s.replace(/^part\s+/i, "");
  s = s.replace(/\s+/g, "");
  s = s.replace(/[-–—_.,;:]+$/g, "");
  if (!s) return String(raw).trim().replace(/\s+/g, " ");
  return s;
}

export function canonicalQuestionKey(q) {
  let s = sanitizeQuestionNumber(q?.questionNumber)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (s.startsWith("q") && s.length > 1) s = s.slice(1);
  return s;
}

/**
 * Comparable keys for OUTER-SOURCE booklet labels.
 * Keep in sync with backend/src/utils/assignmentQuestionInventory.js labelAliases.
 */
export function labelAliases(raw) {
  const out = new Set();
  const primary = canonicalQuestionKey({ questionNumber: raw });
  if (primary) out.add(primary);

  const s = String(raw ?? "").trim();
  if (!s) return out;

  const m = s.match(/^Q?\s*(\d{1,3})\s*[-.]\s*(\d{1,2})\s*(.*)$/i);
  if (!m) return out;

  const outer = Number(m[1]);
  const source = m[2];
  const rest = m[3] || "";

  const sourceForm = canonicalQuestionKey({ questionNumber: `${source}${rest}` });
  if (sourceForm) out.add(sourceForm);

  const outerPartForm = canonicalQuestionKey({ questionNumber: `${m[1]}${rest}` });
  if (outerPartForm) out.add(outerPartForm);

  if (Number.isFinite(outer)) {
    for (const delta of [-1, 1]) {
      const o = outer + delta;
      if (o < 1) continue;
      const neigh = canonicalQuestionKey({ questionNumber: `${o}-${source}${rest}` });
      if (neigh) out.add(neigh);
    }
  }

  return out;
}

const PROMPT_LEAK_RE =
  /authority|expectedanswers?|keywords?|tolerances?|totalmark|markaudit|targetsubmission|forevaluation|evaluation\/grading|markscheme|submissionfor|soleauthority|preparedby|additionalguidance|mark\s*scheme/i;

/** Real MS ids only — drop prompt-leak / prose "questions" from analysis UI + report. */
export function looksLikePlausibleQuestionNumber(raw) {
  const original = String(raw ?? "").trim();
  if (!original) return false;
  if (PROMPT_LEAK_RE.test(original.replace(/\s+/g, ""))) return false;
  if (/[\\/]/.test(original)) return false;
  if (/[*#@$%^=]+/.test(original)) return false;
  if (/\d+\s*pages?\b/i.test(original) || /^\d+pages?$/i.test(original.replace(/\s+/g, ""))) {
    return false;
  }

  const cleaned = sanitizeQuestionNumber(original);
  if (!cleaned) return false;
  const lower = cleaned.toLowerCase();
  if (/^(upper|lower|question|questions|part)$/i.test(lower)) return false;
  if (/upperquestion|lowerquestion/i.test(lower) && !/\d/.test(lower)) return false;

  const shape = cleaned
    .replace(/[()[\]{}]/g, "")
    .replace(/upper|lower|top|bottom/gi, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
  if (!shape) return false;

  if (!/\d/.test(shape)) {
    return /^[a-z]{1,4}$/i.test(shape) || /^(i{1,3}|iv|v|vi{0,3}|ix|x)$/i.test(shape);
  }
  if (!/^\d{1,3}[a-z]{0,8}\d{0,2}[a-z]{0,4}$/i.test(shape)) return false;
  if (shape.length > 14) return false;
  const letterRun = shape.replace(/\d+/g, "");
  if (letterRun.length > 8) return false;
  return true;
}

export function dropUnusableInventedQuestions(questions) {
  if (!Array.isArray(questions)) return questions;
  return questions.filter((q) =>
    looksLikePlausibleQuestionNumber(q?.questionNumber)
  );
}

/** Clear prompt-leak / prose pasted into printedQuestionNumber (badge prefers it). */
export function clearImplausiblePrintedQuestionNumbers(questions) {
  if (!Array.isArray(questions)) return questions;
  return questions.map((q) => {
    if (!q || typeof q !== "object") return q;
    const printed = String(q.printedQuestionNumber ?? "").trim();
    if (!printed) return q;
    if (looksLikePlausibleQuestionNumber(printed)) return q;
    const next = { ...q };
    delete next.printedQuestionNumber;
    return next;
  });
}

/** Strip trailing punctuation on ids so "4a-" and "4a" share one row. */
export function normalizeQuestionNumberLabels(questions) {
  if (!Array.isArray(questions)) return questions;
  return questions.map((q) => {
    if (!q || typeof q !== "object") return q;
    let next = sanitizeQuestionNumber(q.questionNumber);
    if (next) {
      const open = (next.match(/\(/g) || []).length;
      const close = (next.match(/\)/g) || []).length;
      if (open > close) next = `${next}${")".repeat(open - close)}`;
    }
    if (!next || next === q.questionNumber) return q;
    return { ...q, questionNumber: next };
  });
}

/** Pull a full Q-label out of examiner prose ("Full marks awarded for Q42-3(a)(iii)"). */
export function extractQuestionLabelFromFeedback(text) {
  const blob = String(text ?? "");
  if (!blob.trim()) return "";
  const m = blob.match(
    /(?:Full marks awarded for|Awarded\s+\d+\s*\/\s*\d+\s+marks(?:\s+for)?|marks(?:\s+awarded)?\s+for)\s+Q\s*([0-9][0-9A-Za-z().\-]{0,24})/i
  );
  if (!m) return "";
  let label = sanitizeQuestionNumber(m[1].replace(/[.,;:]+$/g, ""));
  if (!label) return "";
  const open = (label.match(/\(/g) || []).length;
  const close = (label.match(/\)/g) || []).length;
  if (open > close) label = `${label}${")".repeat(open - close)}`;
  return looksLikePlausibleQuestionNumber(label) ? label : "";
}

/**
 * When the row id is truncated/malformed or disagrees with examiner prose,
 * prefer the label named in the feedback (Gemini often keeps the true id there).
 * Keep in sync with backend/src/utils/markingGrades.js.
 */
export function repairQuestionNumbersFromFeedback(questions) {
  if (!Array.isArray(questions)) return questions;
  return questions.map((q) => {
    if (!q || typeof q !== "object") return q;
    const fromFb = extractQuestionLabelFromFeedback(
      [q.reason, q.mistakeAdvice, q.correctAnswer].filter(Boolean).join(" ")
    );
    if (!fromFb) return q;

    const cur = String(q.questionNumber ?? "").trim();
    const curNorm = canonicalQuestionKey({ questionNumber: cur });
    const fbNorm = canonicalQuestionKey({ questionNumber: fromFb });
    if (!fbNorm) return q;

    const open = (cur.match(/\(/g) || []).length;
    const close = (cur.match(/\)/g) || []).length;
    const malformed = !cur || open !== close || /[(-]$/.test(cur);
    const fbRicher = fbNorm.length > curNorm.length;
    const fbExtends =
      curNorm &&
      fbNorm !== curNorm &&
      (fbNorm.startsWith(curNorm) ||
        curNorm.startsWith(fbNorm.slice(0, Math.max(0, curNorm.length - 1))));

    if (!(malformed || fbRicher || fbExtends)) return q;
    if (curNorm === fbNorm && !malformed) return q;

    const next = { ...q, questionNumber: fromFb };
    if (!q.msQuestionNumber) next.msQuestionNumber = fromFb;
    return next;
  });
}

/**
 * Promote orphan part ids ("a", "b", "(ii)") to full MS ids when the reason /
 * feedback already names them (e.g. "Full marks awarded for Q19b").
 * Fixes classified-workbook badges/report rows showing "Qa" / "Qb".
 */
export function repairOrphanPartQuestionNumbers(questions) {
  if (!Array.isArray(questions)) return questions;

  return questions.map((q) => {
    if (!q || typeof q !== "object") return q;
    const raw = String(q.questionNumber ?? "").trim();
    const part = raw.replace(/[()[\]\s]/g, "").toLowerCase();
    if (!part || !/^[a-zivx]{1,4}$/i.test(part)) return q;

    const blob = [
      q.msQuestionNumber,
      q.reason,
      q.correctAnswer,
      q.mistakeAdvice,
      q.studyTopic,
      ...(Array.isArray(q.missingKeywords) ? q.missingKeywords : []),
    ]
      .filter(Boolean)
      .join(" ");

    const esc = part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const withParen = new RegExp(
      String.raw`\bQ?\s*(\d{1,3})\s*[\(\.\-–—]?\s*(${esc})\b`,
      "i"
    );
    const compact = new RegExp(String.raw`\bQ\s*(\d{1,3}${esc})\b`, "i");

    let full = null;
    const m1 = blob.match(withParen);
    if (m1) full = `${m1[1]}${m1[2].toLowerCase()}`;
    if (!full) {
      const m2 = blob.match(compact);
      if (m2) full = m2[1].toLowerCase().replace(/^q/i, "");
    }
    if (!full) return q;

    const printed = String(q.printedQuestionNumber ?? "").trim();
    const next = { ...q, questionNumber: full };
    if (!printed || printed.toLowerCase().replace(/[()[\]\s]/g, "") === part) {
      next.printedQuestionNumber = full;
    }
    if (!q.msQuestionNumber) next.msQuestionNumber = full;
    return next;
  });
}

const OFF_CHUNK_FILLER_RE =
  /not[_ ]in[_ ]this[_ ]chunk|not (?:visible|present|found|printed) (?:on|in) (?:this|these) (?:page|pages|chunk|pdf)|other pages? (?:of|in) (?:the )?(?:script|paper)|will be marked (?:in|on) (?:another|a separate|other)|outside this page range|omitted because .{0,40}(?:chunk|page range)/i;

const GENERIC_BLANK_ANSWER_RE =
  /question left blank|left blank|not attempted|no (?:answer|formula|working|response)(?: was)? provided|(?:^|[-–—]\s*)n\/?a\.?$/i;

function stemFingerprint(q) {
  return String(q?.printedStem || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 96);
}

function isOffChunkFiller(q) {
  if (!q) return false;
  if (String(q.studentAnswer || "").trim().toUpperCase() === "NOT_IN_THIS_CHUNK") {
    return true;
  }
  return OFF_CHUNK_FILLER_RE.test(`${q.studentAnswer || ""} ${q.reason || ""}`);
}

function looksLikeGhostZero(q) {
  if (!q || Number(q.marksAwarded) > 0) return false;
  if (q._backfilled === true) return false;
  if (isOffChunkFiller(q)) return true;

  const ans = String(q.studentAnswer || "").trim();
  const keywords = (Array.isArray(q.markedKeywords) ? q.markedKeywords : []).filter(
    Boolean
  );
  const blankFlag = q.checklist?.answerIsBlank === true;
  const genericAns =
    !ans ||
    GENERIC_BLANK_ANSWER_RE.test(ans) ||
    /not detected during automated marking/i.test(`${ans} ${q._staffNote || ""}`);

  if (keywords.length >= 1 && ans.length >= 16 && !blankFlag) return false;
  return blankFlag || genericAns;
}

function looksLikeRealAttempt(q) {
  if (Number(q?.marksAwarded) > 0) return true;
  if (q?._backfilled === true || isOffChunkFiller(q)) return false;
  const ans = String(q?.studentAnswer || "").trim();
  const keywords = (Array.isArray(q?.markedKeywords) ? q.markedKeywords : []).filter(
    Boolean
  );
  if (q?.checklist?.answerIsBlank === true) return false;
  return keywords.length >= 1 || ans.length >= 24;
}

function pageOf(q) {
  const p = Number(q?.pageNumber);
  return Number.isFinite(p) && p >= 1 ? p : null;
}

function maxMarksOf(q) {
  return Math.max(0, Math.round(Number(q?.maxMarks) || 0));
}

function isOnDistinctPageFromReals(q, reals) {
  const p = pageOf(q);
  if (p == null) return false;
  const realPages = reals.map(pageOf).filter((x) => x != null);
  if (!realPages.length) return false;
  return !realPages.includes(p);
}

function preferQuestionEntry(a, b) {
  const rank = (q) => {
    if (Number(q?.marksAwarded) > 0) return 3;
    if (q?.checklist?.answerIsBlank !== true) return 2;
    return 1;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (rb !== ra) return rb > ra ? b : a;
  const aMarks = Number(a?.marksAwarded) || 0;
  const bMarks = Number(b?.marksAwarded) || 0;
  if (bMarks !== aMarks) return bMarks > aMarks ? b : a;
  const aText = String(a?.studentAnswer || "").trim().length;
  const bText = String(b?.studentAnswer || "").trim().length;
  if (bText !== aText) return bText > aText ? b : a;

  const labelScore = (q) => {
    const s = String(q?.questionNumber ?? "");
    if (!s) return 0;
    const open = (s.match(/\(/g) || []).length;
    const close = (s.match(/\)/g) || []).length;
    if (open !== close) return -2;
    if (/\([a-zivx]+\)/i.test(s)) return 2;
    return 1;
  };
  const la = labelScore(a);
  const lb = labelScore(b);
  if (lb !== la) return lb > la ? b : a;
  return a;
}

function shouldKeepBesideReals(q, reals) {
  if (!reals.length) return true;

  const distinctPage = isOnDistinctPageFromReals(q, reals);
  const hasScoredReal = reals.some((r) => Number(r?.marksAwarded) > 0);

  if (q?._backfilled === true) {
    if (!distinctPage) return false;
    if (!hasScoredReal) return true;
    const qm = maxMarksOf(q);
    return qm > 0 && reals.every((r) => maxMarksOf(r) !== qm);
  }

  if (looksLikeGhostZero(q)) {
    if (!distinctPage) return false;
    const qm = maxMarksOf(q);
    const distinctMax = qm > 0 && reals.every((r) => maxMarksOf(r) !== qm);
    if (!distinctMax) return false;
    // Scored read exists: only keep a clearly different classified item
    // (55.pdf Q7bi 2/2 must drop ghost 0/1 "unanswered" with no distinct stem).
    if (!hasScoredReal) return true;
    const stem = stemFingerprint(q);
    const realStems = reals.map(stemFingerprint).filter((s) => s.length >= 12);
    return stem.length >= 12 && !realStems.includes(stem);
  }

  // Scored row already present for this MS id: drop trailing-punctuation /
  // chunk twins that claim a different answer on another page without a
  // distinct stem + distinct maxMarks (the "4a-" vs blank "4a" case).
  if (hasScoredReal && Number(q?.marksAwarded) === 0) {
    if (!distinctPage) return false;
    const stem = stemFingerprint(q);
    const qm = maxMarksOf(q);
    const realStems = reals.map(stemFingerprint).filter((s) => s.length >= 12);
    const distinctStem = stem.length >= 12 && !realStems.includes(stem);
    const distinctMax = qm > 0 && reals.every((r) => maxMarksOf(r) !== qm);
    return distinctStem && distinctMax;
  }

  const stem = stemFingerprint(q);
  if (stem.length < 12) return false;
  const realStems = reals.map(stemFingerprint).filter((s) => s.length >= 12);
  return !realStems.includes(stem);
}

/** Same-page alias reals collapse; different pages stay (classified repeats). */
function collapseRealsByPage(reals) {
  if (!Array.isArray(reals) || reals.length <= 1) return reals || [];
  const byPage = new Map();
  const noPage = [];
  for (const q of reals) {
    const p = pageOf(q);
    if (p == null) {
      noPage.push(q);
      continue;
    }
    const list = byPage.get(p) || [];
    list.push(q);
    byPage.set(p, list);
  }
  const out = [];
  for (const list of byPage.values()) {
    out.push(list.reduce((a, b) => preferQuestionEntry(a, b)));
  }
  if (noPage.length) {
    out.push(noPage.reduce((a, b) => preferQuestionEntry(a, b)));
  }
  return out;
}

function collapseGhostGroup(rows) {
  if (!Array.isArray(rows) || rows.length <= 1) return rows || [];

  const reals = rows.filter(looksLikeRealAttempt);
  if (reals.length > 0) {
    const collapsedReals = collapseRealsByPage(reals);
    const extras = rows.filter(
      (q) => !looksLikeRealAttempt(q) && shouldKeepBesideReals(q, collapsedReals)
    );
    return [...collapsedReals, ...extras];
  }

  const byStem = new Map();
  const generic = [];
  for (const q of rows) {
    const stem = stemFingerprint(q);
    if (
      stem.length >= 12 &&
      !isOffChunkFiller(q) &&
      !looksLikeGhostZero(q) &&
      q?._backfilled !== true
    ) {
      const list = byStem.get(stem) || [];
      list.push(q);
      byStem.set(stem, list);
    } else {
      generic.push(q);
    }
  }

  const out = [];
  for (const list of byStem.values()) {
    out.push(list.reduce((a, b) => preferQuestionEntry(a, b)));
  }

  const backfills = generic.filter((q) => q?._backfilled === true);
  const others = generic.filter((q) => q?._backfilled !== true);
  if (others.length) {
    out.push(others.reduce((a, b) => preferQuestionEntry(a, b)));
  }
  const usedPages = new Set(out.map(pageOf).filter((p) => p != null));
  const backfillByPage = new Map();
  for (const b of backfills) {
    const p = pageOf(b);
    if (p != null && usedPages.has(p)) continue;
    const key = p == null ? "__nopage__" : p;
    if (!backfillByPage.has(key)) backfillByPage.set(key, b);
  }
  out.push(...backfillByPage.values());

  return out;
}

export function dropGhostDuplicateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length <= 1) return questions;

  const groups = new Map();
  const order = [];

  for (const q of questions) {
    const id = canonicalQuestionKey(q);
    if (!id) {
      order.push({ kind: "plain", q });
      continue;
    }
    if (!groups.has(id)) {
      groups.set(id, []);
      order.push({ kind: "group", id });
    }
    groups.get(id).push(q);
  }

  const winnersById = new Map();
  for (const [id, rows] of groups) {
    winnersById.set(id, collapseGhostGroup(rows));
  }

  const emitted = new Set();
  const out = [];
  for (const slot of order) {
    if (slot.kind === "plain") {
      out.push(slot.q);
      continue;
    }
    if (emitted.has(slot.id)) continue;
    emitted.add(slot.id);
    out.push(...(winnersById.get(slot.id) || []));
  }
  return out;
}
