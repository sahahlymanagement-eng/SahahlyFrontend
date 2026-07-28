/**
 * Display helpers when page-local labels differ from mark-scheme question ids.
 */

function normalizeLabel(value) {
  return String(value ?? "")
    .trim()
    .replace(/^question\s*/i, "")
    .replace(/^Q/i, "")
    .replace(/\(([a-zivx]+)\)/gi, "$1")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function combinePrintedQuestionAndPart(printedQuestion, partLabel) {
  const base = normalizeLabel(printedQuestion);
  if (!base) return "";

  const part = String(partLabel ?? "")
    .trim()
    .replace(/^\(/, "")
    .replace(/\)$/, "")
    .replace(/^part\s*/i, "");
  if (!part) return base;

  const partNorm = normalizeLabel(part);
  if (!partNorm) return base;
  if (/^\d+[a-zivx]*$/i.test(base) && /^[a-zivx]+$/i.test(partNorm)) {
    const m = base.match(/^(\d+)([a-zivx]*)$/i);
    if (m && !m[2]) return `${m[1]}${partNorm}`;
  }
  return partNorm.length <= 3 && /^\d/.test(base) ? `${base}${partNorm}` : base;
}

function extractMsReference(raw) {
  const s = String(raw ?? "").trim();
  if (!s || /^-+$/i.test(s) || /not\s+available|n\/a/i.test(s)) return "";

  let m = s.match(/^Q?\s*(\d+[a-zivx]*)\s*$/i);
  if (m) return normalizeLabel(m[1]);

  m = s.match(/Q?\s*(\d+)\s*[-_ ]?\(?\s*([a-zivx]+)\s*\)?/i);
  if (m) return normalizeLabel(`${m[1]}${m[2] || ""}`);

  return normalizeLabel(s);
}

function parseMsToPrintedMapFromGuidance(guidance) {
  const byPage = new Map();
  const global = new Map();
  if (!guidance || typeof guidance !== "string") return { byPage, global };

  for (const line of guidance.split(/\r?\n/)) {
    if (!line.includes("|")) continue;
    const cols = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cols.length < 3) continue;
    if (/^\|?[\s\-:|]+\|?$/.test(line.trim())) continue;
    if (/item\s*id|pdf\s*page|maximum\s*mark|sequence\s*table|ms\s*reference/i.test(cols[0])) {
      continue;
    }

    const pageNum = Number.parseInt(cols[1], 10);
    const pageNumber =
      Number.isFinite(pageNum) && pageNum >= 1 && pageNum <= 200 ? pageNum : null;
    const printedLabel = combinePrintedQuestionAndPart(cols[2], cols[3]);
    const msRefCol = cols.length > 6 ? cols[6] : cols.length > 5 ? cols[5] : "";
    let msRef = extractMsReference(msRefCol);
    if (!msRef && cols[0]) msRef = extractMsReference(cols[0]);

    const printed = normalizeLabel(printedLabel);
    const ms = normalizeLabel(msRef);
    if (!printed || !ms || printed === ms) continue;

    if (pageNumber) byPage.set(`${pageNumber}::${ms}`, printed);
    if (!global.has(ms)) global.set(ms, printed);
  }

  return { byPage, global };
}

function lookupPrintedLabel(msMaps, msRef, pageNumber) {
  const ms = normalizeLabel(msRef);
  if (!ms) return "";
  if (pageNumber) {
    const pageHit = msMaps.byPage.get(`${pageNumber}::${ms}`);
    if (pageHit) return pageHit;
  }
  return msMaps.global.get(ms) || "";
}

export function resolvePrintedQuestionNumber(question, guidance) {
  const existing = String(question?.printedQuestionNumber ?? "").trim();
  if (existing) return existing;

  const page = Math.max(1, Number(question?.pageNumber) || 1);
  const msRef = question?.msQuestionNumber || question?.questionNumber;
  if (!guidance || !msRef) return "";

  const msMaps = parseMsToPrintedMapFromGuidance(guidance);
  return lookupPrintedLabel(msMaps, msRef, page);
}

export function buildDuplicateQuestionNumberSet(questions) {
  const counts = new Map();
  for (const q of questions || []) {
    const n = String(q?.questionNumber ?? "").trim();
    if (!n) continue;
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  return new Set(
    [...counts.entries()].filter(([, c]) => c > 1).map(([n]) => n)
  );
}

export function formatQuestionLabelWithPage(question, guidance, duplicateNumbers) {
  const display = getDisplayQuestionNumber(question, guidance);
  const ms = String(question?.questionNumber ?? "").trim();
  if (duplicateNumbers?.has(ms)) {
    const page = Math.max(1, Number(question?.pageNumber) || 1);
    return `${display} · p${page}`;
  }
  return display;
}

export function getDisplayQuestionNumber(question, guidance) {
  const printed =
    resolvePrintedQuestionNumber(question, guidance) ||
    String(question?.printedQuestionNumber ?? "").trim();
  const ms = String(question?.questionNumber ?? "").trim();

  if (printed && ms && normalizeLabel(printed) !== normalizeLabel(ms)) {
    return printed;
  }
  return ms || printed || "?";
}

export function hasPrintedLabelMismatch(question, guidance) {
  const ms = normalizeLabel(question?.questionNumber);
  const printed = normalizeLabel(
    resolvePrintedQuestionNumber(question, guidance) || question?.printedQuestionNumber
  );
  return Boolean(printed && ms && printed !== ms);
}

export function formatMsLabelHint(question, guidance) {
  if (!hasPrintedLabelMismatch(question, guidance)) return null;
  const ms = question?.msQuestionNumber || question?.questionNumber;
  return `Mark scheme: Q${ms}`;
}

/** @deprecated use formatMsLabelHint */
export function formatPrintedLabelHint(question) {
  if (!hasPrintedLabelMismatch(question)) return null;
  return `Page label: Q${question.printedQuestionNumber}`;
}
