# Capability map for the supplied Windows-assistant reference

This is an independent personal JARVIS project, not the Microsoft Store or hosted product described in the pasted material. The reference is a feature wishlist, not evidence that those features are installed here. There is no claim of 70+ tools, Microsoft Store/Google Play publication, enterprise throughput, measured 3× speedups, zero context loss, automatic updates or a $9.99 lifetime license.

## Implemented foundation

| Capability | Implementation | Setup / practical limit |
| --- | --- | --- |
| Command center | Actual task/approval counts, companion heartbeat and reminder state | System information comes from an approved companion command, not invented telemetry |
| Seven text-model providers | Gemini, OpenAI, Anthropic, Groq, OpenRouter, Ollama, llama.cpp | Configure only providers you use; test each account/model in AI Core |
| Prefix routing | `@gemini`, `@openai`, `@claude`, `@groq`, `@openrouter`, `@ollama`, `@llama`; optional `:model-name` | Default provider is explicit; no unsupported claim of picking the “best” model automatically |
| Local privacy | Strict rejects all cloud AI, including Gemini image/search calls | Local Ollama/llama.cpp must be running on the brain's computer; connected app APIs can still use the network |
| Guarded cloud calls | Best-effort redaction of common credential formats and assignments | Not a guarantee of removing every secret; review prompts/files first |
| AI call log / token guard | Provider, model, timing, result code and actual/estimated token counts; conservative reservations | No prompts/keys in this log. Not a hard currency-spend or provider-billing guarantee; unknown prices are not invented |
| Bounded task agent | Up to 4 model calls, up to 3 independent read tools per turn, actual server-sent activity events | Reads: relevant GitHub metadata/commits/issues/PRs, Gmail list/search, reminders and approved memory. Writes are proposals requiring exact-action approval |
| Shared memory vault | Approved SQLite facts and FTS keyword recall; remember/forget UI | Browser chat history remains browser-local; ordinary chat transcripts are not silently migrated or automatically memorized |
| Semantic recall | Optional local Ollama embeddings with cosine ranking over approved facts | Install an embedding model and set MEMORY_EMBEDDING_MODEL; not enabled by default; tested with controlled vectors, not an installed embedding service |
| Web + terminal | Web dashboard and `npm run cli` share AI settings, authority, task agent and memory vault | CLI ordinary chat context is session-local; `/task`, `/remember`, `/memory`, `/forget` use the same brain APIs |
| Versioned workflows | Canvas, prompt-to-supported-template builder, editable JSON, AI and programmed steps, immutable versions | Meeting follow-ups, call preparation and research digest; advanced supported device steps use JSON. No arbitrary generated code |
| Schedules / Calendar events | Persistent interval scheduler and Google Calendar scheduled-end polling | Brain must be awake/running. Calendar access needs Google OAuth. This is not live meeting termination/transcription |
| Gmail | OAuth inbox/search, reviewed sends | Google client, Gmail API and consent required; real delivery not tested without your account |
| GitHub | Repository metadata, recent commits, issues, pull requests; approved new issue creation | Existing cloud credential successfully read mgGamez/JARVIS. Local Windows needs its own API token for private reads/writes; issue writes need permission |
| Computer companion | Scoped pairing, single task leases, heartbeat, approval/revocation/expiry | Runs on each target computer; remote brain needs your own trusted HTTPS endpoint |
| Browser work | Managed Chromium, allowed-host navigation/read/fill/link follow; browser recording/replay | No automatic forms, password/credential fields, arbitrary button actions, global desktop recording or anti-bot bypass |
| Local files | Approved list/read operations in one dedicated folder | No move, write, organize or delete operations; hidden/common secret files and symlink escapes rejected |
| Local Git | Read-only status, recent log and diff summary | Git installed and COMPANION_REPO_ROOT selected; no commit/push/reset tool in the application |
| Docker observations | Read-only running-container list, resource snapshot and logs | Docker installed/running; ENABLE_DOCKER_TOOLS=true. No start/stop/prune/arbitrary container management |
| System information | Real OS/CPU-count/memory/uptime snapshot from companion | Not continuous per-process monitoring or a GPU compatibility assessment |
| Windows app launch | Approved Notepad/Calculator/File Explorer launches | Opt-in on Windows; actual Windows runtime is not available in the cloud tests |
| Existing voice | Browser speech recognition and TTS | Browser/device support and permissions required; disabled in Strict because offline processing cannot be guaranteed |

