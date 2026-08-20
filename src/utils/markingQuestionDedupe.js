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
    const next = sanitizeQuestionNumber(q.questionNumber);
    if (!next || next === q.questionNumber) return q;
    return { ...q, questionNumber: next };
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
  return bText > aText ? b : a;
}

function shouldKeepBesideReals(q, reals) {
  if (!reals.length) return true;

  const distinctPage = isOnDistinctPageFromReals(q, reals);

  if (q?._backfilled === true) {
    return distinctPage;
  }

  if (looksLikeGhostZero(q)) {
    if (!distinctPage) return false;
    const qm = maxMarksOf(q);
    return qm > 0 && reals.every((r) => maxMarksOf(r) !== qm);
  }

  // Scored row already present for this MS id: drop trailing-punctuation /
  // chunk twins that claim a different answer on another page without a
  // distinct stem + distinct maxMarks (the "4a-" vs blank "4a" case).
  if (reals.some((r) => Number(r?.marksAwarded) > 0) && Number(q?.marksAwarded) === 0) {
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

function collapseGhostGroup(rows) {
  if (!Array.isArray(rows) || rows.length <= 1) return rows || [];

  const reals = rows.filter(looksLikeRealAttempt);
  if (reals.length > 0) {
    const extras = rows.filter(
      (q) => !looksLikeRealAttempt(q) && shouldKeepBesideReals(q, reals)
    );
    return [...reals, ...extras];
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
