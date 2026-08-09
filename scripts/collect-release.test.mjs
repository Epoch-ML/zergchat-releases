import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import { collectSignedRelease } from "./collect-release.mjs";

const sourceSha = "0123456789abcdef0123456789abcdef01234567";
const requestedAt = "2026-08-05T20:00:00.000Z";
const updaterPublicKey = "trusted-independent-updater-key\n";
const temporaryDirectories = [];

async function makeFixture(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "zergchat-signed-release-"));
  temporaryDirectories.push(root);
  const inputDirectory = join(root, "input");
  const outputDirectory = join(root, "output");
  const publicKeyPath = join(root, "trusted.pubkey");
  await mkdir(inputDirectory, { recursive: true });
  await writeFile(
    join(inputDirectory, "Zergchat_0.1.9-preview.1_universal.app.tar.gz"),
    "signed app archive",
  );
  await writeFile(
    join(inputDirectory, "Zergchat_0.1.9-preview.1_universal.app.tar.gz.sig"),
    "encoded updater signature\n",
  );
  await writeFile(
    join(inputDirectory, "Zergchat_0.1.9-preview.1_universal.dmg"),
    "signed disk image",
  );
  await writeFile(join(inputDirectory, "updater.pubkey"), updaterPublicKey);
  await writeFile(publicKeyPath, updaterPublicKey);
  await writeFile(join(inputDirectory, "build-metadata.json"), `${JSON.stringify({
    schema_version: 1,
    product: "Zergchat",
    version: "0.1.9-preview.1",
    channel: "preview",
    release_tag: "zergchat-preview-v0.1.9-preview.1",
    source_sha: sourceSha,
    platform: "darwin-universal",
    apple_notarized: false,
    ...overrides,
  }, null, 2)}\n`);
  return { inputDirectory, outputDirectory, publicKeyPath };
}

