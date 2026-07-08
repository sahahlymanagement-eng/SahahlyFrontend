import * as XLSX from "xlsx";

const HEADER_RE = /^(name|student|names|attendance|present|#|no\.?|s\.?no\.?|index)$/i;
const START_TIME_HEADER_RE = /^start\s*time$/i;

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
  let startDate = "";

  const toIsoDate = (value) => {
    if (value == null || value === "") return "";
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (!parsed || !parsed.y || !parsed.m || !parsed.d) return "";
      const y = String(parsed.y).padStart(4, "0");
      const m = String(parsed.m).padStart(2, "0");
      const d = String(parsed.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    const text = String(value).trim();
    if (!text) return "";
    const dt = new Date(text);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    const parts = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (!parts) return "";
    const a = Number(parts[1]);
    const b = Number(parts[2]);
    const yRaw = Number(parts[3]);
    const year = yRaw < 100 ? 2000 + yRaw : yRaw;
    const month = a > 12 ? b : a;
    const day = a > 12 ? a : b;
    if (!month || !day) return "";
    return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  };

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (!startDate) {
      for (let r = 0; r < rows.length; r++) {
        const row = Array.isArray(rows[r]) ? rows[r] : [rows[r]];
        const col = row.findIndex((cell) =>
          START_TIME_HEADER_RE.test(String(cell ?? "").trim())
        );
        if (col === -1) continue;
        for (let rr = r + 1; rr < rows.length; rr++) {
          const value = (Array.isArray(rows[rr]) ? rows[rr] : [rows[rr]])[col];
          const iso = toIsoDate(value);
          if (iso) {
            startDate = iso;
            break;
          }
        }
        if (startDate) break;
      }
    }

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

  return { names: [...names], date: startDate };
}

/** Per-student present/absent from parsed Excel names (editable before send). */
export function buildInitialAttendanceMap(students, attendedNames, getStudentKey) {
  const map = {};
  for (const student of students || []) {
    const key = String(getStudentKey(student));
    const name = student.name || student.email || "";
    map[key] = isStudentAttended(name, attendedNames);
  }
  return map;
}

/** Names marked present in the editable map (for report API payload). */
export function attendedNamesFromMap(students, attendanceMap, getStudentKey) {
  return (students || [])
    .filter((s) => attendanceMap[String(getStudentKey(s))] === true)
    .map((s) => s.name)
    .filter(Boolean);
}

export function countPresentInMap(attendanceMap) {
  return Object.values(attendanceMap || {}).filter(Boolean).length;
}
