# October 22, 2026 desktop bootstrap — results

**macOS public update verified; Linux update verified with a manual A bootstrap;
Windows interactive update remains unverified.** Last updated:
2026-10-22T18:15:11Z. Artifact publication, native startup, fixture tests and
actual public updates are distinct results below.

## Published artifacts and trust

- [A, 0.1.9](https://github.com/Epoch-ML/zergchat-releases/releases/tag/zergchat-v0.1.9): source
  `3707e62dac95fa84e55ab3865cb228d451b7130b`, public request commit
  `f742b77487a3bd0db763d0b82ce474b061b8e159`.
- [B, 0.1.10](https://github.com/Epoch-ML/zergchat-releases/releases/tag/zergchat-v0.1.10): source
  `f33c7ec616fa6d6477e6778e50edff75134a0012`, public request commit
  `2276d578f2a951efc855d729e8ee3bbdf7ac12dc`. Published at
  **2026-10-22T17:49:41Z**, after the Linux packaging repair below.
- Each release contains 16 assets: five Mac files, five Windows files, five
  Linux files and `manual-release-metadata.json`. Every final asset was
  independently downloaded from its draft and compared by size/SHA-256 with
  the staged bytes; GitHub's recorded digests also matched.
- Stable updater root: **55B88A007E16D659**, public-file SHA-256
  `72e69951eb2b25e83adb69fa6da6373e842127cdd6d597b4f95e7572dc60d860`.
  All shipping updater sidecars independently verified against that root.
  The old private-repository 0.1.8 desktop clients require a manual reinstall.
- [Legacy Android continuity](https://github.com/Epoch-ML/zergchat-releases/releases/tag/app-pilot-v0.1.8)
  preserves the original debug APK, version 0.1.8, SHA-256
  `99bca418be149c8f6b6a07ead9704e794c07749aa222502e28755274030bb219`.
  It is separate from the new desktop versions and signed preview pipeline.

The release was prepared manually; no Actions job or Pages feed promotion was
used. Existing protected signing-environment secrets were aligned to the new
bootstrap root without changing reviewers, permissions or workflow settings.
The hosted application facade remains the shipping updater endpoint.

## Native runtime acceptance

| Platform | Observed result | Still unverified |
| --- | --- | --- |
| macOS arm64 | Public A 0.1.9 installed and completed native browser SSO. The actual native “Restart to update” control downloaded and installed public B 0.1.10, then relaunched. Sign-in and the active conversation were retained. Developer ID, Gatekeeper notarization and staple checks passed after the update. | Intel macOS runtime was not exercised. |
| Windows x64 | Genuine MSVC native builds; all four NSIS/MSI version/hash checks and central Tauri updater signatures passed. | GUI startup and A-to-B update in an interactive Windows user session. Service SYSTEM/Session0 probes did not initialize the main WebView2. |
| Linux x86_64 | The corrected exact B AppImage directly starts through standard FUSE and renders the production UI in an x86 QEMU Ubuntu 22.04 guest. After A was manually bootstrapped by extracting its immutable bytes, its real production update menu replaced the original AppImage target with B; B relaunched through standard FUSE. | Ordinary A AppImage installation/startup did not work. Linux sign-in and logged-in state retention were not exercised. |

Mac temporary-key fixture updater scenarios passed separately from the actual
public update above. Windows fixture installers were built and A installed,
but the service-session probes produced no WebView events or first updater request; no successful Windows
fixture update or rejection scenario is claimed. Windows installers do not
have an Authenticode publisher signature.

The installed Mac A application completed native SSO before the update. The
browser external-app confirmation was part of the handoff. The production
updater downloaded, installed and relaunched B without a manual binary copy.
The installed B executable SHA-256 is
`614b840e07d8ef051800bf7f387d93bb9ae8c23e56e1dd405b26f41138e952de`.
Sign-in and active-conversation retention were recorded only as booleans; no
private workspace or conversation content is included in this report.

## Linux packaging correction and preserved failure

The immutable A 0.1.9 AppImage cannot start because the chosen runtime cannot
read the SquashFS compression produced by its initial packaging helper. A's
published assets remain unchanged. Its release body warns of the defect and
points users to repaired B or the separate DEB/RPM packages. No successful
standard Linux 0.1.9-to-0.1.10 automatic upgrade is claimed.

The first B candidate had the same defect. It stayed unpublished. Its files,
hashes, metadata and receipts were retained as an invalidated attempt. Only
four B draft assets were replaced: AppImage, its signature, Linux checksums and
final metadata. The other 12 asset IDs and digests remained unchanged.

Repaired B AppImage: **89,089,216 bytes**, SHA-256
`b86e1a72cd8150bf828b2972a6a233b03bd2700a65f01263c665fa5ebd2498e9`.
It uses the unchanged official Tauri AppDir and official AppImage tools with
explicit **xz** compression and the identified official dynamic runtime.
The final metadata records executable/tool/runtime hashes and exact options.
DEB/RPM package bytes were unchanged.

The actual guest execution used standard AppImage FUSE startup, WebKit sandbox
enabled, Xvfb/X11 and recorded softpipe/software-graphics settings for the
emulated guest. The first rendered AuthGate exposed an uninitialized guest
GNOME keyring; after normal keyring initialization/unlock, the same image
rendered the normal production landing UI. No production Linux login was
performed. A screenshot or this startup pass does not prove an automatic update.

A separate actual production updater exercise then passed from the manually
bootstrapped A application. The real native menu triggered the unmodified
Tauri updater; it replaced the original A outer-file target with the exact
public B AppImage and relaunched B through its standard FUSE runtime. No
harness installation writes followed the click. The old process exited, the
new executable matched B, the full production landing UI rendered, and the
current-version feed returned HTTP 204 with an empty body. The running B ELF
SHA-256 was
`87283acfe72d26d26595b1a1835e1f5bcb95da7142a85404d3556ea58ddcbef3`.
This establishes the updater/install/relaunch flow after manual recovery; it
does not establish ordinary A startup or Linux signed-in state retention.

B metadata SHA-256:
`963feb9f8fc5a70b0ecb7c02e8a802f3376691e3ae13a32cbcc4260b7fab0d9b`.
It preserves the observations known at packaging, including explicit Windows
runtime limits and the original A defect. Later runtime receipts are tracked
separately rather than replacing published bytes.

## Hosted delivery checks

Before B publication, unauthenticated update requests from A 0.1.9 returned
HTTP 204 on all four targets: darwin/aarch64, darwin/x86_64, windows/x86_64 and
linux/x86_64. The operator reports 12 anonymous A download probes passed. The
existing Fly machine, image and topology were retained during the facade
repository-secret change.

After B publication, GitHub returned A before B in the releases list, and the
facade incorrectly continued selecting A. A backend-only correction now sorts
each channel by numeric version, publication time and a deterministic tag tie.
The red regression was committed separately from the implementation. The
live fix preserves the newer concurrent server baseline and schema 27:

- Deployed source: `f742dafc7c439f57fb534da0b629d145f78e3750`.
- Preserved baseline: `2a74adc0a980fea5fc570b6a1238a7ad98f48230`.
- Live image: `sha256:1fa111dd4d7b010266270216b1c13ddc4265af752693ea7ee1632c9301b8aef3`.
- Validation: 137 native Node tests, 38 Playwright tests and application type
  checking passed; all 11 controlled ordering mutations were killed. The 27
  facade cases include permutation, numeric-component, publication-date and
  tag ties.

The compare-and-swap deployment preflight checked the expected live image;
the final machine configuration delta changed only the image. The service is
healthy on schema 27. Desktop source tags and package bytes were unchanged.

After the corrected backend went live, all eight public updater checks passed:
A 0.1.9 received HTTP 200 with B 0.1.10 on darwin/aarch64, darwin/x86_64,
windows/x86_64 and linux/x86_64; B 0.1.10 received HTTP 204 on each target.
Every offered signature exactly matched its published release sidecar.

Twelve anonymous facade download smokes passed for the B desktop artifacts
and legacy Android APK. These checked HTTP range delivery and the published
metadata; most transferred 1,024-byte ranges, while small sidecars were
transferred completely. They supplement the full independent size/SHA-256
verification of all 16 release assets recorded before publication.

Interactive Windows startup and automatic-update acceptance remain
unverified. Feed checks, build success and fixture tests do not establish
that Windows result.

## Source integration follow-up

The combined source branch
[release/zergchat-desktop-bootstrap-current](https://github.com/Epoch-ML/zerg/tree/release/zergchat-desktop-bootstrap-current)
is pinned at `9e402f67c3f1c3edf9587ececfbe118cfbf36c89`. It includes the
server ordering fix, native-versus-web update regression/fix, the five 0.1.10
version records and manual-release documentation on the preserved schema-27
baseline. All 137 native Node tests, 42 Playwright tests and application type
checking passed on Node 22.23.2. A source PR is deferred until the other
workflow's current target branch has been pushed; no other workflow commits
were pushed as part of this release. This follow-up source integration does
not move the published A/B source tags or change their artifacts.

The [sanitized observation record](evidence/bootstrap-20261022.json) includes
the exact executable/image hashes, eight feed results and range-smoke
measurements.

This report contains no credentials, authorization codes, cookies, private chat
content, local user paths or private host/session identifiers. Detailed raw
operator receipts are retained separately.
