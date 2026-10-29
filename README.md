# JARVIS 3

A personal AI assistant with an animated reactor interface, responsive black/cyan/purple HUD, Gemini chat, grounded web research, image generation, code analysis, browser voice, approved memory, reminders, Gmail and opt-in Windows app launching.

**Start here on Windows: [WINDOWS-RUN.txt](WINDOWS-RUN.txt).** See [INTEGRATIONS.md](INTEGRATIONS.md) for account setup, costs, permissions and capability boundaries. No universal app control or native phone companion is claimed.

## Command center and AI Core

See [CAPABILITIES.md](CAPABILITIES.md) for seven optional text-provider adapters, prefix routing, strict local-AI privacy, best-effort secret redaction, token guards and call logs, SQLite-approved memory, optional local semantic recall, streamed bounded agent tasks, the shared CLI, prioritized GitHub integration and read-only companion Git/Docker/system tools. It also lists the supplied product claims that are not implemented; no 70-tool or native Store-app claim is made.

## Workflows and paired computers

See [WORKFLOWS.md](WORKFLOWS.md) for the prompt builder, editable canvas, published versions, persistent run/approval history, interval and Google Calendar triggers, enforced authority rules, shared goals/context, paired-computer queues, managed browser control and browser skill recording. Optional local file reads are confined to a dedicated approved folder. No new AI provider key is needed, but Google OAuth and a companion installation are separate requirements.

The brain runs schedules while the Node process is running, even with browser tabs closed. It is not automatically deployed as an always-on hosted service. Existing speech controls remain browser speech recognition/TTS; realtime audio and general native desktop/phone control are not included. The commercial plans from usejarvis.dev are not part of this independent project.

## Run

Requires **Node.js 24.5 or later** (tested on 24.19). No dependency installation or frontend build is required.

```sh
cd /workspace/JARVIS
# First setup only; preserve an existing .env:
if [ ! -f .env ]; then cp .env.example .env; fi
# Edit the private .env: set GEMINI_API_KEY.
npm start
```

Open `http://localhost:3000` on the computer running the server. On Windows use `npm.cmd start` if PowerShell blocks npm.ps1. `npm run dev` enables server file watching. Default text model is `gemini-3.1-flash-lite`; default image model is `gemini-3.1-flash-image`. Both are configurable; actual access varies by account and model availability. Errors are surfaced, never replaced with a fake response.

Existing `.env` files are not updated automatically. If upgrading, add the new integration variables from `.env.example` only as needed, and change an older GEMINI_MODEL setting to a model available to your account. Keep your existing key private.

## Use

- **Command center / AI Core**: actual operations, task agent, provider/privacy settings, usage log, SQLite memory vault and GitHub.
- **Workflows**: bounded prompt builder, step canvas, published versions and reviewed runs.
- **Authority / Shared context**: enforce automation rules and approve shared goals/preferences.
- **Computers & skills**: paired companions, approved browser/file commands and browser routine recording.
- **Agent task** or `/task`: same bounded task agent as the Command center/CLI; supported dictation can fill this mode, while approvals remain explicit.
- **Auto / Chat**: conversation with explicitly approved memory. Auto selects common Search, Research, Debug and Image requests; choose a mode to override it.
- **Web search** or `/search`: Google Search-grounded answers with source links and attribution, or an explicit notice when sources are absent.
- **Product research** or `/research`: current comparisons with sources; verify prices and availability.
- **Create image** or `/image`: real provider-generated images, persistent server storage and download.
- **Debug code** or `/debug`: attach a text/code/log excerpt, review it for secrets, then get a proposed diagnosis and fix. Code is not executed or modified.
- **Reminders**: review and approve a reminder, see due items, mark complete, delete, and export to a native calendar. In-app/optional browser alerts need the page open.
- **Mail**: OAuth connect to Gmail, explicitly load/search messages, compose and approve each send. Other mail clients can use the mailto handoff.
- **Tools & capabilities**: review integration states, access Windows app launching, and open phone/calendar handoffs.
- **Memory**: up to 30 facts of 500 characters, explicitly saved and individually removable. No automatic memory extraction.

Browser speech input uses SpeechRecognition/webkitSpeechRecognition when supported, with HTTPS or localhost and microphone permissions. Your browser may send audio to its speech service. Spoken responses use speechSynthesis; choose/test voices in Settings. No always-on listening or wake word. Device voice support and audible playback need real-device validation.

## Data and privacy

Conversations, memory and voice preferences live in this origin's browser localStorage. Provider requests include up to 40 recent successful-context messages and approved facts. Messages are limited to 12,000 characters each and 60,000 total submitted context characters. Attached text is included in the message you review and send. Failed turns remain visible but are excluded from future AI context. Start a new conversation when context is too large.

