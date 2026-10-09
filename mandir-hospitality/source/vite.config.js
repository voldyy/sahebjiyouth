import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  base: command === "build" || isPreview ? "/mandir-hospitality/" : "/",
  build: {
    // Embed the two small variable fonts so the static release is portable.
    assetsInlineLimit: (filePath) => filePath.endsWith(".woff2"),
  },
}));
