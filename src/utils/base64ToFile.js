/**
 * Convert a base64 string (optionally a data: URI) into a File.
 * Used to turn the base64 PDFs returned by /external-grading/submissions/:id/pdfs
 * into File objects for the marking FormData.
 */
export function base64ToFile(base64, name = "file.pdf", type = "application/pdf") {
  if (!base64 || typeof base64 !== "string") {
    throw new Error(`${name}: missing base64 data`);
  }

  // Strip an optional "data:application/pdf;base64," prefix.
  const commaIdx = base64.indexOf(",");
  const cleaned = base64.startsWith("data:") && commaIdx !== -1
    ? base64.slice(commaIdx + 1)
    : base64;

  const binary = atob(cleaned.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return new File([bytes], name, { type });
}
