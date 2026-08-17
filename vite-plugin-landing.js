import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LANDING = path.resolve(__dirname, "public/marketing/index.html");

function isHome(url) {
  const pathname = String(url || "").split("?")[0];
  return pathname === "/" || pathname === "";
}

function sendLanding(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  if (!isHome(req.url)) return next();
  if (!fs.existsSync(LANDING)) return next();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  fs.createReadStream(LANDING).pipe(res);
}

/**
 * Serve the marketing landing page at `/` in `vite` and `vite preview`
 * so sahahly.com can be tested locally before a production nginx alias.
 * App routes such as `/login` still use the React SPA.
 */
export function sahahlyLanding() {
  return {
    name: "sahahly-landing",
    configureServer(server) {
      server.middlewares.use(sendLanding);
    },
    configurePreviewServer(server) {
      server.middlewares.use(sendLanding);
    },
  };
}
