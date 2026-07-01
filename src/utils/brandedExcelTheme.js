/** Sahahly executive Excel palette (matches PDF reports). */
export const BRAND_NAVY = "FF0F2854";
export const BRAND_BLUE = "FF2563EB";
export const BRAND_LIGHT = "FF1E4078";
export const BG_SOFT = "FFF8FAFC";
export const TEXT_DARK = "FF1E293B";
export const TEXT_MUTED = "FF64748B";
export const WHITE = "FFFFFFFF";
export const GREEN = "FF16A34A";
export const GREEN_BG = "FFDCFCE7";
export const ORANGE = "FFEA580C";
export const ORANGE_BG = "FFFFEDD5";
export const RED = "FFDC2626";
export const RED_BG = "FFFEE2E2";
export const AMBER_BG = "FFFEF3C7";

const STATUS_FILLS = {
  "On Time": GREEN_BG,
  Late: ORANGE_BG,
  Submitted: AMBER_BG,
  "Didn't Submit": RED_BG,
  "didn't submit": RED_BG,
};

const STATUS_FONTS = {
  "On Time": GREEN,
  Late: ORANGE,
  Submitted: "FFB45309",
  "Didn't Submit": RED,
  "didn't submit": RED,
};

export function applyTitleRow(cell, value) {
  cell.value = value;
  cell.font = { name: "Calibri", size: 16, bold: true, color: { argb: WHITE } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_NAVY } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
}

export function applyMetaLabel(cell, value) {
  cell.value = value;
  cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: BRAND_LIGHT } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_SOFT } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
}

export function applyMetaValue(cell, value) {
  cell.value = value;
  cell.font = { name: "Calibri", size: 10, color: { argb: TEXT_DARK } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BG_SOFT } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

export function applyKpiCell(cell, label, value, fillArgb = "FFEFF6FF") {
  cell.value = `${label}: ${value}`;
  cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: BRAND_NAVY } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
}

export function applyTableHeader(cell, value) {
  cell.value = value;
  cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: WHITE } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND_BLUE } };
  cell.alignment = { vertical: "middle", horizontal: "center" };
  cell.border = {
    top: { style: "thin", color: { argb: BRAND_NAVY } },
    bottom: { style: "thin", color: { argb: BRAND_NAVY } },
    left: { style: "thin", color: { argb: BRAND_NAVY } },
    right: { style: "thin", color: { argb: BRAND_NAVY } },
  };
}

export function applyDataCell(cell, value, { status, zebra } = {}) {
  cell.value = value;
  cell.font = {
    name: "Calibri",
    size: 10,
    color: { argb: status ? STATUS_FONTS[status] || TEXT_DARK : TEXT_DARK },
    bold: Boolean(status),
  };
  const fillArgb = status
    ? STATUS_FILLS[status] || (zebra ? BG_SOFT : WHITE)
    : zebra
      ? BG_SOFT
      : WHITE;
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };
  cell.alignment = {
    vertical: "middle",
    horizontal: status ? "center" : "left",
    indent: status ? 0 : 1,
  };
  cell.border = {
    top: { style: "thin", color: { argb: "FFE2E8F0" } },
    bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
    left: { style: "thin", color: { argb: "FFE2E8F0" } },
    right: { style: "thin", color: { argb: "FFE2E8F0" } },
  };
}

export function applyFooter(cell, value) {
  cell.value = value;
  cell.font = { name: "Calibri", size: 9, italic: true, color: { argb: TEXT_MUTED } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
}

export function initBrandedWorkbook(workbook, sheetName) {
  workbook.creator = "Sahahly";
  workbook.company = "Sahahly Academic Workflow";
  workbook.created = new Date();
  return workbook.addWorksheet(sheetName, {
    views: [{ state: "frozen", ySplit: 7 }],
    properties: { defaultRowHeight: 18 },
  });
}
