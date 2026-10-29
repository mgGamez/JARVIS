# JARVIS 3 validation — 29 October 2026

Release 3 adds a persistent workflow engine and optional paired companion. The previous JARVIS 2 results below are historical, not new claims of provider entitlement. The additional pasted Windows-assistant feature reference is mapped explicitly in CAPABILITIES.md; unimplemented product claims are not presented as working.

Passed release-3 checks:

- JavaScript syntax checks across brain, UI, scripts and companion.
- 56 Node tests: original integrations plus workflow schema/version/context snapshots, approval expiry/replay, changed authority, unattended interval scheduling, Calendar event deduplication and API-window filtering, restart/uncertain-send behavior, device token scoping/hash redaction, single leases/revocation/expiry, CSRF, confined local file reads/symlink rejection and public-host browser guards.
- Desktop/mobile Chromium UI checks: bounded prompt-building fixture, editable step canvas, save/publish, persistent run progression, approval/completion, authority/context persistence, one-time device pairing token, approved queue/revocation, and the existing chat/memory/reminder/image UI suite. External success responses use explicitly controlled fixtures; no personal account actions occur in those tests.
- Real Chromium companion controller: controlled page navigation/read/fill, password-field rejection, browser-only recording/replay, link-only navigation, and hostname restrictions. No personal account or native Windows action was performed.
- Separate companion-process test: real authenticated HTTP polling, explicitly approved task queue, reading a temporary allowed local text file, returning its result to the brain, and process cleanup. This ran on one Linux host; it does not establish remote HTTPS routing or Windows device behavior.
- Real Gemini request for the user's meeting-follow-up prompt: produced input → AI → approval → mail with a Calendar trigger, disabled pending explicit user enablement. An earlier compiler capability-classification defect was diagnosed and corrected by enforcing supported template/trigger selection in code.
- Real Gemini workflow drafting from fictional notes: valid subject/body returned. No message sent.
- Seven-provider protocol normalization (Gemini plus OpenAI, Anthropic, Groq, OpenRouter, Ollama and llama.cpp), strict cloud rejection including image/search paths, best-effort redaction, model-call logs, token guards, SQLite fact persistence/forgetting, controlled semantic vectors, GitHub endpoints, fixed developer-tool argument lists, finite agent loops, explicit agent reads and actual SSE output were tested with controlled responses.
- Core Chromium UI: seven provider cards/settings, strict cloud rejection and disabled browser speech, persistent SQLite facts/keyword search/forget, controlled GitHub reads and approved issue fixture, actual streamed task events. No real external write was performed.
- CLI fixture test: separate terminal client used the same brain API for explicit remember/retrieval and bounded read-task operations.
- Real GitHub API and the implemented GitHub adapter read mgGamez/JARVIS successfully with existing cloud credentials. This establishes that read operation only, not local Windows authentication or write permission.
- Real minimal Gemini request through the new router returned provider text. Two live read-agent attempts failed before a tool result (one transport failure, one provider-unavailable response); end-to-end live agent success is not established. Controlled loop/UI/SSE tests passed; no write occurred in either live attempt.

Not validated / not provided:

- Real Gmail/Calendar account consent, event polling against a personal Calendar and real outgoing mail: no Google OAuth client or consenting account was configured. Protocol/engine behavior uses controlled test responses.
- Real OpenAI/Anthropic/Groq/OpenRouter accounts, local Ollama/llama.cpp services, local embedding model and native Docker/Windows observations were not connected. Adapter/algorithm tests are controlled and do not prove account or local-runtime entitlement.
- Actual Windows app launch, native microphone/audio output, multi-machine TLS/proxy configuration, public hosting or systemd installation. These require the user's machine/configuration.
- Universal screen/keyboard/app control, global Windows routine recording, native phone control, realtime duplex voice and third-party commercial subscription plans are not implemented. See WORKFLOWS.md for exact supported boundaries.
- Search/image model entitlement is not revalidated by the new workflow tests. The prior live checks below returned quota/rate-limit errors; working text AI does not establish image/search quota.

The brain and companions must remain running for scheduled work. No always-on hosted subscription or public preview endpoint was deployed. Private .env/.data and pairing credentials are excluded from source publication.

---

# JARVIS 2 validation — 29 October 2026

## Passed

- JavaScript syntax checks for every server, browser and helper script.
- 23 Node tests covering input validation, safe asset serving/secret isolation, provider failures, grounded search request and source metadata, image-byte validation/persistence, reminder approval/persistence/calendar export/deletion, serialized store updates, immutable single-use actions, OAuth state/PKCE/browser binding/token refresh, mail MIME encoding, approved HTTP sends with tamper/replay checks, disconnected mail errors, authentication, host checks and Windows executable allowlisting.
- Chromium browser smoke at desktop (1440 × 1000) and mobile (390 × 844) viewports: provider-error display, source links, safe text rendering, sandboxed attribution, image display/download fixture, attachment review, real local reminder review/approval/storage/calendar download/deletion, Gmail setup-error fixture, disabled Windows launcher fixture, history/memory persistence/deletion and voice Settings. No uncaught JavaScript errors.
- Real Gemini plain-chat request through the JARVIS 2 HTTP backend: HTTP 200 with non-empty provider text.

## Blocked live checks

- Real Google Search-grounded request: HTTP 429, provider quota/rate limit. The app returned RATE_LIMITED and did not fabricate grounded results. Resolve the project's grounding quota/billing/region/model access, or wait if it is a temporary rate limit, then retry.
- Real Gemini image-generation request: HTTP 429, provider quota/rate limit. The app returned RATE_LIMITED and did not fabricate an image. Image-capable models may require paid-tier access and separate quota.

The successful controlled search/image tests validate request handling, UI and storage, not live provider entitlement. Configured states reflect key presence rather than guaranteed provider access. Gemini text chat working does not imply grounding or image quota is available.

## Requires the user's account/device

- Gmail real account sign-in, mailbox access and outgoing delivery: no GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET or consenting Gmail account was supplied. The OAuth/list/send implementation was tested with controlled HTTP responses; no real mail was read or sent.
- Actual Notepad/Calculator/Explorer launch: the cloud machine is Linux. Adapter tests use a controlled process emitter; enable the feature and verify on the user's Windows laptop.
- Physical microphone input, audible text-to-speech and native calendar notifications: require target-browser/device permissions and hardware. UI/API support detection and controls exist; no hardware behavior is claimed.
- Direct Android/iOS app control, arbitrary screen/keyboard automation, arbitrary shell execution, background push and native device alarms: not implemented. These need a native companion/platform integration; an AI API key alone is insufficient.

## Publication

Source publication and a cloud environment snapshot do not install the application on the user's Windows computer, transfer cloud-managed credentials, provide an authenticated cloud preview URL, or grant account/device permissions. Existing local downloads must be updated using WINDOWS-RUN.txt. Preserve the private .env and .data locally, and never upload them to GitHub.
