/**
 * Student-facing mark-point label for annotated PDFs.
 * Keeps minted award ids (7b-mp1) out of the PDF; shows scheme labels (MP, B1, …).
 */

function isMintedAwardCode(code) {
  return /^[A-Za-z0-9._()-]+-mp\d+$/i.test(String(code || "").trim());
}

/**
 * @param {string|object} codeOrPoint
 * @param {Array} [packPoints]
 */
export function annotationMarkPointLabel(codeOrPoint, packPoints = []) {
  if (codeOrPoint != null && typeof codeOrPoint === "object") {
    const scheme = String(codeOrPoint.schemeCode || "").trim();
    if (scheme) return scheme;
    return annotationMarkPointLabel(codeOrPoint.code, packPoints);
  }

  const code = String(codeOrPoint || "").trim();
  if (!code) return "MP";

  const pack = (Array.isArray(packPoints) ? packPoints : []).find(
    (p) => String(p?.code || "").trim() === code
  );
  if (pack) {
    const scheme = String(pack.schemeCode || "").trim();
    if (scheme) return scheme;
    if (!isMintedAwardCode(pack.code)) {
      const packCode = String(pack.code || "").trim();
      if (packCode) return packCode;
    }
  }

  if (isMintedAwardCode(code)) return "MP";
  return code;
}
