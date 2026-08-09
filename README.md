# Zergchat Releases

This repository is the public distribution and updater trust boundary for the
native ZergChat desktop application. Private source remains in
**Epoch-ML/zerg**; this repository holds validated release requests, public
artifacts, independent channel updater public keys, and GitHub Pages feeds.

## Release flow

1. A protected **zergchat-v\*** or **zergchat-preview-v\*** source tag emits one
   deterministic JSON request artifact. Its timestamp is the canonical UTC
   rendering of the source commit timestamp. The source workflow has no public
   checkout, environment, secret, or cross-repository write authority.
2. A human submits and merges a pull request that adds only
   **requests/&lt;tag&gt;.json** as a single-parent commit, then creates the
   protected public tag at that exact request-addition commit. The public
   workflow is manually dispatched from **main** with the request path. It
   requires the remote tag to exist and peel to the request commit before it
   enters a build environment, then checks out the exact private source SHA and
   matching source tag and compares both channel updater keys byte for byte
   with the independent roots under [keys](keys/).
3. Source tests and audits run before any signing credentials are exposed. The
   source Tauri configuration and huddle usage descriptions are checked, and
   its macOS entitlement file must match the canonical public file under
   [macos](macos/) byte for byte. The app is compiled with no updater or Apple
   secrets and packaged as a bounded, link-free source stage.
4. A fresh macOS job checks out only this public repository, validates and
   extracts the source archive with path, type, entry-count, compressed-size,
   and uncompressed-size limits, and never executes its payload. Preview apps
   are ad-hoc signed. Stable apps receive Developer ID signing, notarization,
   and stapling only after hostile-input validation. Only the outer application
   signature receives the canonical huddle/media entitlements, and both the
   signing job and fresh signed-app smoke verify their exact semantic contents.
   Temporary credentials are deleted even after failure.
5. A separate Ubuntu job checks out only this public repository, downloads the
   finished app archive, and exposes the updater private key to a single Tauri
   signer command. Private source and the updater key never coexist.
6. The publisher creates a draft GitHub Release, uploads only missing assets,
   verifies exact names and bytes, and publishes it. A retry resumes only when
   release metadata, tag target, asset set, and every existing byte match. This
   job has release-write authority but no feed deploy credential.
7. After public release bytes compare exactly, a fresh read-only job enters the
   **zergchat-feed** environment. It revalidates the immutable request, tag, and
   signed feed inputs before committing only the channel feed to
   **release-data**. A deterministic generic artifact is uploaded, and a custom
   OIDC deployment client calls the GitHub Pages Deployments API without an
   action that reconfigures the site or cancels a recoverable queue. The
   workflow then compares the live HTTPS manifest. The feed is published last
   and cannot move to an older semantic version.

Canonical updater endpoints (a channel exists only after its first promotion):

- Stable: https://epoch-ml.github.io/zergchat-releases/stable/latest.json
- Preview: https://epoch-ml.github.io/zergchat-releases/preview/latest.json
- Immutable metadata: CHANNEL/releases/VERSION.json

### Pages branch topology

Before the first release, cutover may contain only the root `.nojekyll` and `index.html` files.
Each `preview` or `stable` subtree is optional; if present, must contain `latest.json` plus at least one matching `releases/VERSION.json`, with the channel and immutable-version naming rules enforced together.
Live preflight requires at least one complete channel subtree, while each
promotion separately proves and advances only its selected channel. A
preview-first launch therefore does not require fake stable feed bytes.

The preflight accepts only the exact root topology: normal `100644` blobs and
`040000` trees, paths of at most 512 characters, at most 4,096 entries, at most
1 MiB per file, and at most 64 MiB in aggregate. `.nojekyll` must be empty;
every other tracked blob must be non-empty. Copies under `site/`, legacy root
feed names, links, special entries, partial channel groups, and unrelated files
fail closed.

The custom OIDC deployment client calls the GitHub Pages Deployments API with
the exact generic artifact ID and workflow run commit. It does not cancel a queued deployment
when the local 30-minute wait expires, so an idempotent retry can observe the
same deployment; terminal failure and permission states fail immediately. The
final gate downloads the promoted release payload separately and compares the
selected live `latest.json` bytes over HTTPS.