## Provider setup

Keep every value in the **brain's private `.env`**, never in frontend files or chat. Choose the default provider and model names in AI Core. Probe uses one small real request and can consume quota. A configured key is not proof of account entitlement.

| Provider | Required setting |
| --- | --- |
| Gemini | GEMINI_API_KEY (already used by this project) |
| OpenAI | OPENAI_API_KEY |
| Anthropic | ANTHROPIC_API_KEY |
| Groq | GROQ_API_KEY |
| OpenRouter | OPENROUTER_API_KEY |
| Ollama | OLLAMA_BASE_URL=http://127.0.0.1:11434 and a locally installed model |
| llama.cpp | LLAMA_BASE_URL=http://127.0.0.1:8080 and a running OpenAI-compatible local server |

Local AI endpoints are restricted to loopback. A cloud brain cannot reach a model on your laptop's localhost. Run the brain locally for local AI, or implement an explicitly secured model-serving arrangement separately. The app does not download GGUF models, decide GPU/RAM fit, install llama.cpp or train/calibrate a wake word. Use your model vendor's supported installation instructions; do not buy another API plan just to use the current Gemini path.

A ChatGPT/Claude consumer subscription is not general OpenAI/Anthropic API credit. Claude Code CLI routing is not implemented; no claim is made that this app can spend a Claude subscription through that CLI.

For optional semantic recall, install an embedding model in your local Ollama service (for example a model documented for `/api/embed`), set `MEMORY_EMBEDDING_MODEL` to its installed name, and restart. New approved facts attempt indexing locally. Existing facts can be indexed individually in Memory vault. Keyword search stays available if embeddings fail. Embedding requests never use an external cloud endpoint. Memory is not encrypted at rest; protect your OS account and `.data/` backups.

The application token guard resets on UTC day boundaries, counts provider-reported tokens when available and otherwise records estimates. Crash-interrupted reservations remain conservative until the next day. It does not enforce provider-side billing, currency spending, image-unit costs or hidden/unreported charges. Use your provider account's billing controls as well.

## Prioritized account connections

You selected Gmail/Calendar and GitHub first.

- **Google:** enable Gmail API and Calendar API; configure your own OAuth Web client ID/secret and redirect URI; add your test user/complete consent requirements; reconnect to grant Calendar read-only scope. Your Gemini key cannot authorize account access. See WORKFLOWS.md and INTEGRATIONS.md.
- **GitHub:** set `GITHUB_API_TOKEN` privately on your own Windows installation. Use a fine-grained token restricted to the repositories you choose: metadata/contents read for repository and commit information, issues read/write to create issues, and pull-request read when needed. A successful cloud API read does not transfer that credential or establish your local token's write permission. No real issue was created during live validation.

## Not implemented from the pasted product claims

These remain absent and are not labelled built-in or working:

- Native Electron/MSIX packaging, signed installers, Microsoft Store publication, automatic updates, Android/Flutter native app and Google Play distribution. These need platform builds, signing/publisher accounts and additional implementation. The current web app and Node companion are not a Store app.
- General desktop/window switching/closing, arbitrary mouse/keyboard control, screenshots, clipboard control, arbitrary host shell execution, file movement/writes/deletion, code patching and unrestricted Git/Docker management.
- Whisper/Kokoro, wake-word listening, microphone calibration, continuous hands-free listening, JARVIS Cloud audio, Groq/OpenAI/Deepgram/ElevenLabs voice adapters and realtime duplex speech. No extra voice API key will activate code that is not present.
- IMAP/SMTP app-password connectors; Jira, ClickUp, Slack, WhatsApp/Messenger/Instagram connectors or unattended auto-reply. These were not the connections you prioritized. They need adapters, scopes and account setup; WhatsApp access also depends on the chosen supported account/API route, not merely a generic AI key or Docker install.
- PostgreSQL/Redis backends, automatically memorizing every decision, whole-conversation cross-device synchronization and benchmarked enterprise-scale parallel execution.
- Windows DPAPI or other at-rest key encryption. Provider keys remain in private environment configuration; pairing hashes are stored server-side, with the pairing token kept privately on the companion.

No downloaded third-party proprietary components, logos, pricing promises or publisher identities were used. See VALIDATION.md for the exact distinction between controlled tests, live provider reads and unavailable account/device verification.
