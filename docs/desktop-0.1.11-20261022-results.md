# Zergchat 0.1.11 — release acceptance

**The actual public macOS 0.1.10 → 0.1.11 update passed**, including automatic restart and retained sign-in and conversation panes. The exercise used an application copy sharing ordinary Keychain/WebView storage; the installed application remains at 0.1.10. Final UI observation: 2026-10-22T19:48:43Z.

## Release and changes

[0.1.11](https://github.com/Epoch-ML/zergchat-releases/releases/tag/zergchat-v0.1.11) was published at **2026-10-22T19:46:50Z** with six immutable macOS assets. The universal build adds a **Sign in to Zerg Router** action to trusted failed bot replies and provider status. Approval opens in the external browser while the conversation stays open; retry stays explicit. Native Router calls use the existing Keychain-backed session and cancel stale approval work after an account change.

The Mac titlebar and header are unified, with centered search and native window controls. **Restart to update** remains visible when a newer native release is available.

| Pin | Exact value |
| --- | --- |
| Mac binary source/tag target | `8ba6d5348e68ecd8f9dda2513dff9002e499340c` |
| Public request/tag commit | `f98d4286e6b884123c4799c627b69689e6a5d870` |
| Live web follow-up | `9218947c5c23abb6695f923ae09053b0f6ba993a` |
| Live image | `sha256:b8dbb1c90481b95bd2d972e1caf707affdba12c27847032cb8c3da3ab8283c17` |
| Stable updater root | `55B88A007E16D659`; SHA-256 `72e69951eb2b25e83adb69fa6da6373e842127cdd6d597b4f95e7572dc60d860` |

Windows and Linux remain at **0.1.10**; the Android pilot remains the separately identified **0.1.8 debug APK** for sideloading. The server follow-up selects the newest signed update per compatible platform, preserving older Windows/Linux clients’ 0.1.10 offers after this Mac-only publication. The healthy deployment retained schema 27 and changed only the image.

## Observed native update

The ordinary 0.1.10 application copy’s **More → Restart to update** action downloaded the public 0.1.11 release, installed it and restarted automatically. The old process exited; the replacement appeared at the same copy location before any manual launch. The running executable matched SHA-256:

`89296f49662481a1dd4d266cb452ce5ed227990404d054bfbfb899044b83348f`.

Code-signing and Gatekeeper checks passed. The signed-in workspace and both previously open conversation panes remained, and the new Router sign-in action, unified header and centered search were visible. Retention is recorded as booleans and a pane count; no workspace identifiers or conversation content are published.

This was a normal production updater exercise without test IPC or manual installation writes. It was **not an isolated-profile test**: the copy shared ordinary Keychain and WebView storage. The installed 0.1.10 application and its executable hash remained unchanged so its update offer remains available to the user. A fresh 0.1.11 DMG installation was not exercised. No new Router approval was started and no chat message was sent during the native inspection.

The owned test copies were stopped and the normal `zergchat://` handler was restored to the installed application without a broad reset. The original installed 0.1.10 process still displayed **Restart to update** for 0.1.11; that action was left unclicked for the user.

The finished app and DMG passed signing, Gatekeeper, stapling and extracted-archive checks; app and DMG notarization returned **Accepted**. All six draft assets were independently downloaded in full and compared by size/SHA-256 before publication. The updater signature independently verified against the unchanged stable root.

## Hosted delivery and regressions

All **11 anonymous facade checks** passed, including release/download pages, version metadata, and this eight-entry updater matrix:

| Platform | Older client | Offered update | At tip |
| --- | --- | --- | --- |
| macOS arm64 | 0.1.10 | HTTP 200, 0.1.11 | 0.1.11 → HTTP 204 |
| macOS x86_64 | 0.1.10 | HTTP 200, 0.1.11 | 0.1.11 → HTTP 204 |
| Windows x64 | 0.1.9 | HTTP 200, 0.1.10 | 0.1.10 → HTTP 204 |
| Linux x86_64 | 0.1.9 | HTTP 200, 0.1.10 | 0.1.10 → HTTP 204 |

All **12 anonymous artifact smokes** passed for current desktop downloads/signatures and the legacy APK. These were byte-range delivery probes: most transferred 1,024 bytes and small signature files were transferred completely. They complement the independent full-byte verification of the six new release assets; they do not independently rehash every older full package.

Source validation passed on Node 22.23.2: 137 native Node tests, 42 native Playwright cases, 26 Router UI cases, 17 built-header cases, 11 header utility cases, 2 native policy cases, 5 native ACL cases, and typecheck. All seven existing full-app Router account browser cases passed using a temporary profile and synthetic loopback HTTP services.

The platform fallback fix passed all 30 facade cases and 12 runs of its mixed-platform release-order property. Its test-first regression expected update version `0.1.10` but received `undefined` because the updater returned null; failing-test commit `29e2b4e566ee0659e69e41ae02d246aeadb6b0b0` precedes the implementation. All nine controlled fallback semantic mutants were killed. Feature validation also killed 19 distinct Router semantic mutants, 32 header Stryker mutants with one equivalent survivor, and eight native-policy semantic mutants. No aggregate total is implied across these different suites.

## Limits and engineering qualifications

The universal Mac bundle and both architecture feed entries were verified; Intel Mac execution was not exercised. This Mac-only release adds no new interactive Windows/Linux acceptance. Existing Windows runtime/update limitations and lack of Authenticode remain documented in the [bootstrap report](bootstrap-20261022-results.md). No GitHub Actions build or Pages promotion was used; source tags and published asset bytes remain unchanged.

Rust clippy passed with two existing dead-code warnings in unchanged files. Rust formatting remains failing across 46 files before and after the feature, with diff blocks increasing from 250 to 252; no broad formatting was applied. The theme check still reports the existing `FakeidanBotManager.vue` `--red` finding. These qualifications are separate from the release feature notes.

The [sanitized observation record](evidence/desktop-0.1.11-20261022.json) records immutable hashes and measured checks without credentials, private local paths, machine/process identifiers or chat content.
