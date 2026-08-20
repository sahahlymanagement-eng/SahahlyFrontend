/**
 * Collapse phantom 0-mark copies after page-chunked marking.
 * Keep in sync with backend/src/utils/markingGrades.js dropGhostDuplicateQuestions.
 */

export function canonicalQuestionKey(q) {
  let s = String(q?.questionNumber ?? "")
    .trim()
    .replace(/^(upper|lower|top|bottom)\s+/i, "")
    .replace(/^questions?\s+/i, "")
    .replace(/^q(?=[\d(])/i, "")
    .replace(/^part\s+/i, "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (s.startsWith("q") && s.length > 1) s = s.slice(1);
  return s;
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
