import api from "../api/api";

/**
 * A4-normalize + Ghostscript-compress a student PDF on the server (same path
 * as indexing marking). Returns null if the call fails so callers can fall back.
 */
export async function prepareStudentPdfViaApi(pdfBytes, filename = "student.pdf") {
  const fd = new FormData();
  fd.append(
    "pdf",
    new Blob([pdfBytes], { type: "application/pdf" }),
    filename || "student.pdf"
  );

  const res = await api.post("/pdf-annotation/prepare-student", fd, {
    headers: { "Content-Type": "multipart/form-data" },
    responseType: "arraybuffer",
    timeout: 180000,
  });

  if (!res.data?.byteLength) return null;
  return new Uint8Array(res.data);
}
