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
        agents: resolve(__dirname, "agents.html"),
        "agent-chat": resolve(__dirname, "agent-chat.html"),
      },
    },
  },
});
