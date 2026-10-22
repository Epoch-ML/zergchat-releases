# Zergchat 0.1.12 — file tree and release acceptance

The public macOS **0.1.11 → 0.1.12 update passed**, including automatic restart, retained sign-in and both open conversation panes. The installed application remains at 0.1.10; the exercise used a separate application copy sharing ordinary Keychain/WebView storage.

## Shipped behavior

[0.1.12](https://github.com/Epoch-ML/zergchat-releases/releases/tag/zergchat-v0.1.12) was published at **2026-10-22T20:35:30Z** with six immutable Mac assets. [Downloads](https://zergchat.com/downloads) now offers its notarized universal DMG.

The Files tree supports nested folders, named chat files, drag-and-drop, keyboard moves, ordering, filtering and permission controls. Direct conversations appear under viewer-owned person/group folders. Additional named discussions preserve the original conversation. Filing preferences persist privately and do not change canonical IDs, paths, history or participants. Folder and chat permissions intersect with ancestor restrictions; agent and provider audiences remain enforced. Shared discoverable files appear in the same tree.

Canonical source/tag: `a4d5675e01b9839f9a34c9e039f9908297f808b1`. Public request/tag commit: `57b316968b6f0c4a0138f4cd51422b4a863cac50`. The server runs the same source with database schema 27; the deployment changed only the image.

## Runtime and delivery

The ordinary application's **Restart to update** action downloaded the public 0.1.12 archive, installed it and restarted automatically. The old process exited and the replacement was observed before any manual application selection. Its executable matched SHA-256:

`2363fedcc784fddeec4d740ca5c92a8d35721cbb07aab2b6269eeb33362a0d9f`

The signed-in workspace and both panes remained. The released UI displayed Files, personal conversation folders and the file filter; the separate public-files section and redundant update offer were absent. No chat message was sent. This was a normal production updater test without test IPC or manual installation writes, and does not claim profile isolation.

The app and DMG received Accepted notarization results and passed signing, stapling, Gatekeeper and archive checks. All six draft assets were downloaded independently and compared byte for byte before publication, then downloaded anonymously and checked again after publication. The unchanged stable root independently verified the updater signature. The hosted DMG was also downloaded in full and rehashed.

All eight updater checks passed: both Mac architectures offer 0.1.12 to 0.1.11 and return 204 at 0.1.12; Windows/Linux offer 0.1.10 to 0.1.9 and return 204 at 0.1.10. Android retains the existing 0.1.8 pilot APK.

## Source qualification

Node 22 qualification passed: four full-app workflows, 34 UI/client cases, 34 backend ACL/order/privacy cases, 12 legacy filing integration/UI cases, two folder/webhook cases, 35 focused personal-filing cases and six final private-ordering cases. These suites overlap and are not an aggregate unique-test count. PostgreSQL durability/replay, property-based checks, typecheck and sizing checks passed.

Test-first failures included personal filing expecting folder level 3 but receiving 1, a canonical replay replacing a personal parent, and a late response restoring revoked metadata. Tests also reproduced audience widening, private filing entering shared history, and tied ranks ignoring drop intent before the corresponding fixes.

Bounded mutation qualification closed real survivors: backend controlled probes killed 34 with one redundant equivalent; personal scopes killed 131; UI Stryker/exact replays killed 86 with 12 equivalents, and additional UI/client controlled probes killed 18 with one equivalent. No timeouts or unclassified survivors remain in these selected scopes. These figures do not claim exhaustive coverage.

## Limits and cleanup

Intel execution and a fresh DMG drag-to-Applications installation were not exercised. This release does not rebuild Windows/Linux or extend their prior interactive acceptance. Existing channel names remain workspace-unique. The theme check still reports the pre-existing `FakeidanBotManager.vue` `--red` finding.

The owned app copy and disposable PostgreSQL were stopped, and the installed app registration was restored. Its executable remains unchanged. No Actions build, workflow change or Pages promotion was used; existing tags, keys and published assets remain unchanged.

The [sanitized observation record](evidence/desktop-0.1.12-20261022.json) contains hashes and booleans without private paths, process IDs, workspace identifiers or chat content.
