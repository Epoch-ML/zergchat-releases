# Manual desktop release through the hosted facade

This is the operator path for the October 22, 2026 desktop bootstrap when
GitHub Actions cannot run. It prepares macOS, Windows and Linux together.
It does not enable, dispatch or change a workflow, alter repository protections,
promote GitHub Pages, or change an existing published release.

The existing `collect-release.mjs`, `verify-release-payload.mjs` and Pages
promotion are deliberately macOS-only. They remain unchanged. Do not pass a
three-platform payload to them or describe this manual run as their execution.

## Candidate and immutable requests

| Role | Version | Public/source tag |
| --- | --- | --- |
| A: install first | 0.1.9 | `zergchat-v0.1.9` |
| B: update target | 0.1.10 | `zergchat-v0.1.10` |

A pins private source `3707e62dac95fa84e55ab3865cb228d451b7130b`; B pins
`f33c7ec616fa6d6477e6778e50edff75134a0012` in `Epoch-ML/zerg`. B corrects the
native shell update indicator so a newer hosted web build does not offer a
reload of the unchanged bundled frontend. Each `requested_at` is its source
commit's canonical UTC timestamp, not a claim that a release has been published. Their source refs are intended refs; request
validation alone does not establish that those tags exist.

Validate each request with `node scripts/release-request.mjs REQUEST.json`.
Before publication, the owning human verifies each private source tag peels to
the pinned source SHA. Each public request must be added in its own single-file,
single-parent commit, as required by the existing request policy. The public
tag must peel to that request-addition commit. A documentation commit must be
separate. Never move, delete or reuse a published tag or replace release bytes.

The active stable bootstrap root is `keys/zergchat-stable-updater.pubkey`,
SHA-256 `72e69951eb2b25e83adb69fa6da6373e842127cdd6d597b4f95e7572dc60d860`,
minisign key ID `55B88A007E16D659`. The terminal newline is part of this hash.
Before any public build or tag existed, the owning human created this root
because the password for the previous prepared root `1E62C9A6F112AF0D` was
unavailable. The historical root's SHA-256 was
`84b7103cf525be45876e041cb78e425bdea3d8de596273524277d6b4a701c09a`.
Its original private files remain untouched. This is the first public stable
bootstrap; it does not rotate an already-published public build's trust.

The active manual signer uses the encrypted key under the local
`stable-bootstrap-20261022` release-key directory and the Keychain service
`org.epochml.zergchat.stable-updater.20261022`. Never print or export that
password. Both A and B must embed the new public root and verify against it.
The existing GitHub `zergchat-stable-updater` environment still holds the old
key configuration; no GitHub secret was updated by this preparation. Its
workflow must stay disabled until the owning human replaces both encrypted
signing secrets and independently verifies the new key. A future automated
source stage must also satisfy the unchanged byte-for-byte public-key gate.
A missing manual
signing credential still stops publication; it never permits unsigned bytes.

## Build and collect each version

Generate the frontend from the frozen source with
`NUXT_PUBLIC_API_BASE_URL=https://zergchat.com` and
`ZERGCHAT_NATIVE_RELEASE=1`, before exposing Apple or updater credentials.
Generate the release overlay with the selected version, channel `stable`, the
canonical stable public key, and update base `https://zergchat.com`.
Its implicit frontend build hook must remain empty. Both versions keep bundle
identifier `com.zergai.zergchat`, the same supported Apple identity, and the
same stable updater root.

Use the normal shipping frontend and updater action. Never enable
`native-update-e2e`, its loopback transport exception or its test driver in a
published binary. The fixture updater harness is useful separately, but cannot
stand in for the actual downloaded application's A-to-B proof.

Prepare a fresh payload directory for each version. Include the complete set
before publishing because Immutable Releases prevents adding a later platform.

| Platform | Required assets | Additional manual packages |
| --- | --- | --- |
| macOS universal | `Zergchat_VERSION_universal.dmg`, `Zergchat_VERSION_universal.app.tar.gz`, archive `.sig`, `macos-notarized.txt` | None |
| Windows x64 | `Zergchat_VERSION_x64-setup.exe`, installer `.sig` | MSI and its signature when built |
| Linux x86_64 | AppImage whose filename includes `amd64`, `x64` or `x86_64`, AppImage `.sig` | DEB/RPM when built |

The Windows automatic updater selects a filename ending in `-setup.exe`.
Linux automatic updates use AppImage; DEB/RPM remain manual installations.
Do not rename an artifact after calculating its checksum. Each binary must be
nonempty and smaller than the hosted facade's 2 GiB limit. Exclude private
keys, credentials, source archives, local paths, debug shells and build caches.

For macOS, independently verify Developer ID signing, exact entitlements,
Gatekeeper acceptance, notarization and stapling for the finished app and DMG.
Only then write `macos-notarized.txt` with the tag, version, identity/team and
successful checks. The facade trusts this marker; its existence is not proof
that those external checks ran. An ad-hoc or unnotarized app must not receive it.

Verify each updater signature against the independent stable root before any
upload. Tauri `.sig` files contain base64-encoded minisign text. Decode into a
temporary file, never over the shipped signature, and use the real verifier:

```bash
# Run from this public checkout; BUNDLE is one finished updater binary.
VERIFY_DIR="$(mktemp -d)"
base64 --decode < keys/zergchat-stable-updater.pubkey > "$VERIFY_DIR/public.txt"
base64 --decode < "$BUNDLE.sig" > "$VERIFY_DIR/signature.txt"
minisign -Vm "$BUNDLE" -x "$VERIFY_DIR/signature.txt" \
  -P "$(tail -n 1 "$VERIFY_DIR/public.txt")"
rm -rf "$VERIFY_DIR"
```

