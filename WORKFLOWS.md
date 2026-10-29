# JARVIS 3 — workflows, authority and paired computers

This release adds your own self-hosted workflow system to JARVIS. It is independent of usejarvis.dev. It does not reproduce that company's hosted subscription, billing allowances, branded assets or proprietary desktop recorder. No $29.99/$99.99/$199.99 plan is activated by this code.

## Build and run a workflow

1. Start the brain with `npm.cmd start` on Windows (or `npm start` on Linux/macOS), then open `http://localhost:3000` on that computer.
2. Select **Workflows**. Describe the job and choose **Build with Gemini**, or select Meeting follow-ups, Call preparation or Research digest directly. Compilation uses your existing Gemini key; a template needs no compilation request.
3. Select each canvas step to edit its name and AI instructions. The ordered canvas separates programmed input/actions, AI judgement, and explicit approval. Open **Trigger, recipient & saved notes** to set the trigger, fixed email recipient and scheduled input. A meeting workflow never guesses recipients from notes.
4. **Save draft** stores an editable draft. **Publish version** creates an immutable version; running tasks keep the version and shared-context snapshot they started with. Publishing does not activate a trigger unless you explicitly checked **Enable this trigger when publishing**.
5. **Run published version** starts a manual run using the notes in the editor. **Run history** shows progress, errors and approval previews. Review the exact recipient, subject and body before **Approve exact action**. Call-preparation runs end after review and do not send email.
6. Disable a trigger to stop new automatic runs. Existing approval requests remain available; cancel them individually if needed. You cannot undo an already in-flight action. A failed/uncertain run is never silently restarted.

**Advanced JSON** is a declarative workflow language, not arbitrary JavaScript or shell execution. Supported ordered steps are `input`, `ai`, `approval`, `mail`, `github`, and `device`. Every mail/GitHub/device step must immediately follow approval. AI instructions and outputs cannot execute tools directly. Export a definition to back it up or edit it using the JSON editor; server validation applies before saving/publishing.

To mix browser/file input with AI, add an approved `device` step for `browser.read` or `files.read` followed by an `ai` step. Its returned text becomes the next step's input. Device steps require an existing paired `deviceId` and a validated command. Example step pair:

```json
[
  {"id":"approve_read","type":"approval","label":"Approve reading notes on laptop"},
  {"id":"read_laptop","type":"device","label":"Read approved notes","deviceId":"YOUR_PAIRED_DEVICE_ID","command":{"kind":"files.read","args":{"path":"notes.txt"}}}
]
```

Choose your paired device ID from the device task approval preview. Add these steps within a complete definition that starts with `input` and includes `ai`; mail must still have its own approval step. This system does not run arbitrary code or offer general app integrations beyond those listed below.

## Authority and shared context

**Authority** provides enforced rules:

- Read connected sources: Allow / Ask me / Block. Ask pauses a workflow before reading its notes. Automatic Calendar polling requires Allow; otherwise polling pauses with an error because the event source cannot be read unattended.
- Send email: Ask me / Block. Sending can never be configured to bypass approval.
- Execute on a paired computer: Ask me / Block. The exact command and arguments must be approved first. Reads also honor a Block rule on source access.
- Delete data through automation: Block. No deletion workflow or device command is implemented. This does not prevent you from using your own manual data-management controls.

Rules are checked again before sending or leasing a queued device task. A changed Block rule can invalidate a pending approval. It cannot reverse an action that has already happened. Approval payloads are generated/stored on the server; client-supplied replacement arguments are ignored. Workflow approvals expire after 24 hours. Direct task approvals expire after five minutes; queued device tasks expire after ten minutes if not picked up.

**Shared goals & context** stores your approved goal, writing/email preferences and facts on the brain. They are used in new chat requests and snapshotted into new workflow runs. Browser-local Memory remains separately controlled and is not silently migrated. Do not put passwords, keys, sensitive credentials or unapproved personal information into either store.

## Schedule and Calendar triggers

Interval triggers accept 5–10,080 minutes. The persistent engine runs even when browser tabs are closed, **provided the Node brain is still running and awake**. Missed interval slots coalesce into one run after downtime instead of generating an unbounded backlog. This is an elapsed-time interval, not a timezone-aware cron service.

