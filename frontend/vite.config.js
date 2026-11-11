import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds into ../public, which the Express server serves with an SPA fallback.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../public",
    emptyOutDir: true,
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:5000" },
  },
});
