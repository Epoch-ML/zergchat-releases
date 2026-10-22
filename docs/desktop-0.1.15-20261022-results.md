# Zergchat 0.1.15 — new app icon

The public macOS **0.1.14 → 0.1.15** update passed through the ordinary **Restart to update** action. The app restarted automatically before any manual launch, retained sign-in and the same two conversation panes, and no longer offered a redundant update. The updated app's Finder icon was rendered through macOS and visually inspected.

[0.1.15](https://github.com/Epoch-ML/zergchat-releases/releases/tag/zergchat-v0.1.15) replaces the speech-bubble icon with an emerald and mint dialogue-ribbon Z. The Mac bundle includes native icon layers through 1024 pixels and a separate monochrome menu-bar template. The [downloads page](https://zergchat.com/downloads) offers the signed, notarized universal DMG. Web launcher icons use the same artwork; workspace-specific browser identities remain supported.

## Qualification

Typecheck and 10 existing release/download tests passed. Icon inspection verified valid ICNS layers through 1024 pixels, ICO sizes from 16 through 256 pixels, and a transparent monochrome tray mark. The small app icon was visually reviewed. All 21 iOS, maskable and Apple touch exports were converted to fully opaque RGB without changing decoded RGB pixels or dimensions. Reproducible artwork and conversion instructions are preserved with the source.

Existing coverage was reused for this reversible artwork change. No CSS-detail or mutation tests were added. The universal native release build compiled the platform-specific tray integration.

## Release and update

Both app and DMG notarization were Accepted. Signing, exact entitlements, both binary architectures, stapling, Gatekeeper, archive extraction and the unchanged stable updater signature passed. All six draft assets were independently downloaded and hashed before publication, then anonymously downloaded and checked again afterward. The hosted DMG was downloaded completely and rehashed.

Both Mac architectures offer 0.1.15 from 0.1.14 and the installed 0.1.10 version, and return 204 at 0.1.15. Windows and Linux retain their 0.1.10 updater paths, including tip 204 responses. The desktop downloads page was checked in the browser and displays the 0.1.15 universal DMG.

The actual update test used a separate signed 0.1.14 app with ordinary shared Keychain/WebView storage. Its automatically restarted 0.1.15 executable matched the release binary SHA-256:

`43ee5f3b767f09bb908a78203faf6a2db29e62c385f25354a7d897ded02f7518`

The packaged icon and the automatically updated app's icon both matched the committed ICNS SHA-256:

`04e434bf77686bd873bbfb4c03c739b3523ac1f54603ed05e07fd03931bce5ea`

The owned test app was stopped, and the installed app's URL handler was restored. The installed 0.1.10 app is unchanged and its menu offers the 0.1.15 update, leaving that action for the user. No real Slack message was sent.

The web server runs released source `91885697372cdb4b0d76dd3b7e66c25a6cb6259d` at schema 27, verified healthy after an image-only deployment. All seven public icon/service-worker assets were fetched and matched the released source bytes. Only macOS was rebuilt; Windows/Linux retain 0.1.10 and Android retains the 0.1.8 pilot. Intel execution, new mobile packages and a fresh drag-to-Applications installation were not exercised. No Actions build or workflow change was used.

The [sanitized evidence](evidence/desktop-0.1.15-20261022.json) contains hashes, counts and booleans without private paths, process identifiers, workspace identifiers or chat content.
