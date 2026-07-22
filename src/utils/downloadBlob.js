// Triggers a browser download for a Blob. The anchor must be attached to the
// DOM and the object URL must outlive the click for mobile browsers (iOS
// Safari, Android Chrome) to actually start the download instead of no-op-ing.
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
