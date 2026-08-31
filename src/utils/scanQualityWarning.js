export function scanQualityWarningText(scanQuality) {
  if (!scanQuality?.flagged) return null;
  return (
    scanQuality.message ||
    (scanQuality.scanner
      ? `Low scan quality — ${scanQuality.scanner} watermark detected`
      : "Low scan quality — scan-app watermark detected")
  );
}