Legacy native releases through 0.1.8 were published from the private source
repository. Their macOS update facade currently withholds the artifacts, their
private GitHub download URLs are not anonymously usable, and those clients do
not trust the new channel-specific roots in this repository. Every such
installation therefore needs one manual installation of the first release
from this public boundary. Automatic preview or stable channel updates begin
only between releases that embed the corresponding new root below.

## Repository configuration

Repository-wide Actions secrets: **none**.

Build and Apple environments:

- **zergchat-preview-build** contains only **ZERG_SOURCE_DEPLOY_KEY**, the read-only
  deploy key for Epoch-ML/zerg.
- **zergchat-stable-build** contains only **ZERG_SOURCE_DEPLOY_KEY**.
- **zergchat-apple-preview** contains no secrets.
- **zergchat-apple-stable** contains:
  - **ZERGCHAT_APPLE_CERTIFICATE**
  - **ZERGCHAT_APPLE_CERTIFICATE_PASSWORD**
  - **ZERGCHAT_APPLE_SIGNING_IDENTITY**
  - **ZERGCHAT_APPLE_API_ISSUER**
  - **ZERGCHAT_APPLE_API_KEY_ID**
  - **ZERGCHAT_APPLE_API_PRIVATE_KEY**

Updater environments:

- **zergchat-preview-updater** contains:
  - **ZERGCHAT_PREVIEW_TAURI_SIGNING_PRIVATE_KEY**
  - **ZERGCHAT_PREVIEW_TAURI_SIGNING_PRIVATE_KEY_PASSWORD**
- **zergchat-stable-updater** contains:
  - **ZERGCHAT_STABLE_TAURI_SIGNING_PRIVATE_KEY**
  - **ZERGCHAT_STABLE_TAURI_SIGNING_PRIVATE_KEY_PASSWORD**
- **zergchat-feed** contains only **ZERGCHAT_FEED_DEPLOY_KEY**, scoped to publishing the
  protected **release-data** branch.

No build environment contains Apple or updater private keys. No Apple or
updater environment contains a source key, and neither signer can write the
feed. The GitHub Release publisher and feed promoter also run on separate
hosts: the publisher never enters **zergchat-feed**, and the feed promoter has only
`contents: read` plus the branch-scoped deploy key.

Preview and stable applications embed distinct updater roots:

- [keys/zergchat-preview-updater.pubkey](keys/zergchat-preview-updater.pubkey), key ID
  **B560202AC690AEF3**
- [keys/zergchat-stable-updater.pubkey](keys/zergchat-stable-updater.pubkey), key ID
  **1E62C9A6F112AF0D**

The stable feed can therefore never accept an archive signed by the preview
identity, even if an ad-hoc preview app is otherwise valid.

The private source repository has no desktop-release environment, public
repository deploy key, or repository-wide release secret. Its tag workflow
only uploads the deterministic request artifact for human review.

Both channel build and updater environments, plus the stable Apple environment,
require a human reviewer. Keep these controls enabled:

- Actions may write release contents only from the trusted workflow.
- Preview and stable build/updater environments, and stable Apple signing, have
  required reviewers. The secret-free preview Apple environment does not.
- Release and source tags cannot be updated or deleted.
- Only the owning humans may create **zergchat-v\*** and **zergchat-preview-v\*** public
  tags; Actions and deploy keys cannot bypass those tag rules.
- Immutable Releases is enabled.
- Main requires a pull request; only the owning human may bypass that rule.
- Main and release-data reject force pushes and deletion.
- GitHub Pages receives one deterministic `github-pages` generic artifact and
  deploys it through the bounded custom OIDC client; no configuration or
  deployment action can mutate or cancel the flow implicitly.

The public release request commit is itself immutable: its entire change is one
added request file. Manual retries resolve that original addition commit,
recheck the file bytes, and repeatedly verify the pre-existing public tag at
that commit. `gh release create --verify-tag` may create only the GitHub Release
record; the workflow never creates, moves, or pushes the tag.

Apple Developer ID, notarization API, and updater private keys must come from
the owning human/team accounts. Never commit, print, or transfer private key
material through release artifacts.

## Local verification

    npm ci
    npm audit --audit-level=moderate
    npm test
    npm run test:mutation:collect
    npm run test:mutation:payload
    npm run test:mutation:request
    npm run test:mutation:signing
    actionlint .github/workflows/release.yml

Generated mutation and dependency directories are ignored.