Calendar triggers poll once per minute while the brain runs. They use an event's **scheduled end time**, not actual Zoom/Meet/Teams call termination. Notes come from the Calendar event description, not an automatic meeting transcript or a separate notes app. All-day and cancelled events are ignored. Event IDs plus end times are deduplicated. The chosen Calendar may include events other than meetings; every generated email still requires your review. A fixed recipient is required before publishing an email workflow.

Enable the **Google Calendar API** in the same Google Cloud project as Gmail. JARVIS now requests `calendar.readonly` together with `gmail.readonly` and `gmail.send`. Existing Google connections must reconnect and consent to the new Calendar scope. Configure:

```dotenv
GOOGLE_CLIENT_ID=YOUR_WEB_OAUTH_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_WEB_OAUTH_CLIENT_SECRET
GOOGLE_REDIRECT_URI=http://localhost:3000/api/mail/callback
GOOGLE_CALENDAR_ID=primary
```

These are OAuth settings, separate from your Gemini API key. Use your own authorized redirect URI for a trusted HTTPS deployment and add it exactly in Google Cloud. Do not paste secrets into chat. Read INTEGRATIONS.md for test users, consent review, token storage and revocation.

## Pair a computer

The brain is one server process with private `.data/` storage. A companion process runs on each computer you want to use. There is no need for another AI key on the companion.

1. On the brain UI select **Computers & skills → Pair computer**, enter a name, and copy the one-time private pairing token. The brain stores only its hash. If lost, revoke that pairing and create another.
2. On the target computer, download the same JARVIS release. Open PowerShell in its `companion` folder and run:

   ```powershell
   npm.cmd ci
   npm.cmd run browser:install
   if (-not (Test-Path .env)) { Copy-Item .env.example .env }
   notepad .env
   ```

3. In **companion/.env** set:

   ```dotenv
   JARVIS_BRAIN_URL=http://localhost:3000
   JARVIS_DEVICE_TOKEN=YOUR_PRIVATE_PAIRING_TOKEN
   COMPANION_ALLOWED_HOSTS=example.com
   ENABLE_DESKTOP_TOOLS=true
   COMPANION_FILES_ROOT=C:\Users\YOUR_USER\Documents\JarvisShared
   ```

   `localhost` works only when brain and companion are on the same computer. For another computer use your own trusted HTTPS brain URL; configure JARVIS_PASSWORD and JARVIS_ALLOWED_HOSTS on the brain as documented. The companion uses its device token, not the browser's Basic login password. An external proxy with separate authentication must be configured to permit your authenticated companion route. This code does not manufacture a public URL or tunnel.

4. Run `npm.cmd start` **inside the companion folder**. Keep the process running. The brain shows recent heartbeat/capabilities. Revoke pairing to block new work and cancel queued jobs; already-running operations cannot be undone.
5. In the brain UI choose the target computer and command, review the exact arguments, and approve. Refresh device results after it runs. Offline tasks remain queued until the ten-minute expiry. A leased task is never delivered a second time; a lost completion report becomes uncertain and needs human inspection.

The optional companion has a pinned Playwright dependency and lockfile; the brain still has no application package dependencies. Browser binaries require a download unless you set `COMPANION_CHROME_PATH` to your own installed Chrome/Chromium executable. Keep companion tokens out of screenshots, chat and Git. API keys and pairing credentials are filtered out of browser/app child-process environments.

### Supported companion capabilities

- Managed, visible Chromium profile separate from your normal Chrome session. You may sign in manually; passwords are not entered by JARVIS. Browser sessions are ephemeral and close with the companion.
- Read current page text; navigate to approved public HTTPS hosts; fill ordinary non-sensitive input/textarea fields; follow ordinary links by navigating to their HTTPS href.
- No automatic form submission or arbitrary button clicking. Link actions do not execute onclick handlers. Password, hidden, file, OTP/credential-labelled and common sensitive fields are rejected. Forms requiring submission are completed manually in the managed browser.
- Service workers and WebSockets are disabled in the managed profile. HTTP(S) requests are checked against `COMPANION_ALLOWED_HOSTS`; common private/loopback/metadata destinations are blocked. Third-party resources require explicitly adding their hostnames. This can break some sites. These are application-level guards, not a complete network sandbox or DNS-rebinding defense. Use only sites you trust; do not give the companion privileged VPN/network access. This is not an unrestricted web browser, anti-bot bypass, or a guarantee that every site can be automated.
- Opt-in fixed Windows launches: Notepad, Calculator, File Explorer. No arbitrary shell, screen/mouse/keyboard control or arbitrary app automation. Additional fixed read-only system/Git/Docker commands are described in CAPABILITIES.md.
- Optional `files.list` / `files.read` under the one dedicated `COMPANION_FILES_ROOT` you choose. Relative paths only; symlink escapes, hidden paths, common secret-file names and unsupported/binary/large files are blocked. Read text is capped at 12,000 characters. No file write/delete is supported. Names do not detect every secret: inspect your shared folder and never put credentials there.

