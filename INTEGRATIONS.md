# Integrations and realistic capabilities

JARVIS uses Gemini for chat, grounded web search, product research, code analysis and image generation. You do **not** need a ChatGPT or Claude API key. Their subscriptions do not supply Gemini API quota, Google account consent, operating-system permissions or universal phone control. Gemini powers search and images; text chat also supports the six optional providers documented in CAPABILITIES.md. Configure only the provider you choose.

## What you can use

| Feature | How | Requirements and boundaries |
| --- | --- | --- |
| Chat and approved memory | Auto / Chat, Memory panel | Gemini key; memory remains user-approved |
| Current web search | Web search mode or `/search your query` | Gemini model supporting `google_search`; quota/region/billing apply |
| Product research | Research mode or `/research compare…` | Same grounding; citations shown when provider supplies them; verify prices |
| Debugging | Debug mode or `/debug …`; Attach code/text | Reads your selected excerpt and suggests a fix. Does not execute code, run your tests, read arbitrary laptop files or change your project |
| Image generation | Create image mode or `/image your description` | An image-capable Gemini model, API access and potentially billing; generates real provider image bytes and saves them on the server |
| Reminders | Reminders panel, review then approve | Persists to `.data/reminders.json`; due items shown while the app runs and when reopened; optional browser notifications while page open |
| Phone/calendar reminders | Export calendar on a saved reminder | Import `.ics` into an installed calendar; review notification behavior there. No direct Android alarm API |
| Read/search Gmail | Mail → Connect Gmail → Load messages | Separate Google OAuth Web client and user consent; no automatic mailbox upload to Gemini |
| Send Gmail | Mail form → Review before sending → Approve & execute | Server stores immutable pending action for five minutes; approval can execute once; check Sent before retrying an uncertain send |
| Compose via mail app | Tools → Phone handoffs | Uses `mailto:`; you finish the send in your mail app, including Outlook if it is your default client |
| Launch Windows apps | Tools → Desktop apps → Review & approve | Run JARVIS on Windows and enable desktop tools; only Notepad, Calculator and File Explorer are allowed |

Auto mode routes common current-information requests to Search, comparison requests to Research, explicit image requests to Image, and debug requests to Debug. Select a mode or use a slash command for certainty. Gmail and device actions intentionally use dedicated panels and explicit user approval. They are not silently executed by chat. Chat does not automatically navigate arbitrary websites, run shell commands, control browsers, manage arbitrary apps, or complete transactions.

### Search transparency

JARVIS passes `google_search` to Gemini for Search/Research requests. It renders only HTTPS citation links supplied by grounding metadata and preserves Google's search attribution in a sandboxed frame. If Google returns an answer without grounding sources, the UI explicitly labels it unverified. A model-generated URL or a confident answer alone is not proof of web access. Grounding may be unavailable on a model, account or region, or require billing.

### Image storage

Generated image bytes are validated for supported PNG/JPEG/WebP signatures and saved under `.data/images/`. Conversation history stores image references, not API keys or base64 images. Download images you want to keep. Copy `.data/images/` with the app when migrating to retain old image references. The server caps storage at 100 images; back up/remove older images manually. No image service is faked when generation fails. Existing image generation can take up to two minutes.

## Connect Gmail locally on Windows

Your Gemini API key cannot authorize Gmail. Use these separate account steps:

