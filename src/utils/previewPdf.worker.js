import { annotatePdfCore } from "./annotatePdf";

self.onmessage = async ({ data }) => {
  try {
    const bytes = await annotatePdfCore({ ...data, skipCompress: true, dedicatedWorker: true });
    self.postMessage({ bytes, reportPageCount: Number(bytes.reportPageCount) || 0 }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({ error: error?.message || "Unable to build PDF preview" });
  }
};