Server-local `.data/` stores generated images, reminders and Gmail OAuth tokens. It is ignored by Git. Protect this folder; tokens are not encrypted at rest. Back it up separately if needed and exclude credentials when sharing source. Deleting browser conversation history does not delete server image files, reminders or Gmail tokens. Use the relevant integration controls. The server does not log prompts, key values, mail contents or OAuth callback URLs.

The API key is server-only. Provider errors are sanitized. Model text, code and mail snippets are rendered as text. Search URLs are HTTPS-only; Google attribution is isolated in a sandboxed iframe. Side effects require single-use server-side approval, and privileged POST endpoints require a same-origin CSRF token.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| GEMINI_API_KEY | unset | Server-only Gemini credential |
| GEMINI_MODEL | gemini-3.1-flash-lite | Text/search model |
| GEMINI_IMAGE_MODEL | gemini-3.1-flash-image | Image-capable model; billing may apply |
| HOST / PORT | 127.0.0.1 / 3000 | Local HTTP binding |
| ENABLE_DESKTOP_TOOLS | false | Opt-in Windows launches only |
| GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET | unset | Gmail Web application OAuth client |
| GOOGLE_REDIRECT_URI | http://localhost:3000/api/mail/callback | Must match Google's authorized redirect exactly |
| JARVIS_PASSWORD | unset | Required for non-loopback binding; username jarvis |
| JARVIS_ALLOWED_HOSTS | localhost, 127.0.0.1, [::1] always allowed | Additional trusted proxy hostnames, comma-separated |
| JARVIS_DATA_DIR | .data beside the project | Optional private storage directory |

Local access requires no router forwarding or cloud environment configuration. Network access needs trusted HTTPS, explicit host configuration and authentication. The app is single-user, not a multi-user service. Cloud hosting cannot launch apps on your laptop. Publishing this source or a cloud snapshot does not automatically provide a public preview or connect personal accounts.

## Validate

```sh
npm run check
npm test
```

Node tests cover chat validation, grounded search metadata, real image-byte storage, provider failures, reminders/calendar export, concurrent persistence, approval replay/argument tampering, Gmail OAuth/PKCE/token refresh and MIME encoding, host validation, authentication and the fixed Windows launcher adapter. External Gmail/Calendar and Windows interactions use controlled adapters in tests; passing tests do not establish real-account/device access.

Optional browser smoke tests use Python, Playwright and installed Chromium:

```sh
python3 -m pip install playwright
# If Chromium is absent: python3 -m playwright install chromium
# Run isolated fixture servers, never your personal accounts:
python3 scripts/test-browser.py
```

The browser tests intercept external AI success responses, test local UI interactions and persistence, and keep these fixtures separate from real provider checks. For a server on another port set JARVIS_TEST_URL. See [VALIDATION.md](VALIDATION.md) for release-specific live verification and untested capabilities.

## Structure

```text
public/           UI, voice, local history/memory, integration panels
server/ai.js      Chat modes, grounding and image adapter
server/provider.js Gemini HTTP/errors
server/actions.js Immutable approvals, fixed desktop launcher and calendar export
server/mail.js    Gmail OAuth, refresh, list and approved send
server/store.js   Atomic, serialized local data writes
server/index.js   HTTP routing, auth, CSRF and assets
server/tools.js   Capability states
scripts/check.js  Cross-platform syntax checks
test/             Integration and browser tests
```

For the explicit workflow UI fixture (never a production server):

```sh
JARVIS_TEST_FIXTURE=true PORT=3002 node scripts/browser-fixture.js
# In another terminal:
python3 test/workflows-browser.py
```

Optional companion checks after `npm ci --prefix companion`:

```sh
node companion/queue-smoke.js
# Requires an installed Playwright Chromium or COMPANION_CHROME_PATH:
node companion/smoke.js
```

The queue test starts a separate companion process and reads only a temporary fixture file. Browser tests use controlled HTML, not personal accounts. Windows PowerShell uses `$env:NAME="value"` for environment overrides; see WINDOWS-RUN.txt for the standard setup.

The shared terminal interface starts with `npm run cli` (`npm.cmd run cli` on Windows) while the brain is running. It uses the same AI settings and memory vault; ordinary terminal chat context is session-local. `/task` uses the bounded agent and prompts before approved reads/writes. See CAPABILITIES.md for limitations.

## Version 3.0 HUD update

The default home is now the cyan command HUD, with a canvas reactor, measured brain-server telemetry, real task/approval/provider state and persistent emergency pause/resume. Chat and all existing tools remain accessible from the top navigation and drawer. On Windows, `START-JARVIS.cmd` provides a browser launcher without changing your saved keys. See [LAUNCH-READINESS.md](LAUNCH-READINESS.md) for exact verification and remaining limits. Use the latest main ZIP for this update; the original v3.0.0 tag is preserved.

Latest source ZIP: https://github.com/mgGamez/JARVIS/archive/refs/heads/main.zip
