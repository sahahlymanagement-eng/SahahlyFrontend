import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sahahlyLanding } from "./vite-plugin-landing.js";

export default defineConfig({
  plugins: [sahahlyLanding(), react()],
  resolve: {
    dedupe: ["react", "react-dom"]
  }
});