function previewRequest(overrides = {}) {
  return {
    channel: "preview",
    requestedAt,
    releaseTag: "zergchat-preview-v0.1.9-preview.1",
    sourceSha,
    version: "0.1.9-preview.1",
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("trusted Zergchat updater release collection", () => {
  it("creates a signed immutable manifest from verified build bytes", async () => {
    const fixture = await makeFixture();
    const result = await collectSignedRelease({
      ...fixture,
      releaseRepository: "Epoch-ML/zergchat-releases",
      request: previewRequest(),
    });

    assert.deepEqual(result.manifest, {
      version: "0.1.9-preview.1",
      notes: "",
      pub_date: requestedAt,
      platforms: {
        "darwin-aarch64": {
          signature: "encoded updater signature",
          url: "https://github.com/Epoch-ML/zergchat-releases/releases/download/zergchat-preview-v0.1.9-preview.1/Zergchat_0.1.9-preview.1_universal.app.tar.gz",
        },
        "darwin-x86_64": {
          signature: "encoded updater signature",
          url: "https://github.com/Epoch-ML/zergchat-releases/releases/download/zergchat-preview-v0.1.9-preview.1/Zergchat_0.1.9-preview.1_universal.app.tar.gz",
        },
      },
    });
    assert.deepEqual(result.assets.map((path) => path.split("/").at(-1)), [
      "Zergchat_0.1.9-preview.1_universal.app.tar.gz",
      "Zergchat_0.1.9-preview.1_universal.app.tar.gz.sig",
      "Zergchat_0.1.9-preview.1_universal.dmg",
      "checksums.txt",
      "release-metadata.json",
    ]);
    const metadata = JSON.parse(
      await readFile(join(fixture.outputDirectory, "release-metadata.json"), "utf8"),
    );
    assert.equal(metadata.source_sha, sourceSha);
    assert.equal(metadata.platform, "darwin-universal");
    assert.equal(metadata.apple_notarized, false);
    assert.deepEqual(metadata.artifacts[0], {
      name: "Zergchat_0.1.9-preview.1_universal.app.tar.gz",
      sha256: createHash("sha256").update("signed app archive").digest("hex"),
    });
  });

  it("maps both macOS architectures to the same universal updater bytes", async () => {
    const fixture = await makeFixture();
    const result = await collectSignedRelease({
      ...fixture,
      releaseRepository: "Epoch-ML/zergchat-releases",
      request: previewRequest(),
    });

    assert.deepEqual(
      result.manifest.platforms["darwin-x86_64"],
      result.manifest.platforms["darwin-aarch64"],
    );
  });

  it("fails closed on build provenance or independent trust-root mismatches", async () => {
    const wrongSource = await makeFixture({ source_sha: "abcdef0123456789abcdef0123456789abcdef01" });
    await assert.rejects(
      collectSignedRelease({
        ...wrongSource,
        releaseRepository: "Epoch-ML/zergchat-releases",
        request: previewRequest(),
      }),
      /build source SHA does not match the release request/,
    );

    const wrongKey = await makeFixture();
    await writeFile(join(wrongKey.inputDirectory, "updater.pubkey"), "tag-selected-other-key\n");
    await assert.rejects(
      collectSignedRelease({
        ...wrongKey,
        releaseRepository: "Epoch-ML/zergchat-releases",
        request: previewRequest(),
      }),
      /source updater key does not match the independent release trust root/,
    );

    const wrongPlatform = await makeFixture({ platform: "darwin-aarch64" });
    await assert.rejects(
      collectSignedRelease({
        ...wrongPlatform,
        releaseRepository: "Epoch-ML/zergchat-releases",
        request: previewRequest(),
      }),
      /build platform must be darwin-universal/,
    );
  });

  it("requires notarization for stable and exactly one non-empty signed artifact set", async () => {
    const stable = await makeFixture({
      version: "0.1.9",
      channel: "stable",
      release_tag: "zergchat-v0.1.9",
      apple_notarized: false,
    });
    await assert.rejects(
      collectSignedRelease({
        ...stable,
        releaseRepository: "Epoch-ML/zergchat-releases",
        request: previewRequest({
          version: "0.1.9",
          channel: "stable",
          releaseTag: "zergchat-v0.1.9",
        }),
      }),
      /stable release requires verified Apple notarization/,
    );

    const emptySignature = await makeFixture();
    await writeFile(
      join(emptySignature.inputDirectory, "Zergchat_0.1.9-preview.1_universal.app.tar.gz.sig"),
      "  \n",
    );
    await assert.rejects(
      collectSignedRelease({
        ...emptySignature,
        releaseRepository: "Epoch-ML/zergchat-releases",
        request: previewRequest(),
      }),
      /updater signature must not be empty/,
    );

    const ambiguous = await makeFixture();
    await writeFile(join(ambiguous.inputDirectory, "Zergchat-copy.app.tar.gz"), "other archive");
    await assert.rejects(
      collectSignedRelease({
        ...ambiguous,
        releaseRepository: "Epoch-ML/zergchat-releases",
        request: previewRequest(),
      }),
      /expected exactly one macOS updater archive; found 2/,
    );

    const misnamed = await makeFixture();
    await rename(
      join(misnamed.inputDirectory, "Zergchat_0.1.9-preview.1_universal.app.tar.gz"),
      join(misnamed.inputDirectory, "Zergchat_0.1.9-preview.2_universal.app.tar.gz"),
    );
    await rename(
      join(misnamed.inputDirectory, "Zergchat_0.1.9-preview.1_universal.app.tar.gz.sig"),
      join(misnamed.inputDirectory, "Zergchat_0.1.9-preview.2_universal.app.tar.gz.sig"),
    );
    await assert.rejects(
      collectSignedRelease({
        ...misnamed,
        releaseRepository: "Epoch-ML/zergchat-releases",
        request: previewRequest(),
      }),
      /updater archive name must be Zergchat_0\.1\.9-preview\.1_universal\.app\.tar\.gz/,
    );

    const unexpected = await makeFixture();
    await writeFile(join(unexpected.inputDirectory, "unreviewed.txt"), "extra input");
    await assert.rejects(
      collectSignedRelease({
        ...unexpected,
        releaseRepository: "Epoch-ML/zergchat-releases",
        request: previewRequest(),
      }),
      /release input contains unexpected entries: unreviewed\.txt/,
    );
  });
});