### Teach a browser skill

Open an approved site in the managed browser. Approve **Start browser skill recording**, perform ordinary navigation and non-sensitive field changes there, then approve **Stop browser skill recording**. Results contain up to 30 steps. Query strings and fragments are removed from recorded navigations, and password/sensitive fields are excluded. Review all captured text, selectors and URLs, remove private values, name the routine and **Approve & save skill**. Replaying on a selected computer requires a fresh approval of the full step list.

This records supported browser steps, not a Windows desktop video, global keystrokes, arbitrary application actions or a universal workflow. JavaScript-heavy sites, unnamed fields, changing selectors, login requirements and excluded third-party domains can require manual intervention. Do not record banking, payment or account-security routines. Secrets should always be entered manually and never stored in a recording.

## Keep the brain on

A browser tab is not a hosted service. For local Windows use, the computer must remain awake and the `npm.cmd start` brain process must stay running. Closing that terminal or shutting down the laptop stops schedules. A companion also needs its own running process.

For an always-on brain across computers, deploy the project to your own always-on machine/VM with Node 24.5+, protected private storage, trusted HTTPS, password authentication and backups. An illustrative systemd unit is in `deploy/jarvis.service`; adapt paths/user for your own server. It is not installed or deployed automatically. Run **one brain per data directory**. Multiple brains sharing the JSON directory are unsupported.

Persist `.data/automation.json` (versions, run history, rules, shared context, device hashes, results and skills), images, reminders and Google tokens securely. Tokens/context are not encrypted at rest; protect the OS account/storage and backups. A restart during a mail send or leased device operation does not automatically repeat it. Inspect uncertain outcomes before starting another run.

## What needs another API or service?

| Capability | Needed |
| --- | --- |
| Prompt compiler and AI workflow drafting | Your existing Gemini key and working text quota |
| Gmail + Calendar | Your own Google OAuth Web client, Gmail/Calendar APIs enabled, test user/consent and permissions |
| Managed browser, recording, local text files and fixed Windows launches | Companion installation, pairing token and opt-in configuration; no additional AI key |
| Always-on shared brain | Your own running server/VM and trusted HTTPS for remote access; possible hosting cost |
| Images / grounded search | Existing Gemini integration, but separate model access, quota or billing can apply |
| Natural low-latency realtime voice | Not implemented; existing browser recognition/TTS remain. A properly secured realtime audio-provider integration would be additional work |
| Native phone or general desktop/screen control | Not implemented; requires native software, platform permissions and further integration. An OpenAI/Claude key alone does not provide this |
| Paid plans / token allowances from the referenced product | Not part of this independent project |

Read VALIDATION.md for exactly what was tested. No real account/device operation is claimed without evidence.

Additional read-only developer commands require no AI key: `system.info`; `git.status`, `git.log` (1–30 days) and `git.diff` with COMPANION_REPO_ROOT set; `docker.list`, `docker.stats`, `docker.logs` with Docker installed/running and ENABLE_DOCKER_TOOLS=true. All are approved device actions and honor source-blocking rules. They do not run arbitrary shell arguments or change Git/Docker state.

GitHub issue steps are also supported in workflow JSON: `{ "id":"issue", "type":"github", "label":"Create issue", "repository":"owner/repository" }`. They must immediately follow an approval step. The preceding AI subject/body becomes the reviewed issue title/body. A prompt mentioning GitHub issue creation can choose this output; set the repository in that step's configuration before publishing. `external.write` authority can block it, and ambiguous writes are never automatically retried.
