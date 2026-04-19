import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { host: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        "panel-a": resolve(__dirname, "panel-a.html"),
        "panel-b": resolve(__dirname, "panel-b.html"),
      },
    },
  },
});
