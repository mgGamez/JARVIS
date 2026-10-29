# JARVIS 3.0 HUD release

Version remains 3.0.0. The new default command center follows the supplied cyan HUD reference using original CSS/canvas artwork, an animated reactor, responsive panels, actual task/approval queues and quick actions. No third-party logos, sample names, fabricated task percentages or fake health scores are used.

## Local Windows launch

Extract the latest **main branch ZIP**, preserve your private `.env` and `.data`, and double-click **START-JARVIS.cmd**. Node 24.5+ must already be installed. The launcher preserves an existing `.env`, creates only a blank template when missing, checks the port, and opens the local browser after startup. Keep its window open. This helper's Node logic passed Linux integration checks for startup, existing-server detection and safe port collision handling; double-click behavior requires testing on Windows. It is not a signed Microsoft Store installer.

The original `npm.cmd start` path remains available. First-time Gemini/OAuth/provider setup still follows WINDOWS-RUN.txt and CAPABILITIES.md. No key is included in a download. Use the main ZIP for the HUD revision; the original v3.0.0 tag remains an immutable snapshot of the earlier design.

## Honest system status

Dashboard numbers are measured on the **brain server**, labelled with its hostname. When the brain runs on your PC those are your PC's OS-reported readings; a cloud brain cannot silently inspect your laptop. Remote readings still require a paired companion and approved System info task. CPU needs two samples; disk can be unavailable. Provider key presence and historical last-call results are labelled separately from current availability. Network bandwidth, weather, fake aggregate health scores and guessed task-completion percentages are not displayed.

## Emergency stop

Emergency stop persists the automation pause, disables schedules, cancels queued jobs/runs/agents and invalidates pending direct-action approvals. Active external requests cannot be undone; outcomes remain recorded. Resuming does not re-enable schedules or restart cancelled runs. Ordinary manually requested chat remains available. This does not shut down the computer, kill unrelated applications or guarantee interruption of an already-running remote operation.

## Remaining release limits

See CAPABILITIES.md for the complete list. Native Store/Android packages, unrestricted screen/keyboard/clipboard control, wake-word/offline/realtime voice, arbitrary shell/file writing, WhatsApp/Jira/Slack/ClickUp adapters and encrypted credential storage are still absent. They are not activated by another API key or a model switch. Gmail/Calendar require your OAuth account setup; other cloud models need their own credentials. Actual Windows hardware, microphone/audio, signed distribution and a public authenticated deployment cannot be certified from this Linux workspace.

The source is runnable and reviewable as a personal web app; it is not a claim that every feature of either referenced commercial product is launch-ready.

## HUD validation

59 Node tests pass, plus JavaScript syntax checks and four Chromium desktop/mobile suites. The suites verify the HUD, existing chat/error/source/image rendering, memory, reminders, workflow canvas/approval, authority, paired-device queue and GitHub/agent screens. External AI/account successes use explicit controlled fixtures. The HUD additionally checks pause persistence and explicit resume. No new live provider or personal-account operation was performed for this design update.