1. In [Google Cloud Console](https://console.cloud.google.com/), create/select your own project and enable the **Gmail API**.
2. Configure Google Auth Platform / OAuth consent: add your account as a test user while the application is in testing. Request `gmail.readonly` and `gmail.send`. These are sensitive/restricted Gmail scopes; broader/public distribution may require Google's verification and security review. Testing-mode refresh tokens can expire; reconnect if required.
3. Create an OAuth client of type **Web application**. Add this exact authorized redirect URI:
   `http://localhost:3000/api/mail/callback`
4. In your private local `.env`, add:
   ```dotenv
   GOOGLE_CLIENT_ID=YOUR_WEB_CLIENT_ID
   GOOGLE_CLIENT_SECRET=YOUR_WEB_CLIENT_SECRET
   GOOGLE_REDIRECT_URI=http://localhost:3000/api/mail/callback
   ```
5. Restart the local server, open **http://localhost:3000** (use localhost consistently, not 127.0.0.1), then Mail → Connect Gmail. Review Google's permission screen and consent using the test-user account.
6. Load messages to verify live mailbox access. To send, enter a single recipient, subject and body, then review the immutable action preview. Only **Approve & execute** sends it. The browser/AI cannot change its arguments at execution time.

The connection uses OAuth state tied to an HttpOnly browser cookie, PKCE and refresh tokens. Tokens and client secrets remain on the server. Tokens are stored in `.data/gmail.json`, not browser storage or Git. File permissions are restricted where supported; on Windows the files inherit your user directory permissions. They are not encrypted at rest. Protect your Windows account and avoid shared/cloud-synced app folders. Disconnect removes local tokens; revoke the app under Google Account → third-party connections to remove account access entirely. Mail replies/content are displayed as text, not executable HTML, and are not automatically sent to the language model.

If the OAuth project/client is not configured, JARVIS reports setup required and offers a mail-app compose handoff. Gmail account access was not validated on a real account during development because no OAuth client or consenting user was supplied. Automated tests exercise the protocol with injected responses; they do not establish your Google consent configuration works.

## Windows device actions

Add `ENABLE_DESKTOP_TOOLS=true` to the **local laptop server's** `.env`, restart, and open Tools → Desktop apps. Each approved action launches a fixed executable with no shell and no model-supplied arguments. Running this Node server in a cloud container cannot open an app on your laptop. The Windows launch adapter has automated tests with a controlled process adapter; actual Windows launches must be tested on your laptop.

This is not arbitrary computer use: no screen capture, mouse/keyboard injection, shell execution, app-specific control, file deletion, or unattended automation is included. Adding those would require explicit integration design and narrower action permissions.

## Android/iPhone

Mobile browsers can use chat, supported voice APIs, image downloads, Gmail OAuth where configured for a trusted HTTPS deployment, calendar import, and mail links. Direct app launching/control, alarm scheduling, background notification guarantees, accessibility-based automation, and screen control require native Android/iOS software, OS permission flows or vendor integrations. This release includes a paired Node companion for managed browsers, confined file reads and fixed Windows app launches; it does not include a native phone or general desktop-screen companion. See WORKFLOWS.md. A ChatGPT or Claude API key does not bypass those OS restrictions.

Browser notifications in this release require a live page and may be unsupported on mobile without a service worker; in-app reminder notices remain available. For reminders while the browser is closed, import the calendar event and verify its alert on your device. No push-notification service or always-on background scheduler is claimed.

## Network access and authentication

Default binding is `127.0.0.1`, with no password required for loopback use. For trusted remote use, configure `JARVIS_PASSWORD`, add the exact forwarded hostname to `JARVIS_ALLOWED_HOSTS`, and use a trusted HTTPS proxy preserving the original Host header. The browser's HTTP Basic login username is **jarvis**. Never use password authentication over public plain HTTP. Non-loopback binding is refused without a password; non-loopback requests are denied without authentication. This does not create a cloud port forward or public preview URL.

All privileged POST actions require a same-origin CSRF token. Outgoing email, app launches and reminder creation also require single-use server approval records. Actions are user-driven; arbitrary model output cannot execute commands. Account mail and reminders are single-user data shared by users of that server, so do not treat this as a multi-user SaaS deployment.

## Cost and secrets

Use `.env.example` as a template; do not overwrite a working `.env`. Text chat may have a free tier. Grounding and image generation have separate provider quotas, regions, model access and possible paid-tier requirements. Check your Google AI Studio/Cloud billing before use. JARVIS does not require buying ChatGPT Plus, a Claude subscription, or both API plans. There is no guarantee that all Gemini features are free.

Never paste Gemini keys, OAuth secrets or refresh tokens into chat, screenshots, frontend files, Git commits, or issue reports. `.env`, `.data/`, private-key files, logs and dependency caches are excluded from Git. Generated images, reminders and Gmail tokens remain on the local server filesystem until removed; browser conversation/memory storage is a separate browser-local store.

## JARVIS 3 additions

See WORKFLOWS.md for Google Calendar read-only OAuth consent, persisted schedules, immutable workflow versions/approvals, shared context, paired workers and browser-only skill recording. Reconnect existing Google accounts to authorize the added Calendar scope. No separate OpenAI/Claude key is needed. The original browser-local memory and server private-data boundaries remain.
