import * as XLSX from "xlsx";

const HEADER_RE = /^(name|student|names|attendance|present|#|no\.?|s\.?no\.?|index)$/i;

export function normalizeAttendanceName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function isStudentAttended(studentName, attendedNames) {
  const normalized = normalizeAttendanceName(studentName);
  if (!normalized || !attendedNames?.length) return false;

  const set = new Set(attendedNames.map(normalizeAttendanceName).filter(Boolean));
  if (set.has(normalized)) return true;

  for (const attended of set) {
    if (
      attended === normalized ||
      normalized.includes(attended) ||
      attended.includes(normalized)
    ) {
      return true;
    }
  }

  return false;
}

function cellLooksLikeName(value) {
  const text = String(value ?? "").trim();
  if (!text || text.length < 2) return false;
  if (HEADER_RE.test(text)) return false;
  if (/^\d+([.,]\d+)?$/.test(text)) return false;
  return true;
}

export async function parseAttendanceNamesFromFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const names = new Set();

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    rows.forEach((row, rowIndex) => {
      const cells = Array.isArray(row) ? row : [row];
      const firstCell = cells[0];

      if (cellLooksLikeName(firstCell)) {
        names.add(String(firstCell).trim());
        return;
      }

      if (rowIndex === 0) return;

      cells.forEach((cell) => {
        if (cellLooksLikeName(cell)) {
          names.add(String(cell).trim());
        }
      });
    });
  }

  return [...names];
}
