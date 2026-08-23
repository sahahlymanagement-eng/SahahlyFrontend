import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sahahlyLanding } from "./vite-plugin-landing.js";
import { copyPdfWorker } from "./vite-plugin-pdf-worker.js";

export default defineConfig({
  plugins: [copyPdfWorker(), sahahlyLanding(), react()],
  resolve: {
    dedupe: ["react", "react-dom"]
  }
});
