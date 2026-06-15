import api from "../api/api";

/**
 * Compress an annotated PDF via backend Ghostscript (best-effort).
 * Returns original bytes if compression is unavailable or fails.
 */
export async function compressAnnotatedPdf(pdfBytes) {
  try {
    const fd = new FormData();
    fd.append("pdf", new Blob([pdfBytes], { type: "application/pdf" }), "annotated.pdf");

    const res = await api.post("/pdf-annotation/compress", fd, {
      headers: { "Content-Type": "multipart/form-data" },
      responseType: "arraybuffer",
      timeout: 180000,
    });

    if (!res.data?.byteLength) return pdfBytes;
    return new Uint8Array(res.data);
  } catch (err) {
    console.warn(
      "[compressAnnotatedPdf]",
      err.response?.data?.message || err.message
    );
    return pdfBytes;
  }
}
