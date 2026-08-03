/**
 * pdfjs-dist >= 5.4 calls Uint8Array.prototype.toHex() when fingerprinting PDFs.
 * That method only exists in Chromium ~140+ / very new Edge. Older browsers crash
 * with "n.toHex is not a function" and blank PDF previews.
 */
export function installUint8ArrayToHexPolyfill() {
  const proto = Uint8Array?.prototype;
  if (!proto || typeof proto.toHex === "function") return;

  Object.defineProperty(proto, "toHex", {
    configurable: true,
    writable: true,
    value() {
      const len = this.length;
      const hex = new Array(len);
      for (let i = 0; i < len; i++) {
        hex[i] = this[i].toString(16).padStart(2, "0");
      }
      return hex.join("");
    },
  });
}

installUint8ArrayToHexPolyfill();
