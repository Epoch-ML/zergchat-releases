import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import { parse } from "yaml";

const workflow = parse(await readFile(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
));

function requireJob(name) {
  const job = workflow.jobs?.[name];
  assert.ok(job && typeof job === "object", `workflow must expose the ${name} job`);
  return job;
}

function requireStep(job, name) {
  const matches = (job.steps || []).filter((step) => step?.name === name);
  assert.equal(matches.length, 1, `${name} must be one unique workflow step`);
  return matches[0];
}

describe("ZergChat source-build release contract", () => {
  it("binds each request to the selected independent updater root before private source access", () => {
    const validate = requireJob("validate");
    const rootStep = requireStep(validate, "Bind the request to the channel updater root");
    assert.equal(rootStep.env.REQUEST_UPDATER_PUBLIC_KEY_SHA256, "${{ steps.request.outputs.updater_public_key_sha256 }}");
    assert.match(rootStep.run, /keys\/zergchat-(preview|stable)-updater\.pubkey/);
    assert.match(rootStep.run, /createHash\("sha256"\)/);
    assert.match(rootStep.run, /canonical base64/);
    assert.match(rootStep.run, /REQUEST_UPDATER_PUBLIC_KEY_SHA256/);

    const build = requireJob("build-macos");
    const checkoutIndex = build.steps.findIndex((step) => step.name === "Check out the exact SHA and matching source tag");
    assert.ok(checkoutIndex >= 0, "private source checkout must remain explicit");
    assert.ok(
      workflow.jobs.validate.steps.findIndex((step) => step.name === rootStep.name) < validate.steps.length,
      "the public trust-root binding must be part of validation",
    );
    assert.deepEqual(build.needs, ["validate"]);
  });

  it("runs the exact ZergChat source gates from the monorepo package", () => {
    const build = requireJob("build-macos");
    const install = requireStep(build, "Install locked dependencies and security tooling");
    assert.match(install.run, /npm ci --prefix source\/zapps\/zergchat/);

    const sourceGate = requireStep(build, "Test and audit the exact source");
    assert.equal(sourceGate["working-directory"], "source/zapps/zergchat");
    for (const command of [
      "npm audit --omit=dev --audit-level=moderate",
      "npm run test:unit",
      "npm run test:e2e --",
      "npm run typecheck",
      "npm run build",
      "npm run generate",
      "npm run theme:check",
      "cargo test --locked --manifest-path src-tauri/Cargo.toml",
      "cargo check --locked --lib --manifest-path src-tauri/Cargo.toml",
      "cargo clippy --locked --lib --manifest-path src-tauri/Cargo.toml -- -D warnings",
    ]) {
      assert.ok(sourceGate.run.includes(command), `source gate must execute ${command}`);
    }
  });

  it("generates the fail-closed production config without a mutable updater flag", () => {
    const build = requireJob("build-macos");
    const config = requireStep(build, "Write and verify the ZergChat release configuration");
    assert.equal(config["working-directory"], "source/zapps/zergchat");
    assert.deepEqual(config.env, {
      NUXT_PUBLIC_API_BASE_URL: "https://zergchat.com",
      ZERGCHAT_NATIVE_CHANNEL: "${{ needs.validate.outputs.channel }}",
      ZERGCHAT_NATIVE_VERSION: "${{ needs.validate.outputs.version }}",
    });
    assert.match(config.run, /npm run native:release-config/);
    assert.match(config.run, /com\.zergai\.zergchat/);
    assert.match(config.run, /Zergchat/);
    assert.doesNotMatch(JSON.stringify(build), /UPDATER_ENABLED/);
    assert.doesNotMatch(JSON.stringify(build), /TAURI_UPDATER_PUBKEY/);
  });

  it("builds, stages, and publishes one universal macOS application", () => {
    const build = requireJob("build-macos");
    const toolchain = requireStep(build, "Install pinned Rust toolchain");
    assert.match(toolchain.run, /aarch64-apple-darwin/);
    assert.match(toolchain.run, /x86_64-apple-darwin/);

    const appBuild = requireStep(build, "Build the unsigned app without release signing credentials");
    assert.equal(appBuild["working-directory"], "source/zapps/zergchat");
    assert.match(appBuild.run, /--target universal-apple-darwin/);
    assert.match(appBuild.run, /--config src-tauri\/tauri\.release\.conf\.json/);

    const stage = requireStep(build, "Package a bounded unsigned source stage");
    assert.equal(stage["working-directory"], "source/zapps/zergchat");
    assert.match(stage.run, /target\/universal-apple-darwin\/release\/bundle/);
    assert.match(stage.run, /Zergchat_\$\{ZERGCHAT_DESKTOP_VERSION\}_universal\.source\.app\.tar\.gz/);
    assert.match(stage.run, /platform: "darwin-universal"/);
    assert.match(stage.run, /product: "Zergchat"/);
  });

  it("validates both slices before Apple credentials and signs the universal disk image", () => {
    const apple = requireJob("apple-sign");
    const hostile = requireStep(apple, "Verify and extract the hostile source stage");
    assert.match(hostile.run, /Zergchat_\$\{VERSION\}_universal\.source\.app\.tar\.gz/);
    assert.match(hostile.run, /lipo -archs/);
    assert.match(hostile.run, /arm64/);
    assert.match(hostile.run, /x86_64/);
    assert.doesNotMatch(JSON.stringify(hostile), /ZERGCHAT_APPLE_/);

    const signing = requireStep(apple, "Apply preview ad-hoc or fail-closed stable Apple signing");
    assert.match(signing.run, /Zergchat_\$\{VERSION\}_universal\.dmg/);
    assert.match(signing.run, /codesign --force --timestamp --sign "\$identity" "\$dmg"/);
    assert.match(signing.run, /notarytool submit "\$dmg"/);
    assert.match(signing.run, /stapler validate "\$dmg"/);
    assert.match(signing.run, /spctl --assess --type open --context context:primary-signature/);
    assert.match(signing.run, /source=Notarized Developer ID/);
  });

  it("signs and publishes the exact universal updater archive", () => {
    const updater = requireJob("sign-updater");
    const sign = requireStep(updater, "Sign only the finished updater archive");
    assert.match(sign.run, /Zergchat_\$\{VERSION\}_universal\.app\.tar\.gz/);
    const collect = requireStep(updater, "Collect and verify the immutable release payload");
    assert.match(collect.run, /scripts\/collect-release\.mjs/);
    assert.match(collect.run, /darwin-aarch64/);
    assert.match(collect.run, /darwin-x86_64/);
  });

  it("destroys Apple credentials before credential-free payload packaging", () => {
    const apple = requireJob("apple-sign");
    const signingIndex = apple.steps.findIndex(
      (step) => step.name === "Apply preview ad-hoc or fail-closed stable Apple signing",
    );
    const cleanupIndex = apple.steps.findIndex(
      (step) => step.name === "Delete ephemeral Apple credentials",
    );
    const packageIndex = apple.steps.findIndex(
      (step) => step.name === "Package the credential-free signed payload",
    );
    const uploadIndex = apple.steps.findIndex(
      (step) => step.uses?.startsWith("actions/upload-artifact@"),
    );
    assert.ok(
      signingIndex >= 0 && signingIndex < cleanupIndex && cleanupIndex < packageIndex &&
        packageIndex < uploadIndex,
      "Apple cleanup must separate signing from packaging and artifact upload",
    );

    const signing = apple.steps[signingIndex];
    const cleanup = apple.steps[cleanupIndex];
    const packaging = apple.steps[packageIndex];
    assert.equal(cleanup.if, "always()");
    assert.doesNotMatch(signing.run, /package-macos\.mjs|build-metadata\.json/);
    assert.doesNotMatch(JSON.stringify(packaging), /secrets\.|ZERGCHAT_APPLE_/);
    assert.match(packaging.run, /Zergchat_\$\{VERSION\}_universal\.app\.tar\.gz/);
    assert.match(packaging.run, /darwin-universal/);
    assert.match(packaging.run, /SHA256SUMS/);
  });

  it("gates updater signing on a fresh secret-free signed-app smoke", () => {
    const smoke = requireJob("signed-smoke");
    assert.deepEqual(smoke.needs, ["validate", "apple-sign"]);
    assert.equal(smoke["runs-on"], "macos-15");
    assert.equal(smoke.environment, undefined);
    assert.deepEqual(smoke.permissions, { contents: "read" });
    assert.doesNotMatch(JSON.stringify(smoke), /secrets\.|ZERGCHAT_APPLE_|TAURI_SIGNING_PRIVATE_KEY/);

    const audit = requireStep(smoke, "Audit and launch the signed universal application");
    for (const token of [
      "shasum -a 256 -c SHA256SUMS",
      "lipo -archs",
      "arm64",
      "x86_64",
      "codesign --verify --deep --strict",
      "hdiutil verify",
      "stapler validate",
      "spctl --assess",
      "kill -0 \"$app_pid\"",
    ]) {
      assert.ok(audit.run.includes(token), `signed smoke must execute ${token}`);
    }

    const updater = requireJob("sign-updater");
    assert.deepEqual(updater.needs, ["validate", "signed-smoke"]);
    const sign = requireStep(updater, "Sign only the finished updater archive");
    const signIndex = sign.run.indexOf("tauri signer sign");
    const unsetIndex = sign.run.indexOf("unset TAURI_SIGNING_PRIVATE_KEY");
    assert.ok(signIndex >= 0 && unsetIndex > signIndex);
  });
});
