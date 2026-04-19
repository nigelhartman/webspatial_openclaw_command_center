import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      // Forward WebSocket connections to OpenClaw through Vite so the Pico
      // only needs to reach the Vite port (5173) — no separate ADB reverse needed.
      '/openclaw-ws': {
        target: 'ws://localhost:18789',
        ws: true,
        // Prevent x-forwarded-* headers so isLocalDirectRequest stays true
        xfwd: false,
        // OpenClaw WS server expects connections at /, not /openclaw-ws
        rewrite: (path) => path.replace(/^\/openclaw-ws/, '') || '/',
        // Gateway checks Origin against allowedOrigins — spoof it to the allowed value
        headers: { origin: 'http://localhost:18789' },
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        "agent-chat": resolve(__dirname, "agent-chat.html"),
        webview: resolve(__dirname, "webview.html"),
      },
    },
  },
});
