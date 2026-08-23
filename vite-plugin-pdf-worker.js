import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Copy pdf.js's legacy worker into `public/` as a plain `.js` file.
 *
 * Hashed `/assets/*.mjs` workers fail on many SPA hosts (nginx falls back to
 * index.html, or serves .mjs with the wrong MIME). A stable `/pdf.worker.min.js`
 * is always served as JavaScript.
 */
export function copyPdfWorker() {
  const copy = () => {
    const pkg = dirname(require.resolve("pdfjs-dist/package.json"));
    const src = join(pkg, "legacy/build/pdf.worker.min.mjs");
    const dest = join(process.cwd(), "public/pdf.worker.min.js");
    if (!existsSync(src)) {
      throw new Error(`pdf.js worker not found at ${src}`);
    }
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  };

  return {
    name: "copy-pdf-worker",
    buildStart() {
      copy();
    },
    configureServer() {
      // Dev server also needs the file under public/ before the first request.
      copy();
    },
  };
}
