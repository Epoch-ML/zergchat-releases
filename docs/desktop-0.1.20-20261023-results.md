# Zergchat 0.1.20 — Router recovery and desktop update acceptance

[0.1.20](https://github.com/Epoch-ML/zergchat-releases/releases/tag/zergchat-v0.1.20) adds the shared inline Router connection UI, clearer failed-reply recovery, session isolation for overlapping agent turns, and an active bot directory that retains interactive agents while preserving imported Slack authors in history. The native shell admits only the bound Router consent frame; initial windows and native session access remain local-only.

The signed public **0.1.18 → 0.1.20** macOS update passed through the ordinary **Restart to update** action. A new process running the exact 0.1.20 release executable appeared before any manual launch. About showed 0.1.20, sign-in and the same single conversation pane were retained, and the completed update was no longer offered.

| Component | Frozen source |
| --- | --- |
| Universal macOS desktop | `c32ef569705026159d505641578a2a877bbcaef2` |
| Hosted runtime, including the bounded cold-resume correction | `bcfa5885fd1c8174870b282a997cbce12a3284c3` |

## Release checks

All six assets were independently downloaded and hashed as a draft and again anonymously after publication at **2026-10-23 08:25:37 UTC**. The stable updater signature verified independently. App and DMG notarization were **Accepted**; signing, exact entitlements, both packaged architectures, stapling, Gatekeeper and archive extraction passed. Shipping test features are disabled.

The complete [hosted universal DMG](https://zergchat.com/api/native/download/668379133/Zergchat_0.1.20_universal.dmg) download matched the release hash. Both Mac architectures offer 0.1.20 from 0.1.18 and return HTTP 204 at 0.1.20. Retained Windows/Linux feeds offer 0.1.10 from 0.1.9 and return 204 at 0.1.10.

The restarted executable SHA-256 is:

`a4d135a9a1e89bae961831c8f2123c56c11fb473b629af10056760eacb903558`

After deployment, retrying the original failed question produced a visible answer in the same stored reply, cleared failure flags and preserved its trigger and prior history. The hosted runtime was healthy at database schema 27.

## Controlled desktop observations

The rehearsal used a separate signed application copy with the existing authenticated OS application/profile state. Its profile was **not isolated**. Updated recovery copy removed the stale sign-in instruction and left one explicit Retry. The Slack source group remained above personal chats, and the active bot directory showed four interactive agents.

The account was already connected. No sign-out, new real Router grant or full real consent approval was performed. Synthetic consent checks and a real public Router iframe READY handshake were verified separately. Native policy qualification passed 16 auth tests and both real WebKit callback modes; 25 of 27 scoped mutants were killed, with two reviewed equivalent final-boolean changes and no timeouts or build errors.

The owned rehearsal process was stopped. The operating system independently resolved the application URL handler back to the installed app. Installed 0.1.17 and its executable hash stayed unchanged, and its update action was never invoked. The rehearsal sent no messages.

## Scope

Only universal macOS was rebuilt. Windows/Linux retain **0.1.10**, and Android retains the **0.1.8 pilot**. Intel execution, a fresh drag-to-Applications installation, new packages for other platforms and physical mobile devices were not exercised.

Builds and publication were manual. The release workflow remains `disabled_manually`; no workflow was enabled or dispatched. The superseded 0.1.19 release remains an unpublished draft, and existing immutable assets and tags were not replaced.

The [sanitized evidence](evidence/desktop-0.1.20-20261023.json) contains exact asset IDs, sizes, hashes and finite acceptance outcomes without private paths, process identifiers, account identifiers or conversation content.
