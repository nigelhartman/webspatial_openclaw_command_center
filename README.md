# WebSpatial OpenClaw Command Center

A starter kit for building spatial AI agent interfaces on top of [OpenClaw](https://github.com/openclaw/openclaw) using the [WebSpatial SDK](https://github.com/webspatial/webspatial-sdk). Run it in the Pico emulator to get a floating agent list and per-agent chat panels with voice input.

https://github.com/user-attachments/assets/c1d86263-72b5-4244-b13a-502e13b0f192

---

## What this project does

- **Agents panel** — lists all agents configured in your OpenClaw gateway; each button toggles a spatial chat panel open/closed
- **Chat panel** — per-agent floating window with full conversation history, streaming responses, and voice input via ElevenLabs STT
- **Device identity** — authenticates to the OpenClaw gateway with Ed25519 device keys generated in the browser (no manual pairing required after the first approval)
- **Voice input** — tap to record, auto-transcribed and sent to the agent

---

## Prerequisites

- [Node.js](https://nodejs.org/) 22+
- [Docker](https://www.docker.com/) (for running the OpenClaw gateway)
- Pico Emulator 0.11.1 (see below)

---

## 1. Set up OpenClaw

This project connects to a local OpenClaw gateway over WebSocket. No changes are made to the OpenClaw codebase — you just need it running.

### Clone and build

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
```

This project was built and tested against **v2026.4.19-beta.2**. To build that exact image locally from the cloned repo:

```bash
./scripts/docker/setup.sh
```

Or to use a pre-built image instead:

```bash
export OPENCLAW_IMAGE="ghcr.io/openclaw/openclaw:latest"
./scripts/docker/setup.sh
```

Follow the prompts — the setup script will ask you to configure your AI provider (e.g. Anthropic API key), a gateway token, and other settings.

### Start the gateway

```bash
docker compose up
```

The gateway runs on `localhost:18789` by default.

### Find your gateway token

After setup, your token is in `~/.openclaw/openclaw.json` under `gateway.auth.token`. Copy it — you'll need it in the next step.

---

## 2. Set up the Command Center

### Clone

```bash
git clone <this-repo-url>
cd webspatial_openclaw_command_center
```

### Configure environment

Create a `.env` file in the project root:

```env
VITE_OPENCLAW_TOKEN=<your-gateway-token>
VITE_ELEVENLABS_API_KEY=<your-elevenlabs-api-key>
```

- **VITE_OPENCLAW_TOKEN** — the token from your OpenClaw gateway config
- **VITE_ELEVENLABS_API_KEY** — from [ElevenLabs](https://elevenlabs.io/) (needed for voice transcription; the app works without it but the voice button will error)

### Install and run

```bash
npm install
npm run dev
```

Vite starts on `http://localhost:5173`. The dev server proxies WebSocket connections to the OpenClaw gateway so the emulator only needs to reach port 5173 — no separate port forwarding for the gateway itself.

---

## 3. Run in the Pico emulator

The app runs in the **Pico Emulator** — a desktop app that simulates the Pico XR browser environment. A physical Pico headset is not required.

Download **Pico Emulator 0.11.1** (required for the latest WebSpatial capabilities):

| Platform | Link |
|----------|------|
| macOS    | [Download](https://drive.google.com/file/d/1GmP4V7hX8oAlhviD__cNRx753HXHMihj/view?usp=sharing) |
| Windows  | [Download](https://drive.google.com/file/d/1Sc1M-nYLfVsHznIDf5tXxHFTldZruJ2B/view?usp=sharing) |
| Linux    | [Download](https://drive.google.com/file/d/1FPBAr3h5PssTPpaSEz-tJ5CeWgulTtmQ/view?usp=sharing) |

### ADB reverse (required)

The app must be accessed via `localhost` on the emulator. This enables the browser's `crypto.subtle` API (needed for device identity) and routes WebSocket traffic through the Vite proxy.

With the emulator running, set up ADB reverse port forwarding:

```bash
adb reverse tcp:5173 tcp:5173
```

Then open `http://localhost:5173` inside the emulator's browser.

### Approve the device on first connect

The first time you connect, the gateway will reject with `PAIRING_REQUIRED` and return a `requestId`. Approve it from the OpenClaw CLI (run this from the `openclaw` directory):

```bash
docker compose run --rm openclaw-cli devices approve <requestId>
```

After approval, reload the app. The device key is stored in `localStorage` and reused automatically on subsequent connections — you won't need to pair again unless you clear browser storage.

---

## Project structure

```
src/
  lib/
    openclaw.ts       # WebSocket client: Ed25519 device identity + streaming
    useVoice.ts       # ElevenLabs STT hook (tap-to-toggle recording)
  AgentsPanel.tsx     # Spatial panel: agent list with open/close toggle buttons
  AgentChatPanel.tsx  # Spatial panel: per-agent chat with voice input
  agents-main.tsx     # Entry point for agents panel
  agent-chat-main.tsx # Entry point for chat panel
index.html            # Main entry (renders agents panel directly)
agent-chat.html       # Chat panel entry point
vite.config.ts        # Multi-page build + WebSocket proxy to OpenClaw
.env                  # Your tokens (not committed)
```

---

## How it works

1. **App opens** → agents panel spawns as a WebSpatial scene
2. **Tap an agent button** → a new independent spatial window opens for that agent's chat
3. **Chat panel** → loads conversation history, then streams responses in real time
4. **Voice** → tap the mic button to record; audio is transcribed via ElevenLabs STT and sent to the agent
5. **Multiple agents** → each chat runs in its own window simultaneously; button borders show green (open) / closed (red)

### Authentication

The browser generates an Ed25519 key pair on first use (stored in `localStorage`). On each WebSocket connection the gateway sends a `connect.challenge` nonce, the client signs a payload with the private key, and includes it with the connect request. After the first manual `devices approve`, all subsequent connections authenticate automatically.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| `WebSocket error` | Gateway not running | Start OpenClaw with `docker compose up` |
| `origin not allowed` | Connecting from host IP instead of localhost | Set up ADB reverse; use `localhost:5173` |
| `PAIRING_REQUIRED` | New device not yet approved | Run `docker compose run --rm openclaw-cli devices approve <id>` |
| `Device authentication requires a secure context` | Accessing via host IP | Set up ADB reverse; use `localhost:5173` |
| Voice button does nothing | Microphone permission denied | Allow microphone access when prompted in the emulator |
| Agents list shows error | Wrong or missing token | Check `VITE_OPENCLAW_TOKEN` in `.env` |
| Chat shows `…` after long wait | Session key mismatch (old version) | Pull latest from this repo |

---

## Tech stack

- [React 19](https://react.dev/) + TypeScript
- [WebSpatial SDK](https://github.com/webspatial/webspatial-sdk) `@webspatial/react-sdk` 1.5.x
- [Vite 8](https://vite.dev/) — multi-page build + WebSocket proxy
- [ElevenLabs STT](https://elevenlabs.io/docs/api-reference/speech-to-text) `scribe_v1`
- [OpenClaw](https://github.com/openclaw/openclaw) gateway WebSocket protocol (tested on v2026.4.19-beta.2)
