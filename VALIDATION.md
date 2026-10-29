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
