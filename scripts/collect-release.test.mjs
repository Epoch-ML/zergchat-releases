import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, it } from "node:test";
import { promisify } from "node:util";

import { collectSignedRelease } from "./collect-release.mjs";

const sourceSha = "0123456789abcdef0123456789abcdef01234567";
const requestedAt = "2026-08-05T20:00:00.000Z";
const updaterPublicKey = "trusted-independent-updater-key\n";
const temporaryDirectories = [];
const execFileAsync = promisify(execFile);

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
  return { inputDirectory, outputDirectory, publicKeyPath, root };
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

function rawPreviewRequest(updaterPublicKeySha256) {
  return {
    schema_version: 1,
    product: "zergchat-desktop",
    channel: "preview",
    version: "0.1.9-preview.1",
    release_tag: "zergchat-preview-v0.1.9-preview.1",
    source_repository: "Epoch-ML/zerg",
    source_sha: sourceSha,
    source_ref: "refs/tags/zergchat-preview-v0.1.9-preview.1",
    requested_at: requestedAt,
    updater_public_key_sha256: updaterPublicKeySha256,
  };
}

async function collectPreview(fixture, overrides = {}) {
  return collectSignedRelease({
    ...fixture,
    releaseRepository: "Epoch-ML/zergchat-releases",
    request: previewRequest(),
    ...overrides,
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("trusted Zergchat updater release collection", () => {
  it("creates a signed immutable manifest from verified build bytes", async () => {
    const fixture = await makeFixture();
    await mkdir(join(fixture.outputDirectory, "stale"), { recursive: true });
    await writeFile(join(fixture.outputDirectory, "stale", "old.txt"), "old output");
    const result = await collectPreview(fixture);

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
    const expectedArtifacts = [
      ["Zergchat_0.1.9-preview.1_universal.app.tar.gz", "signed app archive"],
      ["Zergchat_0.1.9-preview.1_universal.app.tar.gz.sig", "encoded updater signature\n"],
      ["Zergchat_0.1.9-preview.1_universal.dmg", "signed disk image"],
    ].map(([name, bytes]) => ({
      name,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }));
    assert.deepEqual(metadata, {
      schema_version: 1,
      product: "Zergchat",
      version: "0.1.9-preview.1",
      channel: "preview",
      platform: "darwin-universal",
      source_sha: sourceSha,
      apple_notarized: false,
      artifacts: expectedArtifacts,
    });
    assert.equal(
      await readFile(join(fixture.outputDirectory, "checksums.txt"), "utf8"),
      `${expectedArtifacts
        .map(({ name, sha256 }) => `${sha256}  ${name}`)
        .sort()
        .join("\n")}\n`,
    );
    await assert.rejects(
      readFile(join(fixture.outputDirectory, "stale", "old.txt")),
      (error) => error.code === "ENOENT",
    );
  });

  it("maps both macOS architectures to the same universal updater bytes", async () => {
    const fixture = await makeFixture();
    const result = await collectPreview(fixture);

    assert.deepEqual(
      result.manifest.platforms["darwin-x86_64"],
      result.manifest.platforms["darwin-aarch64"],
    );
  });

  it("rejects malformed option and output boundaries", async () => {
    const fixture = await makeFixture();
    const invalidOptions = [
      ["inputDirectory", null, /input directory is required/],
      ["inputDirectory", 42, /input directory is required/],
      ["outputDirectory", "  ", /output directory is required/],
      ["outputDirectory", 42, /output directory is required/],
      ["publicKeyPath", null, /independent updater public key is required/],
      ["publicKeyPath", 42, /independent updater public key is required/],
      ["releaseRepository", "  ", /release repository is required/],
      ["releaseRepository", 42, /release repository is required/],
    ];
    for (const [field, value, error] of invalidOptions) {
      await assert.rejects(collectPreview(fixture, { [field]: value }), error);
    }
    for (const releaseRepository of [
      "!Epoch-ML/zergchat-releases",
      "Epoch-ML/zergchat-releases!",
      "Epoch-ML/zergchat-releases/extra",
    ]) {
      await assert.rejects(
        collectPreview(fixture, { releaseRepository }),
        /release repository must use owner\/name syntax/,
      );
    }
    for (const outputDirectory of ["/", fixture.inputDirectory, fixture.inputDirectory.slice(0, -6)]) {
      await assert.rejects(
        collectPreview(fixture, { outputDirectory }),
        /release output directory is unsafe/,
      );
    }

    const trimmed = await makeFixture();
    const result = await collectPreview(trimmed, {
      inputDirectory: `  ${trimmed.inputDirectory}  `,
      outputDirectory: `  ${trimmed.outputDirectory}  `,
      publicKeyPath: `  ${trimmed.publicKeyPath}  `,
      releaseRepository: "  Epoch-ML/zergchat-releases  ",
    });
    assert.equal(
      result.manifest.platforms["darwin-aarch64"].url,
      "https://github.com/Epoch-ML/zergchat-releases/releases/download/zergchat-preview-v0.1.9-preview.1/Zergchat_0.1.9-preview.1_universal.app.tar.gz",
    );
  });

  it("rejects every build metadata field that is not request-bound", async () => {
    const cases = [
      [{ schema_version: 2 }, /build metadata schema or product is invalid/],
      [{ product: "Other" }, /build metadata schema or product is invalid/],
      [{ version: "0.1.9-preview.2" }, /build version does not match/],
      [{ channel: "stable" }, /build channel does not match/],
      [{ release_tag: "zergchat-preview-v0.1.9-preview.2" }, /build release tag does not match/],
      [{ source_sha: "abcdef0123456789abcdef0123456789abcdef01" }, /build source SHA does not match/],
      [{ platform: "darwin-aarch64" }, /build platform must be darwin-universal/],
      [{ apple_notarized: true }, /preview build metadata must record no Apple notarization/],
    ];
    for (const [metadata, error] of cases) {
      const fixture = await makeFixture(metadata);
      await assert.rejects(collectPreview(fixture), error);
    }

    const nullMetadata = await makeFixture();
    await writeFile(join(nullMetadata.inputDirectory, "build-metadata.json"), "null\n");
    await assert.rejects(
      collectPreview(nullMetadata),
      /build metadata schema or product is invalid/,
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

    const unexpectedDirectory = await makeFixture();
    await mkdir(join(unexpectedDirectory.inputDirectory, "unreviewed-directory"));
    await assert.rejects(
      collectPreview(unexpectedDirectory),
      /release input contains unexpected entries: unreviewed-directory/,
    );

    const misnamedDiskImage = await makeFixture();
    await rename(
      join(misnamedDiskImage.inputDirectory, "Zergchat_0.1.9-preview.1_universal.dmg"),
      join(misnamedDiskImage.inputDirectory, "Zergchat_0.1.9-preview.2_universal.dmg"),
    );
    await assert.rejects(
      collectPreview(misnamedDiskImage),
      /disk image name must be Zergchat_0\.1\.9-preview\.1_universal\.dmg/,
    );

    const ambiguousDiskImage = await makeFixture();
    await writeFile(join(ambiguousDiskImage.inputDirectory, "Zergchat-copy.dmg"), "other image");
    await assert.rejects(
      collectPreview(ambiguousDiskImage),
      /expected exactly one macOS disk image; found 2/,
    );

    const linkedUnexpected = await makeFixture();
    await symlink(
      join(linkedUnexpected.inputDirectory, "build-metadata.json"),
      join(linkedUnexpected.inputDirectory, "unreviewed-link"),
    );
    await assert.rejects(
      collectPreview(linkedUnexpected),
      /release input contains unexpected entries: unreviewed-link/,
    );
  });

  it("collects through the workflow CLI and emits its public output contract", async () => {
    const fixture = await makeFixture();
    const committedKeyPath = resolve("keys", "zergchat-preview-updater.pubkey");
    await copyFile(committedKeyPath, join(fixture.inputDirectory, "updater.pubkey"));
    const committedKey = await readFile(committedKeyPath);
    const requestPath = join(fixture.root, "zergchat-preview-v0.1.9-preview.1.json");
    await writeFile(
      requestPath,
      `${JSON.stringify(rawPreviewRequest(createHash("sha256").update(committedKey).digest("hex")), null, 2)}\n`,
    );
    const githubOutput = join(fixture.root, "github-output.txt");
    const execution = await execFileAsync(
      process.execPath,
      [
        resolve("scripts", "collect-release.mjs"),
        requestPath,
        fixture.inputDirectory,
        fixture.outputDirectory,
      ],
      { env: { ...process.env, GITHUB_OUTPUT: githubOutput } },
    );
    assert.deepEqual(JSON.parse(execution.stdout), { assetCount: 5 });
    assert.equal(execution.stderr, "");
    assert.equal(
      await readFile(githubOutput, "utf8"),
      `release_dir=${resolve(fixture.outputDirectory)}\n`,
    );
    assert.equal(
      JSON.parse(await readFile(join(fixture.outputDirectory, "latest.json"), "utf8")).version,
      "0.1.9-preview.1",
    );

    await assert.rejects(
      execFileAsync(process.execPath, [resolve("scripts", "collect-release.mjs")]),
      (error) => error.code === 1 && error.stderr.includes("usage: collect-release.mjs"),
    );
  });
});
