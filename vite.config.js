import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sahahlyLanding } from "./vite-plugin-landing.js";
import { copyPdfWorker } from "./vite-plugin-pdf-worker.js";

export default defineConfig({
  plugins: [copyPdfWorker(), sahahlyLanding(), react()],
  server: { proxy: {
    "/api/drpeter-indexing": { target: process.env.DR_PETER_INDEXING_API_TARGET || "http://localhost:6001", changeOrigin: true, timeout: 900000, proxyTimeout: 900000 },
    "/api/mariamgabalawy-indexing": { target: process.env.DR_PETER_INDEXING_API_TARGET || "http://localhost:6001", changeOrigin: true, timeout: 900000, proxyTimeout: 900000 },
    "/api/classroom-indexing": { target: process.env.DR_PETER_INDEXING_API_TARGET || "http://localhost:6001", changeOrigin: true, timeout: 900000, proxyTimeout: 900000 },
  } },
  build: { rollupOptions: { input: { main: "index.html", indexing: "drpeter-indexing/index.html" } } },
  resolve: {
    dedupe: ["react", "react-dom"]
  }
});
