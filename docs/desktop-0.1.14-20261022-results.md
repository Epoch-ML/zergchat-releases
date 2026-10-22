# Zergchat 0.1.14 — cohesive composer

The public macOS **0.1.13 → 0.1.14** update passed through the ordinary **Restart to update** action. The replacement process started automatically before any manual launch, kept sign-in and the same two conversation panes, and displayed the new composer in both panes. No redundant update offer remained.

[0.1.14](https://github.com/Epoch-ML/zergchat-releases/releases/tag/zergchat-v0.1.14) gives messages a full-width writing area and a shared bottom toolbar. Matching voice, emoji, formatting and attachment controls sit together, with a compact split Send control on the right. Keyboard navigation, mobile touch targets, scheduling, formatting and voice drafts remain available. [Downloads](https://zergchat.com/downloads) links the notarized universal Mac installer.

## Qualification

39 existing composer browser cases passed, including mobile and split-pane layouts, keyboard focus in light/dark themes, emoji placement, formatting, scheduling, voice recording and failed voice drafts. Typecheck and sizing checks passed. Visual review covered both themes and a 260px dock pane; every direct tool and Send stayed inside that pane, as did its emoji picker. Existing regression coverage was reused for this reversible visual-only change; no CSS-detail or mutation tests were added.

The browser run and typecheck used `0dcc3f1ef2ae743b2acec4e472945e244f976919`. The only subsequent source delta is one unused canonical breakpoint-registry declaration, at the released source `ccc2e7f6267eb31d46446b2eb675a71cefc3b5f1`; the final sizing check passed there.

## Release and update

Both app and DMG notarization were Accepted. Signing, exact entitlements, both binary architectures, stapling, Gatekeeper, archive extraction and the unchanged stable updater signature passed. All six draft assets were downloaded independently and hashed before publication, then downloaded anonymously and checked again afterward. The hosted DMG was downloaded completely and rehashed.

Both Mac architectures offer 0.1.14 from 0.1.13 and from the installed 0.1.10 version, and return 204 at 0.1.14. Windows and Linux retain their 0.1.10 updater paths, including tip 204 responses. The desktop download page was checked in the browser and shows the 0.1.14 universal DMG.

The actual update test used a separate signed 0.1.13 app with ordinary shared Keychain/WebView storage. Its automatically restarted 0.1.14 executable matched the release binary SHA-256:

`39b11a842ec404f1f8808724ac5976a13b927b4529786e168d5287f14d5911ae`

The owned test app and local preview were stopped, and the installed app's URL handler was restored. The installed 0.1.10 app is unchanged and its menu offers the 0.1.14 update, leaving that action for the user. No real Slack message was sent.

The web server runs the same released source at schema 27, verified healthy after an image-only deployment. Only macOS was rebuilt; Windows/Linux retain 0.1.10 and Android retains the 0.1.8 pilot. Intel execution and a fresh drag-to-Applications installation were not exercised. No Actions build or workflow change was used.

The [sanitized evidence](evidence/desktop-0.1.14-20261022.json) contains hashes, counts and booleans without private paths, process identifiers, workspace identifiers or chat content.
