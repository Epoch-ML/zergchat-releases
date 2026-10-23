# Zergchat 0.1.18 — workspace root chats, source mirrors and personal chat ordering

[0.1.18](https://github.com/Epoch-ML/zergchat-releases/releases/tag/zergchat-v0.1.18) creates chats at **Workspace root — no folder** with every current and future active human workspace member included automatically. Workspace membership records define the audience; platform-admin visibility alone does not enroll someone. Existing private direct chats, restricted chats and legacy rooms retain their access. Moving an opted-in chat into a folder or making it private ends automatic enrollment. Native child chats inherit the workspace audience. Root placement survives reload, and membership repairs persist through PostgreSQL reloads and member deactivation/reactivation.

The public macOS **0.1.17 → 0.1.18** update passed through the ordinary **Restart to update** action. The app restarted automatically before any manual launch, retained sign-in and the same open conversation, and no longer offered a redundant update.

Mirrored channels now appear under their actual source: Slack workspace, GitHub repository or Zergboard board. Same-name sources remain separate by identity, and missing identities are not merged by display name. Source groups display the provider icon and support collapse/search without acting as editable permission folders or drag targets. Original filing and canonical paths remain unchanged. Only creatorless legacy classification folders emptied by this projection disappear from navigation; custom folders and folders with children remain. No canonical folder is deleted by this display cleanup.

Shared root files precede shared folders and source groups. Personal folders and root direct chats follow them, retaining their own ordering and participant display. Named child chats remain beneath their actual parent, and Archive stays separate.

## Qualification

**140 unique targeted checks passed:**

| Suite | Passed |
| --- | ---: |
| Server, including 27 root-chat checks | 79 |
| Sidebar | 43 |
| Source-group projection | 16 |
| Actual PostgreSQL regression | 1 |
| Full application | 1 |

Typecheck, the Nuxt production build and sizing checks passed; sizing covered 86 style-bearing source files. Repeated execution of the same viewport case is excluded from the total. The full application test verifies actual default root creation, exact current-human enrollment, future-member read/write without a separate join, preserved private-DM access, and root placement after reload without a generated folder.

Source checks cover provider identity separation and fallback, source metadata forms, preserved permissions/filing/paths, root ordering, personal chat placement, child nesting, archive, collapse/search, legacy-folder cleanup and snapshot permutation invariance. The PostgreSQL regression checks actual membership rows, reload, authoritative incremental replay and lifecycle repair without changing private direct-chat membership.

Scoped mutation results:

| Area | Result |
| --- | --- |
| Source-group projection | 215 killed; 5 reviewed equivalent survivors; 220 unique executed; 45 copy/string mutations excluded |
| Sidebar UI semantic drop guards | 2/2 killed |
| Workspace-root membership and persistence | 60 killed; 1 reviewed equivalent survivor; 61 unique executed; 28 copy/string mutations excluded |

No final mutation timeouts or errors remain. Source follow-ups were reconciled by exact mutant identity; earlier startup timeouts were rerun and are not counted as killed behavior. The five source equivalents concern two opaque GitHub-key casing changes, an initial `hasChildren` value overwritten before return, and two harmless temporary former-folder map entries. The server equivalent removes a redundant metadata upsert while the authoritative membership delta still persists the repair. Narrow follow-up executions are not added again to unique totals. This is scoped coverage, not a claim that every application component was mutated or that the full application suite passed.

The theme checker separately reports the existing undefined `--red` token at `FakeidanBotManager.vue:282`. The same failure is recorded for 0.1.17, and the affected CSS is byte-identical to that deployed parent source.

## Release and update

Frozen application source: `f642b8bffc4790f81b5018808e15682683adb1e1`. A later test-only qualification commit did not change the built application. App and DMG notarization were **Accepted**. Signing, exact entitlements, both packaged architectures, stapling, Gatekeeper, archive extraction and the unchanged stable updater signature passed. Test features are disabled.

All six draft assets were independently downloaded and hashed, then anonymously downloaded and verified after publication at **2026-10-23 06:05:21 UTC**. The hosted universal DMG was downloaded completely and rehashed. The downloads page displays the 0.1.18 universal Mac build and links its [verified download](https://zergchat.com/api/native/download/668149567/Zergchat_0.1.18_universal.dmg).

Both Mac architectures offer 0.1.18 from 0.1.17 and return 204 at 0.1.18. Retained Windows/Linux feeds offer 0.1.10 from 0.1.9 and return 204 at 0.1.10.

The actual update used a separate signed 0.1.17 application copy with the existing authenticated OS application/profile state. Its profile was not isolated. The automatically restarted 0.1.18 executable matched the release SHA-256:

`b249864d6d76336bae31e9c5eebb9d75ac9fd4a77fd89a22dd76a29da83994fc`

The hosted universal DMG SHA-256 is:

`78484daa2b49ff86ec0edadb954f3a038c6fc30697252b941d8e2abd566a18fa`

Native acceptance verified retained sign-in and one unchanged open pane, the Slack source group/provider icon above personal chats, and the absence of the old classification group. The root creation dialog defaulted to no folder and explained inclusion of future workspace members; it was cancelled without creating a production chat. No real Slack message was sent.

Production runs `desktop-0.1.18-f642b8bffc47`, image `sha256:5375aa3c93234604c132db0d9f8b0b8cdcb666ddab3369177cc4fafbbc25745d`, healthy at database schema 27. Deployment changed only the existing machine image through a recorded machine-version compare-and-swap.

The owned rehearsal app was stopped and the installed app's URL handler was restored, independently confirmed by the operating system. The installed 0.1.17 app and executable hash remain unchanged; the stable updater offers it 0.1.18.

## Scope

Only universal macOS was rebuilt. Windows/Linux retain **0.1.10** and Android retains the **0.1.8 pilot**. Intel execution, new Windows/Linux/mobile packages, physical mobile devices and a fresh drag-to-Applications installation were not exercised. Builds and publication were manual; no GitHub Actions build was used, and the desktop release workflow remains `disabled_manually`.

The [sanitized evidence](evidence/desktop-0.1.18-20261022.json) records public hashes, counts and booleans without private paths, process identifiers, workspace/member identifiers or conversation content.