Repeat for the macOS archive, Windows NSIS installer and Linux AppImage.
Use the platform's equivalent base64 decode flag where necessary. Public key
arguments are public; private signing passwords must never enter command
history, logs or artifacts.

Create sorted, LF-terminated `checksums-macos.txt`, `checksums-windows.txt` and
`checksums-linux.txt` in the payload. Each line is `SHA256  filename` and names
the exact uploaded bytes. Independently recompute every digest after transfer.
Include `manual-release-metadata.json` recording mode
`manual-desktop-facade`, source/request/public-root hashes, version, channel,
build host/tool versions, and every asset's name, byte count and SHA-256.
Record executed checks and unexecuted checks separately. Do not call this file
the macOS pipeline's `release-metadata.json` or imply its validator accepted it.

## Draft, compare, then publish A

After the owning human creates and verifies the immutable tags, prepare a
draft with the reviewed notes and exact completed payload:

```bash
gh release create "$TAG" --repo Epoch-ML/zergchat-releases \
  --verify-tag --draft --title "Zergchat $VERSION" --notes-file "$NOTES"
gh release upload "$TAG" "$PAYLOAD"/* --repo Epoch-ML/zergchat-releases
```

Do not use `--clobber`. On retry, compare the existing draft's tag target,
metadata, exact asset names, sizes and downloaded SHA-256 values. Upload only
missing assets when every existing byte matches; otherwise stop. Before
publishing, download the whole draft payload into an independent directory,
verify all hashes and signatures again, and verify anonymous access after
publication. Final publication is a separate coordinated operator action:

```bash
gh release edit "$TAG" --repo Epoch-ML/zergchat-releases --draft=false
```

No Actions job is needed or dispatched by these release commands. Keep the
existing manually disabled release workflow and repository protections intact.

## Hosted facade and Android continuity

This manual desktop bootstrap uses the existing HTTPS application facade:

```text
https://zergchat.com/api/native/update/stable/{{target}}/{{arch}}/{{current_version}}
```

After validated A assets exist, the coordinated production configuration is:

```text
ZERGCHAT_NATIVE_RELEASE_REPO=Epoch-ML/zergchat-releases
ZERGCHAT_NATIVE_STABLE_TAG_PREFIX=zergchat-v
```

The public repository needs no private release-read credential. Do not print,
copy or rotate an existing token as part of this non-secret configuration
change. The facade caches metadata for 60 seconds by default. It exposes only
digest-verified app-owned download URLs and requires signatures for updater
offers. Check `/downloads`, `/api/native/releases` and the update endpoints.
GitHub Pages `stable/latest.json`, `preview/latest.json` and `release-data`
remain untouched and must not be advertised as promoted by this run.

Switching repositories would otherwise remove the existing Android debug
download. Before switching, prepare a separately identified legacy continuity
release `app-pilot-v0.1.8` containing the exact existing APK and checksum.
Retain `ZERGCHAT_NATIVE_PILOT_TAG_PREFIX=app-pilot-v` for this compatibility
release. It is not a canonical desktop request or a new Android build.

| Legacy source | Exact value |
| --- | --- |
| Repository/release | `Epoch-ML/zerg`, `app-pilot-v0.1.8` |
| Asset | `app-universal-debug.apk`, ID `461572011` |
| Bytes | `382664545` |
| SHA-256 | `99bca418be149c8f6b6a07ead9704e794c07749aa222502e28755274030bb219` |

Download through the authenticated source API without exposing its token,
recompute that SHA-256, and record the source release/asset in the continuity
notes. Publish only these original debug APK bytes and their checksum, with
the existing debug/sideload/no-auto-update description. Do not upload the debug
AAB as a download or claim store signing. The operator creates and verifies
the separate compatibility tag before `--verify-tag` publication. No legacy
macOS artifact or old private source key is carried forward.

## Actual A-to-B acceptance

1. Confirm A is anonymously downloadable on all three platform entries with
   the correct version, architecture, size and SHA-256. Updater checks from A
   itself must return no newer version. Legacy 0.1.8 clients require a manual
   reinstall because their embedded updater root differs.
2. Install and launch the actual A artifact on each real supported OS. Record
   its version, app identifier, signing result, install location and process.
   Keep controlled chat/session state whose retention can be checked afterward.
3. Only after A is installed, publish the complete immutable B release.
   Wait for facade cache expiry. Every A-to-B update response must be HTTP 200
   with version 0.1.10, the correct platform bundle URL and its verified signature.
4. Use the ordinary application's **Restart to update** action, including its
   real signed download, installation and relaunch. Record the new process,
   version B and retained state. A feed response or fixture harness pass alone
   does not prove installation.
5. Confirm B now receives no newer update. Download and hash the rendered
   assets anonymously. Record missing runtime hosts or failed checks as gaps;
   do not replace them with cross-compilation claims.

The facade's platform names are `darwin/aarch64`, `darwin/x86_64`,
`windows/x86_64` and `linux/x86_64`. A universal macOS archive must serve both
Mac architectures; actual Intel execution remains a separate host check.

If publication stops between A and B, leave A intact and report the incomplete
update proof. Roll forward with a newer version for a shipped defect. Never
replace a signed artifact or rewind a release tag/feed to simulate rollback.
