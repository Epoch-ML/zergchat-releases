# Zergchat 0.1.17 — immediate image previews and upload progress

The public macOS **0.1.16 → 0.1.17** update passed through the ordinary **Restart to update** action. The app restarted automatically before any manual launch, retained sign-in and the same open conversation, and no longer offered a redundant update.

[0.1.17](https://github.com/Epoch-ML/zergchat-releases/releases/tag/zergchat-v0.1.17) shows pasted and selected images immediately from local bytes in a compact composer tray. Each file shows queued, uploading, processing or ready status. Failed uploads retain their preview with Retry and Remove. More images can be added while uploads run; Send and scheduling wait for every retained attachment to be ready.

Removing a file cancels its upload, releases its preview and ignores late completions. Changing chats cancels attachment drafts without allowing a response into another chat. Updating metadata in the same chat preserves its draft. Artifact version matching appears only through the explicit **Version options** action after upload.

## Qualification

**71 targeted tests passed: 51 queue/transport checks and 20 full-app/viewport checks**, plus typecheck, sizing and the Nuxt production build. The full-app selection includes six upload-preview cases, three image/artifact cases, nine existing composer destinations at 1440 px, 390 px and 320 px, one formatting case and one scheduled-message receipt case. The new compact previews were visually checked at desktop and phone widths. A separate localhost browser diagnostic confirmed Attach opens the multiple-file chooser.

Checks cover local pixels before the upload reply, progress and processing, retry after failure, removal and object-URL release, multiple pending pastes, send/schedule gating, cross-chat isolation and same-chat metadata refresh. Invalid raster data falls back safely. Uploaded images keep local previews even when remote reads fail; a foreign URL in the upload response causes no remote preview request or credential transfer. Existing explicit artifact versioning remains covered.

Scoped mutation results:

| Area | Result |
| --- | --- |
| Composer upload queue | 120 killed; 8 reviewed equivalent survivors; 0 timeouts or errors |
| Upload transport and forwarding | 70 killed; 22 classified survivors; 0 timeouts or errors |

The invalid initial transport campaign is excluded. These are scoped campaigns, not mutation coverage of every composer component. The full application suite is not claimed green. The theme checker separately reports the existing undefined `--red` token at `FakeidanBotManager.vue:282`; this change does not introduce an undefined theme token.

## Release and update

Frozen source: `1ba8b1d6d6882180aaba0c94a3e76d01a7b43fe5`. App and DMG notarization were **Accepted**. Signing, exact entitlements, both packaged architectures, stapling, Gatekeeper, archive extraction and the unchanged stable updater signature passed. Test features are disabled. All six draft assets were independently downloaded and hashed, then anonymously downloaded and verified after publication. The hosted DMG was downloaded completely and rehashed. The downloads page displays 0.1.17.

Both Mac architectures offer 0.1.17 from 0.1.16 and return 204 at 0.1.17. The retained Windows/Linux feeds offer 0.1.10 from 0.1.9 and return 204 at 0.1.10. The installed 0.1.15 Mac also receives a 0.1.17 offer.

The actual update used a separate signed 0.1.16 application copy with ordinary shared Keychain/WebView storage. Its automatically restarted 0.1.17 executable matched the release SHA-256:

`36751e01a968b6e486be5c7761680b4a8ffeb7151e02e75deee68b852c61e03a`

The hosted universal DMG SHA-256 is:

`484d506b55b99a5f6367b938ed4501bb1dde7d9028d2dec6311622ab0f4fba0b`

Production runs `desktop-0.1.17-1ba8b1d6d688`, healthy at schema 27 after an image-only deployment. The owned test app was stopped, the original conversation restored and the installed app's URL handler restored. The installed 0.1.15 app remains unchanged and can use the stable updater. No real Slack message was sent during acceptance.

## Scope

The delay/preview behavior was qualified through controlled Chromium application tests. Native OS image-clipboard and file-picker interaction was not qualified through the CUA controls; no image was uploaded or message sent in that native attempt. Its unsent scratch draft was cleared. The automatic native updater acceptance above is complete and independent of that UI automation limit.

Only macOS was rebuilt. Windows/Linux retain 0.1.10 and Android retains the 0.1.8 pilot. Intel execution, new Windows/Linux/mobile packages, physical mobile devices and a fresh drag-to-Applications installation were not exercised. No Actions build or workflow change was used.

The [sanitized evidence](evidence/desktop-0.1.17-20261022.json) records public hashes, counts and booleans without private paths, process identifiers, workspace/member identifiers or conversation content.
