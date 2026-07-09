/**
 * Browser file picker MIME types are unreliable on Windows (often "" or octet-stream).
 */
export function isPdfFile(file) {
  if (!file) return false;

  const name = String(file.name || "").toLowerCase();
  const type = String(file.type || "").toLowerCase();

  if (name.endsWith(".pdf")) return true;
  if (type === "application/pdf") return true;
  if (type === "application/x-pdf") return true;
  if (type === "application/octet-stream" && name.endsWith(".pdf")) return true;

  return false;
}
