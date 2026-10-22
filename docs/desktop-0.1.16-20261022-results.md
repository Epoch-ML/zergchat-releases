# Zergchat 0.1.16 — root chat files and Archive

The public macOS **0.1.15 → 0.1.16** update passed through the ordinary **Restart to update** action. The app restarted automatically before any manual launch, retained sign-in and the same open conversation, and no longer offered a redundant update. The restarted app displayed the new root chat files, participant badges and Archive section.

[0.1.16](https://github.com/Epoch-ML/zergchat-releases/releases/tag/zergchat-v0.1.16) shows direct chats as participant-named files at the workspace root. Avatars and participant counts replace generated person folders. **New child chat** creates named chats beneath an existing chat with inherited participants and access. Existing custom folders, nested folders and explicit personal filing are preserved.

Archived chats leave the active tree for a collapsed **Archive** section. Search includes archived matches; restoration returns a chat to its previous location. Archived ancestors lock descendant messages and uploads, and child creation respects inherited channel posting restrictions. Historical message threads remain readable. This navigation change does not move shared data or widen access.

## Qualification

**96 targeted tests and 13 full-app/viewport checks passed**, plus typecheck and sizing checks. Coverage includes root direct chats, named children and grandchildren, reload persistence, participant display, archive/restore, search, keyboard behavior, existing folder moves, inherited access and read-only ancestry. The viewport checks include existing channel/thread/assistant composers at desktop, 390 px and 320 px. They are not physical-device or new mobile-package acceptance.

Child safety checks cover archived roots and intermediate ancestors, timestamp-only archive records, nesting beyond 20 levels, parent membership revocation and public source validation. Public thread creation accepts native conversation/message references and rejects forged provider metadata; internal integration calls retain their separate source path. GitHub PR and Zergboard card files remain visible.

Scoped mutation results:

| Area | Result |
| --- | --- |
| Direct-chat root projection | 58/58 killed |
| Shared knowledge projection | 41/41 killed |
| Child safety and public source validation | 61 killed; 1 intentional cycle-guard timeout; 0 survivors |
| Sidebar projection | 184/193 killed across matching-source runs; 9 equivalent guards for valid canonical snapshots |

The safety timeout removes cycle detection and loops on a deliberately cyclic imported graph. Sidebar equivalents concern redundant ID guards and parent fallbacks, metadata shadowed by canonical chat nodes, and guaranteed archive-file fields. Test-only follow-up `b16fa96794` adds the child path assertion without changing the released application tree.

The expanded thread suite has five failures concerning legacy synced-thread membership and configured-agent destination grants. All five reproduce on pristine parent source with the relevant source-file hashes verified. The full expanded suite is not claimed green. The theme checker separately reports the existing undefined `--red` token in `FakeidanBotManager.vue`; the navigation change introduces no undefined theme tokens.

## Release and update

Frozen source: `12339acdc03af32eac06e323616f8633846778d2`. Both app and DMG notarization were **Accepted**. Signing, exact entitlements, both packaged architectures, stapling, Gatekeeper, archive extraction and the unchanged stable updater signature passed. All six draft assets were independently downloaded and hashed, then anonymously downloaded and verified after publication. The hosted DMG was downloaded completely and rehashed. The downloads page displays the 0.1.16 universal Mac build.

Both Mac architectures offer 0.1.16 from 0.1.15 and return 204 at 0.1.16. Retained Windows/Linux feeds offer 0.1.10 from 0.1.9 and return 204 at 0.1.10.

The actual update used a separate signed 0.1.15 app with ordinary shared Keychain/WebView storage. Its automatically restarted 0.1.16 executable matched the release binary SHA-256:

`0623cccf4f0000263cab30109784c820534e427e7714de11eef3d7a6fd624452`

The hosted universal DMG SHA-256 is:

`846687f9a60e34adaefae6d9e1b1cbbe7fed2231a2fd761053615d05d0a3fd01`

Production runs the frozen source with build `desktop-0.1.16-12339acdc03a`, healthy at schema 27 after an image-only deployment. The owned test app was stopped and the installed app's URL handler restored. The user's installed 0.1.15 app remains unchanged, with 0.1.16 available from the stable feed. No real Slack message was sent during acceptance.

Only macOS was rebuilt; Windows/Linux retain 0.1.10 and Android retains the 0.1.8 pilot. Intel execution, new Windows/Linux/mobile packages and a fresh drag-to-Applications installation were not exercised. No Actions build or workflow change was used.

The [sanitized evidence](evidence/desktop-0.1.16-20261022.json) contains hashes, counts and booleans without private paths, process identifiers, workspace/member identifiers or conversation content.
