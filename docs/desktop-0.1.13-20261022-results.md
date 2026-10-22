# Zergchat 0.1.13 — personal Slack identity and release acceptance

The public macOS **0.1.12 → 0.1.13 update passed** through the ordinary **Restart to update** action. The replacement process started automatically, retained sign-in and both conversation panes, and displayed the new Slack linking prompt under an existing mirrored message.

## Shipped behavior

[0.1.13](https://github.com/Epoch-ML/zergchat-releases/releases/tag/zergchat-v0.1.13) was published at **2026-10-22T21:12:24Z** with six immutable Mac assets. [Downloads](https://zergchat.com/downloads) offers its notarized universal DMG.

**Link Slack and post as me** combines account verification and explicit personal-posting consent. The desktop opens a single-use first-party handoff in the browser so the OAuth cookie is established there. Authorization remains bound to the issuing person, session, workspace, Slack team and application credentials. A later workspace selection cannot redirect the grant.

Verified Slack messages map to the same Zergchat person. Delivery labels record the actual app, personal or mixed identity, with neutral pending/failed states. Older messages without trustworthy delivery facts receive a generic linking prompt; they are not retroactively relabeled. Revoked authorization refreshes the prompt, and delivery metadata does not invalidate agent content revisions. Channel permissions remain enforced.

The released native prompt was opened and its settings layout inspected. No real Slack consent was granted and no message was sent. OAuth and send/receive behavior were exercised against local Slack HTTP stand-ins.

## Public update and deployment

Source/tag: `aaa460942e3f2af3b2002f468e0665b57dfc4005`. Subsequent verification commit: `7fe292de45`. Public request/tag commit: `e1d196addd8c69e1d45d8d0afc88ae3d964a6c74`. The server runs the same source at schema 27; deployment changed only its image.

The controlled update used a separate signed 0.1.12 app copy with ordinary shared Keychain/WebView storage. Its visible Restart action downloaded the public release and automatically restarted. The replacement was observed before any manual app launch, with executable SHA-256:

`3a9b75c07b6b7d6f18fb9a6467a8cfc77e2e2d2be4527a18a2c72b7bdd917ed2`

Workspace, sign-in and both panes remained. The existing self-authored mirrored message displayed the linking prompt, which opened Your Slack account settings. The redundant update offer was absent at the new version.

App and DMG notarization were Accepted. Signing, exact entitlements, universal architectures, stapling, Gatekeeper, archive extraction and independent updater-signature checks passed. All six draft assets were independently downloaded and hashed before publication, then downloaded anonymously and checked again afterward. The hosted DMG was downloaded in full and rehashed.

All eight updater checks passed: both Mac architectures offer 0.1.13 to 0.1.12 and return 204 at 0.1.13; Windows/Linux continue offering 0.1.10 to 0.1.9 and return 204 at 0.1.10. The stable updater root is unchanged.

## Source qualification and limits

Selected suites overlap: 58 OAuth/ticket cases, 40 UI/client cases, 15 delivery/PostgreSQL cases, 75 backend/admin cases, 38 Router/durability cases, and 27 full-app workflows passed. A final combined UI/delivery/PostgreSQL run passed 55 cases. Typecheck and sizing checks passed.

The initial broad Slack run passed 841 and skipped 30. It exposed one new projection failure, fixed and covered by the final focused run, and five existing thread-test failures. An independent run on both the starting `650d0151` and current source produced the same 43 passed, five failed and one skipped in that unchanged thread file. The pre-existing theme check finding for `FakeidanBotManager.vue` `--red` remains. These results do not claim an entirely green broad suite.

Selected mutation checks killed 20 OAuth, 23 UI, three admin-scope and 13 delivery-integration variants. Delivery-helper Stryker plus exact replays classified 106 killed and one independently reviewed JSON-domain equivalent out of 107; all four original timeouts were resolved by prompt failing replays. No real survivor or unresolved timeout remains in these scopes.

This release rebuilds macOS only. Windows/Linux retain 0.1.10 and Android retains its 0.1.8 pilot. Intel execution and a fresh drag-to-Applications install were not exercised. The temporary app copies and PostgreSQL were stopped, and the installed app handler was restored. The installed 0.1.10 binary is unchanged and its workspace menu shows the 0.1.13 Restart offer. No Actions build or workflow change was used.

The [sanitized evidence](evidence/desktop-0.1.13-20261022.json) records hashes and booleans without private paths, process identifiers, workspace identifiers or chat content.
