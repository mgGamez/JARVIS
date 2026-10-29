# JARVIS

A personal AI workspace with a black, cyan and purple HUD, animated reactor, chat, browser voice controls, and user-approved memory. Built with Node.js and vanilla JavaScript, CSS and HTML. No application packages, build step, external fonts, or paid UI services are required.

## Run

Requires **Node.js 24.5 or later** (tested with 24.19).

```sh
cd /workspace/JARVIS
cp .env.example .env  # first setup only; do not overwrite an existing .env
# Edit .env locally: add your own GEMINI_API_KEY.
npm start
```

Open `http://localhost:3000` on the machine running the server. `npm run dev` restarts the server when files change. The interface works without a key, but chat correctly reports setup required. A key already injected into the server environment does not require an `.env` file. Do not paste a key in the interface or commit `.env`.

Obtain a Gemini key through Google AI Studio. Free-tier availability, quotas, region restrictions, and Google's data policies vary; this project does not promise free API access. Default model: `gemini-2.5-flash`. Override `GEMINI_MODEL` if your project requires another supported text model. Provider requests use Node's environment proxy support and retain TLS verification.

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | unset | Server-only Google credential |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model identifier |
| `HOST` | `127.0.0.1` | Bind address |
| `PORT` | `3000` | HTTP port |

## Android and voice

Use a current Android browser or desktop browser. Chat, history and memory use standard browser APIs. For access from a phone, run behind a **trusted, authenticated HTTPS reverse proxy**. A phone's localhost refers to the phone, not your computer. Set `HOST=0.0.0.0` only on a trusted network or behind that proxy. Preserve the public Host header when proxying; cross-origin API requests are rejected.

Voice input uses `SpeechRecognition` / `webkitSpeechRecognition` when available, and requires HTTPS or localhost, microphone permission, and often the browser vendor's online speech service. Tap the microphone to dictate, review the transcript, then send. Recognition does not automatically submit. Denied permissions, missing microphones, service errors and unsupported browsers produce explicit messages. There is no always-on listening or wake word.

Spoken responses use `speechSynthesis`. Enable the speaker toggle, choose a voice and speed in Settings, or use “Read aloud” on an answer. Playback may require user interaction, and voices differ by device. Settings includes Test voice and Stop speaking; Escape also stops playback. No Android apps, alarms or system functions are controlled. Mobile viewport tests do not establish real-device microphone support.

## History, memory and privacy

- Conversations, approved memories and preferences use this origin's browser `localStorage`. They do not sync across devices and are not encrypted. Private mode, cleared site data or storage limits may prevent persistence; failures are reported.
- The Memory panel requires an explicit **Approve & save memory** action. “Save a memory” on a message only fills that form; it does not approve automatically. Up to 30 facts, 500 characters each. Delete any fact individually. No automatic extraction or secret collection.
- Each chat request sends up to 40 recent successful-context messages and the currently approved memories to the backend, then Google. Failed user turns remain in local history but are omitted from future model context. Older conversation turns are not sent. Per-message limit: 12,000 characters; total submitted context: 60,000 characters. Long requests produce a validation error; start a new conversation if needed.
- Delete a conversation from the sidebar or clear all history. Clearing conversations preserves memory; delete memories separately. Browser speech recognition can send audio to its vendor. Review Google's and your browser's privacy terms before using sensitive data.
- The server does not persist or log conversation content. Gemini credentials are sent in a server-to-provider header, never in browser assets or URL parameters. Model text is rendered as text, not executable HTML.

## Capabilities and extension points

`server/ai.js` validates context, builds the Gemini request, and translates provider errors without leaking upstream details. `server/tools.js` is a capability registry with status and approval metadata. Memory is implemented as a local user action. Web search, product research, reminders, and automation are **planned**, not callable tools. There is no simulated telemetry or fake AI fallback.

To add tools, implement a server-owned handler, strict argument validation, appropriate credentials and allowed destinations, then expose only registered handlers to the model. Side effects need explicit confirmation and auditable results. Persisted reminders require a scheduler and notifications; browser code alone cannot control device alarms. No model-driven tool execution is implemented in this version.

## Checks

```sh
npm run check
npm test
```

The 10 automated Node tests cover HTTP assets, secret isolation, missing keys, approved context forwarding, untrusted input, cross-origin rejection, and Gemini error handling. Provider responses are injected test fixtures, not live Gemini calls.

Optional real browser smoke test (Python + Playwright and Chromium):

```sh
python3 -m pip install playwright
# If Chromium is not installed: python3 -m playwright install chromium
# With npm start already running, without a Gemini key:
python3 test/browser.py
```

The browser test expects an unconfigured server. It checks desktop/mobile layouts, chat error reporting, a test-intercepted success response, safe text rendering, history persistence/deletion, memory approval/forwarding/deletion, Settings, and capabilities. Screenshots are saved to `/tmp/jarvis-desktop.png` and `/tmp/jarvis-mobile.png`. Set `JARVIS_TEST_URL` to override the local test endpoint. No real Gemini response or physical microphone/audio output was verified during initial implementation because no key or physical device was available.

## Deployment boundaries

This is a single-user local application, not an authenticated public service. Keep the default loopback binding. Before public deployment, add authentication, per-user storage isolation, persistent rate limiting and a trusted HTTPS proxy. The backend rejects cross-site browser requests, caps request size, limits concurrent provider calls, and serves an explicit asset allowlist; those measures do not replace access control. Services must be restarted after restoring a cloud snapshot.

## Project layout

```text
public/          Responsive UI, voice, local history and memory
server/ai.js     Gemini adapter and input validation
server/index.js HTTP API and static server
server/tools.js Capability registry for future extensions
test/           Node integration tests and optional browser smoke test
.env.example    Server configuration template (no credentials)
```
