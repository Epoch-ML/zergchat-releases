import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";

import fc from "fast-check";

import {
  RepositoryPreflightError,
  auditRepositoryState,
  collectRepositoryState,
  requestGitHub,
  runRepositoryPreflight,
} from "./repository-preflight.mjs";
import { feedDestinations } from "./feed-policy.mjs";

const preflightCli = fileURLToPath(
  new URL("./repository-preflight.mjs", import.meta.url),
);

const reviewer = "User:1042757";
const mainRef = ["branch:main"];
const feedWriterFingerprint =
  "SHA256:WgAMaidO5b4glq5CemIrWykgwMjz7Z+QYAHF6Difsw4";
const sourceReaderFingerprint =
  "SHA256:vJ7KXRTcw6ZbFh1Aiiwoto+GxnEDRW4+hFg9oUFEPpI";
const testDeployKeyBlob = (() => {
  const algorithm = Buffer.from("ssh-ed25519");
  const bytes = Buffer.alloc(4 + algorithm.length + 4 + 32, 7);
  bytes.writeUInt32BE(algorithm.length, 0);
  algorithm.copy(bytes, 4);
  bytes.writeUInt32BE(32, 4 + algorithm.length);
  return bytes;
})();
const testDeployPublicKey =
  `ssh-ed25519 ${testDeployKeyBlob.toString("base64")} test-only`;
const testDeployFingerprint =
  `SHA256:${createHash("sha256").update(testDeployKeyBlob).digest("base64").replace(/=+$/, "")}`;

function addEnvironmentProtection(environment) {
  return {
    ...environment,
    protection_rules: [
      "branch_policy",
      ...(environment.reviewers.length > 0 ? ["required_reviewers"] : []),
      ...(environment.wait_timer === null ? [] : ["wait_timer"]),
    ],
    deployment_branch_policy: {
      protected_branches: false,
      custom_branch_policies: true,
    },
  };
}

const environments = Object.fromEntries(Object.entries({
  "zergchat-preview-build": {
    secrets: ["ZERG_SOURCE_DEPLOY_KEY"], refs: mainRef,
    reviewers: [reviewer], prevent_self_review: false, wait_timer: null,
  },
  "zergchat-stable-build": {
    secrets: ["ZERG_SOURCE_DEPLOY_KEY"], refs: mainRef,
    reviewers: [reviewer], prevent_self_review: false, wait_timer: null,
  },
  "zergchat-apple-preview": {
    secrets: [], refs: mainRef, reviewers: [],
    prevent_self_review: null, wait_timer: null,
  },
  "zergchat-apple-stable": {
    secrets: [
      "ZERGCHAT_APPLE_API_ISSUER",
      "ZERGCHAT_APPLE_API_KEY_ID",
      "ZERGCHAT_APPLE_API_PRIVATE_KEY",
      "ZERGCHAT_APPLE_CERTIFICATE",
      "ZERGCHAT_APPLE_CERTIFICATE_PASSWORD",
      "ZERGCHAT_APPLE_SIGNING_IDENTITY",
    ],
    refs: mainRef, reviewers: [reviewer],
    prevent_self_review: false, wait_timer: null,
  },
  "zergchat-preview-updater": {
    secrets: [
      "ZERGCHAT_PREVIEW_TAURI_SIGNING_PRIVATE_KEY",
      "ZERGCHAT_PREVIEW_TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    ],
    refs: mainRef, reviewers: [reviewer],
    prevent_self_review: false, wait_timer: null,
  },
  "zergchat-stable-updater": {
    secrets: [
      "ZERGCHAT_STABLE_TAURI_SIGNING_PRIVATE_KEY",
      "ZERGCHAT_STABLE_TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    ],
    refs: mainRef, reviewers: [reviewer],
    prevent_self_review: false, wait_timer: null,
  },
  "zergchat-feed": {
    secrets: ["ZERGCHAT_FEED_DEPLOY_KEY"], refs: mainRef,
    reviewers: [], prevent_self_review: null, wait_timer: null,
  },
  "github-pages": {
    secrets: [], refs: mainRef, reviewers: [],
    prevent_self_review: null, wait_timer: null,
  },
}).map(([name, environment]) => [name, addEnvironmentProtection(environment)]));

const desktopTags = [
  "refs/tags/colony-desktop-preview-v*",
  "refs/tags/colony-desktop-v*",
  "refs/tags/zde-preview-v*",
  "refs/tags/zde-v*",
  "refs/tags/zergchat-preview-v*",
  "refs/tags/zergchat-v*",
  "refs/tags/zerglang-ide-preview-v*",
  "refs/tags/zerglang-ide-v*",
  "refs/tags/zterm-preview-v*",
  "refs/tags/zterm-v*",
];

const reviewerBypass = "User:1042757:always";
const reviewedPullRequestRule =
  "pull_request:rebase:1:dismiss-stale:optional-code-owner:last-push:resolve-threads";
const releaseStatusRule =
  "required_status_checks:strict:on-create:Protected-base release policy:15368";
const sourceZergLangStatusRule =
  "required_status_checks:strict:on-create:Protected-base ZergLang release policy:15368";
const sourceZergChatStatusRule =
  "required_status_checks:strict:on-create:Protected-base ZergChat release policy:15368";

const releaseRulesets = [
  { name: "Release branch authority", target: "branch",
    include: ["refs/heads/main"], exclude: [],
    bypass: [reviewerBypass], rules: ["creation", "update"] },
  { name: "Release branch history", target: "branch",
    include: ["refs/heads/main"], exclude: [],
    bypass: [], rules: ["deletion", "non_fast_forward"] },
  { name: "Reviewed release requests", target: "branch",
    include: ["refs/heads/main"], exclude: [],
    bypass: [reviewerBypass], rules: [
      reviewedPullRequestRule, "required_linear_history", releaseStatusRule,
    ] },
  { name: "ZergChat feed authority", target: "branch",
    include: ["refs/heads/release-data"], exclude: [],
    bypass: ["DeployKey:any:always"], rules: ["creation", "update"] },
  { name: "ZergChat feed history", target: "branch",
    include: ["refs/heads/release-data"], exclude: [],
    bypass: [], rules: ["deletion", "non_fast_forward"] },
  { name: "Release tag authority", target: "tag", include: [
    "refs/tags/zergchat-preview-v*", "refs/tags/zergchat-v*",
  ], exclude: [], bypass: [reviewerBypass], rules: ["creation"] },
  { name: "Release tag immutability", target: "tag", include: [
    "refs/tags/zergchat-preview-v*", "refs/tags/zergchat-v*",
  ], exclude: [], bypass: [], rules: ["deletion", "update"] },
];

const sourceRulesets = [
  { name: "Development branch authority", target: "branch",
    include: ["refs/heads/development"], exclude: [],
    bypass: [reviewerBypass], rules: ["creation", "update"] },
  { name: "Development branch history", target: "branch",
    include: ["refs/heads/development"], exclude: [],
    bypass: [], rules: ["deletion", "non_fast_forward"] },
  { name: "Reviewed development changes", target: "branch",
    include: ["refs/heads/development"], exclude: [],
    bypass: [reviewerBypass], rules: [
      reviewedPullRequestRule, "required_linear_history",
      sourceZergLangStatusRule, sourceZergChatStatusRule,
    ] },
  { name: "Desktop release tag authority", target: "tag",
    include: desktopTags, exclude: [],
    bypass: [reviewerBypass], rules: ["creation"] },
  { name: "Desktop release tag immutability", target: "tag",
    include: desktopTags, exclude: [],
    bypass: [], rules: ["deletion", "update"] },
];

function rootReleaseDataEntries() {
  return [
    { path: ".nojekyll", mode: "100644", type: "blob", size: 0 },
    { path: "index.html", mode: "100644", type: "blob", size: 512 },
  ];
}

function channelReleaseDataEntries(channel, version) {
  return [
    { path: channel, mode: "040000", type: "tree" },
    { path: `${channel}/latest.json`, mode: "100644", type: "blob", size: 2_048 },
    { path: `${channel}/releases`, mode: "040000", type: "tree" },
    {
      path: `${channel}/releases/${version}.json`,
      mode: "100644",
      type: "blob",
      size: 4_096,
    },
  ];
}

function releaseDataEntries() {
  return [
    ...rootReleaseDataEntries(),
    ...channelReleaseDataEntries("preview", "0.1.9-preview.1"),
  ];
}

function idealState(releaseState = "disabled_manually") {
  return structuredClone({
    release: {
      repository: {
        full_name: "Epoch-ML/zergchat-releases",
        private: false,
        archived: false,
        default_branch: "main",
      },
      immutableReleases: { enabled: true },
      pages: {
        https_enforced: true,
        build_type: "workflow",
        html_url: "https://epoch-ml.github.io/zergchat-releases/",
        public: true,
      },
      feedBranch: {
        name: "release-data", sha: "a".repeat(40), tree_sha: "b".repeat(40),
        truncated: false,
        entries: releaseDataEntries(),
      },
      workflows: [
        { path: ".github/workflows/release.yml", state: releaseState },
        { path: ".github/workflows/policy.yml", state: "active" },
        { path: ".github/workflows/policy-anchor.yml", state: "active" },
      ],
      environments,
      repositorySecrets: [],
      deployKeys: [{
        title: "ZergChat release feed writer 2026",
        read_only: false,
        verified: true,
        fingerprint: feedWriterFingerprint,
      }],
      rulesets: releaseRulesets,
    },
    source: {
      repository: {
        full_name: "Epoch-ML/zerg",
        private: true,
        archived: false,
        default_branch: "development",
      },
      workflows: [
        { path: ".github/workflows/zergchat-native-release.yml", state: "active" },
        { path: ".github/workflows/zergchat-release-policy-anchor.yml", state: "active" },
      ],
      environments: {
        "zergchat-release-request": addEnvironmentProtection({
          secrets: [],
          refs: ["tag:zergchat-preview-v*", "tag:zergchat-v*"],
          reviewers: [], prevent_self_review: null, wait_timer: null,
        }),
      },
      repositorySecrets: [],
      deployKeys: [{
        title: "ZergChat releases source checkout 2026",
        read_only: true,
        verified: true,
        fingerprint: sourceReaderFingerprint,
      }],
      rulesets: sourceRulesets,
    },
  });
}

function errorCodes(state, phase = "cutover") {
  return auditRepositoryState(state, { phase }).errors.map(({ code }) => code);
}

test("cutover and live phases require exact workflow states", () => {
  const cutover = auditRepositoryState(idealState(), { phase: "cutover" });
  assert.deepEqual(cutover.errors, []);
  assert.deepEqual(cutover.warnings.map(({ code }) => code), ["human-review-limitation"]);
  const live = auditRepositoryState(idealState("active"), { phase: "live" });
  assert.deepEqual(live.errors, []);
  assert.deepEqual(errorCodes(idealState("active"), "cutover"), [
    "workflow-state",
  ]);
  assert.deepEqual(errorCodes(idealState(), "live"), ["workflow-state"]);
});

test("immutability, Pages, feed, workflow, key, secret, and rules drift fail closed", () => {
  const state = idealState();
  state.release.immutableReleases.enabled = false;
  state.release.pages.https_enforced = false;
  state.release.feedBranch.entries.push({ path: "workflow.yml", mode: "100644", type: "blob" });
  state.release.workflows.find(({ path }) => path.endsWith("policy-anchor.yml")).state = "disabled_manually";
  state.release.deployKeys[0].verified = false;
  state.release.repositorySecrets.push("UNSCOPED_SIGNER");
  state.release.rulesets.find(({ name }) => name === "Reviewed release requests").rules = [];
  state.source.deployKeys[0].read_only = false;
  state.source.rulesets.find(({ name }) => name === "Desktop release tag immutability").include = [];
  const codes = auditRepositoryState(state, { phase: "cutover" }).errors.map(({ code }) => code);
  for (const expected of [
    "immutable-releases", "pages-contract", "feed-branch-contract",
    "workflow-state", "deploy-key", "repository-secret", "ruleset-contract",
    "source-key", "source-ruleset-contract",
  ]) assert.ok(codes.includes(expected));
});

test("every required environment secret and protection field is enforced", () => {
  // Property: removing any required environment secret makes cutover invalid.
  const secretBearing = Object.entries(environments)
    .flatMap(([name, environment]) => environment.secrets.map((secret) => [name, secret]));
  fc.assert(fc.property(fc.constantFrom(...secretBearing), ([name, secret]) => {
    const state = idealState();
    state.release.environments[name].secrets =
      state.release.environments[name].secrets.filter((value) => value !== secret);
    const codes = auditRepositoryState(state, { phase: "cutover" }).errors
      .map(({ code }) => code);
    assert.ok(codes.includes("environment-contract"));
  }));
});

test("source request environment remains secret-free and tag scoped", () => {
  const state = idealState();
  state.source.environments["zergchat-release-request"].secrets.push("WRITE_KEY");
  state.source.environments["zergchat-release-request"].refs = ["branch:development"];
  assert.ok(
    auditRepositoryState(state, { phase: "cutover" }).errors
      .some(({ code }) => code === "source-environment-contract"),
  );
});

test("every Pages and workflow identity is independently enforced", () => {
  for (const mutate of [
    (pages) => { pages.https_enforced = false; },
    (pages) => { pages.build_type = "legacy"; },
    (pages) => { pages.html_url = "https://example.invalid/"; },
    (pages) => { pages.public = false; },
  ]) {
    const state = idealState();
    mutate(state.release.pages);
    assert.deepEqual(errorCodes(state), ["pages-contract"]);
  }

  for (const [owner, path] of [
    ["release", ".github/workflows/release.yml"],
    ["release", ".github/workflows/policy-anchor.yml"],
    ["release", ".github/workflows/policy.yml"],
    ["source", ".github/workflows/zergchat-native-release.yml"],
    ["source", ".github/workflows/zergchat-release-policy-anchor.yml"],
  ]) {
    const state = idealState();
    state[owner].workflows = state[owner].workflows.filter(
      (workflow) => workflow.path !== path,
    );
    assert.deepEqual(errorCodes(state), ["workflow-state"], path);
  }

  const unrelated = idealState();
  unrelated.release.workflows.push({
    path: ".github/workflows/hidden-export.yml",
    state: "active",
  });
  assert.deepEqual(errorCodes(unrelated), ["workflow-state"]);
});

test("public and private repository identities are exact", () => {
  for (const [owner, code, mutations] of [
    ["release", "repository-contract", [
      ["full_name", "Epoch-ML/other"],
      ["private", true],
      ["archived", true],
      ["default_branch", "development"],
    ]],
    ["source", "source-repository-contract", [
      ["full_name", "Epoch-ML/other"],
      ["private", false],
      ["archived", true],
      ["default_branch", "main"],
    ]],
  ]) {
    for (const [field, value] of mutations) {
      const state = idealState();
      state[owner].repository[field] = value;
      assert.deepEqual(errorCodes(state), [code], `${owner}/${field}`);
    }
  }
});

test("every environment field and required secret is exact", () => {
  for (const name of Object.keys(environments)) {
    for (const mutate of [
      (environment) => { environment.refs = []; },
      (environment) => { environment.secrets.push("UNEXPECTED_SECRET"); },
      (environment) => { environment.reviewers = ["Team:42"]; },
      (environment) => { environment.prevent_self_review = true; },
      (environment) => { environment.wait_timer = 5; },
      (environment) => { environment.protection_rules.push("wait_timer"); },
      (environment) => {
        environment.deployment_branch_policy.protected_branches = true;
      },
    ]) {
      const state = idealState();
      mutate(state.release.environments[name]);
      assert.deepEqual(errorCodes(state), ["environment-contract"], name);
    }
  }
  const missing = idealState();
  delete missing.release.environments["zergchat-preview-build"];
  assert.deepEqual(errorCodes(missing), ["environment-contract"]);

  const unexpected = idealState();
  unexpected.release.environments["hidden-export"] = {
    secrets: ["UNREVIEWED_KEY"], refs: mainRef, reviewers: [],
    prevent_self_review: null, wait_timer: null,
  };
  assert.deepEqual(errorCodes(unexpected), ["environment-contract"]);

  for (const mutate of [
    (environment) => { environment.refs = ["branch:development"]; },
    (environment) => { environment.secrets = ["WRITE_KEY"]; },
    (environment) => { environment.reviewers = [reviewer]; },
    (environment) => { environment.prevent_self_review = false; },
    (environment) => { environment.wait_timer = 5; },
    (environment) => { environment.protection_rules = []; },
    (environment) => {
      environment.deployment_branch_policy.custom_branch_policies = false;
    },
  ]) {
    const state = idealState();
    mutate(state.source.environments["zergchat-release-request"]);
    assert.deepEqual(errorCodes(state), ["source-environment-contract"]);
  }
});

test("every ruleset identity, reference, bypass, and rule is exact", () => {
  for (const owner of ["release", "source"]) {
    const expectedCode = owner === "release"
      ? "ruleset-contract"
      : "source-ruleset-contract";
    for (const index of idealState()[owner].rulesets.keys()) {
      for (const field of ["target", "include", "exclude", "bypass", "rules"]) {
        const state = idealState();
        const value = state[owner].rulesets[index][field];
        state[owner].rulesets[index][field] = field === "target"
          ? (value === "branch" ? "tag" : "branch")
          : value.length === 0 ? ["unexpected"] : [];
        assert.deepEqual(errorCodes(state), [expectedCode], `${owner}/${index}/${field}`);
      }
      const missing = idealState();
      missing[owner].rulesets.splice(index, 1);
      assert.deepEqual(errorCodes(missing), [expectedCode], `${owner}/${index}`);
    }
  }

  for (const owner of ["release", "source"]) {
    const state = idealState();
    state[owner].rulesets.push({
      name: "Unreviewed policy",
      target: "branch",
      include: ["~ALL"],
      exclude: [],
      bypass: [reviewerBypass],
      rules: ["update"],
    });
    assert.deepEqual(
      errorCodes(state).filter((code) => code.endsWith("ruleset-contract")),
      owner === "release" ? ["ruleset-contract"] : [],
      `${owner}/extra`,
    );

    const duplicate = idealState();
    duplicate[owner].rulesets.push(structuredClone(duplicate[owner].rulesets[0]));
    assert.deepEqual(errorCodes(duplicate), [
      owner === "release" ? "ruleset-contract" : "source-ruleset-contract",
    ], `${owner}/duplicate`);
  }
});

test("repository-scoped release credentials are rejected independently", () => {
  const release = idealState();
  release.release.repositorySecrets.push("UNSCOPED_SIGNER");
  assert.deepEqual(errorCodes(release), ["repository-secret"]);

  const source = idealState();
  source.source.repositorySecrets.push("ZERGCHAT_RELEASES_DEPLOY_KEY");
  assert.deepEqual(errorCodes(source), ["source-repository-secret"]);
});

test("invalid list shapes cannot impersonate intentionally empty protections", () => {
  const state = idealState();
  state.release.environments["zergchat-apple-preview"].secrets = "none";
  state.release.rulesets.find(
    ({ name }) => name === "Release branch history",
  ).bypass = "none";
  state.source.environments["zergchat-release-request"].reviewers = "none";
  assert.deepEqual(errorCodes(state), [
    "environment-contract",
    "ruleset-contract",
    "source-environment-contract",
  ]);

  const mixed = idealState();
  mixed.release.environments["zergchat-apple-preview"].secrets = [7];
  mixed.release.rulesets.find(
    ({ name }) => name === "Release branch history",
  ).bypass = [reviewer, 7];
  mixed.source.environments["zergchat-release-request"].reviewers = [reviewer, 7];
  assert.deepEqual(errorCodes(mixed), [
    "environment-contract",
    "ruleset-contract",
    "source-environment-contract",
  ]);
});

test("feed and source deploy-key authority is exact", () => {
  for (const mutate of [
    (state) => { state.release.deployKeys[0].verified = false; },
    (state) => { state.release.deployKeys[0].read_only = true; },
    (state) => { state.release.deployKeys[0].title = "unrelated writer"; },
    (state) => { state.release.deployKeys[0].fingerprint = sourceReaderFingerprint; },
    (state) => { state.release.deployKeys.push({
      title: "second writer", verified: true, read_only: false,
      fingerprint: feedWriterFingerprint,
    }); },
  ]) {
    const state = idealState();
    mutate(state);
    assert.deepEqual(errorCodes(state), ["deploy-key"]);
  }
  const harmlessReader = idealState();
  harmlessReader.release.deployKeys.push({
    title: "read-only observer", verified: true, read_only: true,
    fingerprint: sourceReaderFingerprint,
  });
  assert.deepEqual(errorCodes(harmlessReader), ["deploy-key"]);

  for (const mutate of [
    (key) => { key.verified = false; },
    (key) => { key.read_only = false; },
    (key) => { key.title = "unrelated reader"; },
    (key) => { key.fingerprint = feedWriterFingerprint; },
  ]) {
    const state = idealState();
    mutate(state.source.deployKeys[0]);
    assert.deepEqual(errorCodes(state), ["source-key"]);
  }

  const duplicateSourceReader = idealState();
  duplicateSourceReader.source.deployKeys.push({
    title: "ZergChat releases source checkout duplicate",
    read_only: true,
    verified: true,
    fingerprint: sourceReaderFingerprint,
  });
  assert.deepEqual(errorCodes(duplicateSourceReader), ["source-key"]);

  const unrelatedSourceReader = idealState();
  unrelatedSourceReader.source.deployKeys.push({
    title: "ZergLang releases source checkout 2026",
    read_only: true,
    verified: true,
    fingerprint: feedWriterFingerprint,
  });
  assert.equal(errorCodes(unrelatedSourceReader).includes("source-key"), false);
});

test("release-data has one bounded root topology shared with feed publication", () => {
  for (const [channel, version] of [["preview", "0.1.9-preview.1"]]) {
    const destinations = feedDestinations(channel, version);
    const paths = idealState().release.feedBranch.entries.map(({ path }) => path);
    assert.equal(paths.includes(destinations.latest), true, destinations.latest);
    assert.equal(paths.includes(destinations.metadata), true, destinations.metadata);
  }

  const bootstrap = idealState();
  bootstrap.release.feedBranch.entries = rootReleaseDataEntries();
  assert.equal(errorCodes(bootstrap).includes("feed-branch-contract"), false);
  const liveBootstrap = idealState("active");
  liveBootstrap.release.feedBranch.entries = rootReleaseDataEntries();
  assert.deepEqual(errorCodes(liveBootstrap, "live"), ["feed-branch-contract"]);

  const stableOnly = idealState("active");
  stableOnly.release.feedBranch.entries = [
    ...rootReleaseDataEntries(),
    ...channelReleaseDataEntries("stable", "0.1.9"),
  ];
  assert.equal(errorCodes(stableOnly, "live").includes("feed-branch-contract"), false);

  const bothChannels = idealState("active");
  bothChannels.release.feedBranch.entries.push(
    ...channelReleaseDataEntries("stable", "0.1.9"),
  );
  assert.equal(errorCodes(bothChannels, "live").includes("feed-branch-contract"), false);

  const mutations = [
    (branch) => { branch.name = "main"; },
    (branch) => { branch.sha = `x${"a".repeat(40)}`; },
    (branch) => { branch.tree_sha = `${"b".repeat(40)}x`; },
    (branch) => { branch.truncated = true; },
    (branch) => { branch.entries = []; },
    (branch) => { branch.entries.push(structuredClone(branch.entries[0])); },
    (branch) => { branch.entries[3] = null; },
    (branch) => { branch.entries[3] = []; },
    (branch) => { branch.entries[2].mode = "100644"; },
    (branch) => { branch.entries[2].type = "blob"; },
    (branch) => { branch.entries[3].path = "site/preview/latest.json"; },
    (branch) => { branch.entries[1].path = ""; },
    (branch) => { branch.entries[1].path = 7; },
    (branch) => { branch.entries[1].mode = "100755"; },
    (branch) => { branch.entries[1].type = "commit"; },
    (branch) => { branch.entries[1].path = "x".repeat(513); },
    (branch) => { branch.entries[0].size = 1; },
    (branch) => { branch.entries[1].size = 0; },
    (branch) => { branch.entries[3].size = 1_048_577; },
    (branch) => { branch.entries[3].size = 1.5; },
    (branch) => { branch.entries[3].size = "2048"; },
    (branch) => { branch.entries[2].size = 0; },
    (branch) => { branch.entries[5].path = "preview/releases/0.1.9.json"; },
    (branch) => {
      branch.entries = branch.entries.filter(
        ({ path }) => path !== "preview/latest.json",
      );
    },
  ];
  for (const mutate of mutations) {
    const state = idealState();
    mutate(state.release.feedBranch);
    assert.deepEqual(errorCodes(state), ["feed-branch-contract"]);
  }

  for (const invalid of [null, false, "release-data", []]) {
    const state = idealState();
    state.release.feedBranch = invalid;
    assert.deepEqual(errorCodes(state), ["feed-branch-contract"]);
  }

  for (const requiredPath of [
    ".nojekyll",
    "index.html",
  ]) {
    const missing = idealState();
    missing.release.feedBranch.entries = missing.release.feedBranch.entries
      .filter(({ path }) => path !== requiredPath);
    assert.deepEqual(errorCodes(missing), ["feed-branch-contract"], requiredPath);
  }

  const unexpectedRoot = idealState();
  unexpectedRoot.release.feedBranch.entries.push({
    path: "site", mode: "040000", type: "tree",
  });
  assert.deepEqual(errorCodes(unexpectedRoot), ["feed-branch-contract"]);

  const aggregateOverflow = idealState();
  for (let patch = 0; patch < 65; patch += 1) {
    aggregateOverflow.release.feedBranch.entries.push({
      path: `preview/releases/9.9.${patch}-preview.1.json`,
      mode: "100644",
      type: "blob",
      size: 1_048_576,
    });
  }
  assert.deepEqual(errorCodes(aggregateOverflow), ["feed-branch-contract"]);

  const exactLimit = idealState();
  while (exactLimit.release.feedBranch.entries.length < 4_096) {
    const index = exactLimit.release.feedBranch.entries.length;
    exactLimit.release.feedBranch.entries.push({
      path: `preview/releases/99.0.${index}-preview.1.json`,
      mode: "100644",
      type: "blob",
      size: 1,
    });
  }
  assert.equal(errorCodes(exactLimit).includes("feed-branch-contract"), false);
  exactLimit.release.feedBranch.entries.push({
    path: "preview/releases/99.0.4096-preview.1.json",
    mode: "100644",
    type: "blob",
    size: 1,
  });
  assert.deepEqual(errorCodes(exactLimit), ["feed-branch-contract"]);
});

test("invalid phases and repository documents throw exact public errors", () => {
  assert.throws(
    () => auditRepositoryState({}, { phase: "preview" }),
    (error) => error instanceof RepositoryPreflightError &&
      error.message === "phase must be cutover or live",
  );
  assert.throws(
    () => auditRepositoryState(null, { phase: "cutover" }),
    (error) => error instanceof RepositoryPreflightError &&
      error.message === "repository state must be an object",
  );
  for (const [field, message] of [
    ["release", "release repository state must be an object"],
    ["source", "source repository state must be an object"],
  ]) {
    const state = idealState();
    state[field] = "invalid";
    assert.throws(
      () => auditRepositoryState(state, { phase: "cutover" }),
      (error) => error instanceof RepositoryPreflightError &&
        error.message === message,
    );
  }

  for (const [field, expectedCode] of [
    ["immutableReleases", "immutable-releases"],
    ["pages", "pages-contract"],
  ]) {
    const state = idealState();
    delete state.release[field];
    assert.ok(errorCodes(state).includes(expectedCode), field);
  }
});

test("the GitHub boundary is authenticated, versioned, and read-only", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ enabled: true }),
    };
  };
  const result = await requestGitHub(
    {
      repository: "Epoch-ML/zergchat-releases",
      path: "immutable-releases",
      apiVersion: "2026-03-10",
    },
    { token: "test-token", fetchImpl },
  );
  assert.deepEqual(result, { enabled: true });
  assert.deepEqual(calls, [{
    url: "https://api.github.com/repos/Epoch-ML/zergchat-releases/immutable-releases",
    options: { headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer test-token",
      "X-GitHub-Api-Version": "2026-03-10",
    } },
  }]);
});

test("the GitHub boundary collects every authenticated pagination page", async () => {
  const base = "https://api.github.com/repos/Epoch-ML/zergchat-releases/actions/workflows";
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (calls.length === 1) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({
          link: `<${base}?page=2&per_page=100>; rel="next", ` +
            `<${base}?page=2&per_page=100>; rel="last"`,
        }),
        json: async () => ({
          total_count: 2,
          workflows: [{ id: 1, path: ".github/workflows/release.yml" }],
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        total_count: 2,
        workflows: [{ id: 2, path: ".github/workflows/policy.yml" }],
      }),
    };
  };

  const result = await requestGitHub({
    repository: "Epoch-ML/zergchat-releases",
    path: "actions/workflows",
    paginationKey: "workflows",
  }, { token: "test-token", fetchImpl });

  assert.deepEqual(result, {
    total_count: 2,
    workflows: [
      { id: 1, path: ".github/workflows/release.yml" },
      { id: 2, path: ".github/workflows/policy.yml" },
    ],
  });
  assert.deepEqual(calls, [
    `${base}?per_page=100`,
    `${base}?page=2&per_page=100`,
  ]);
});

test("array pagination and hostile Link metadata fail closed", async () => {
  const rulesetsUrl = "https://api.github.com/repos/Epoch-ML/zergchat-releases/rulesets";
  const pages = [
    {
      ok: true,
      status: 200,
      headers: new Headers({
        link: `<${rulesetsUrl}?page=2&per_page=100>; rel="next"`,
      }),
      json: async () => [{ id: 1 }],
    },
    {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => [{ id: 2 }],
    },
  ];
  assert.deepEqual(await requestGitHub({
    repository: "Epoch-ML/zergchat-releases",
    path: "rulesets",
    paginationKey: "array",
  }, { token: "test-token", fetchImpl: async () => pages.shift() }), [
    { id: 1 },
    { id: 2 },
  ]);

  for (const [link, message] of [
    [`<${rulesetsUrl}?page=1&per_page=100>; rel="next"`, /pagination loop/],
    ["not-a-link", /malformed pagination Link/],
    ["<https://example.invalid/steal?page=2&per_page=100>; rel=\"next\"", /untrusted pagination URL/],
  ]) {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ link }),
      json: async () => [],
    });
    await assert.rejects(requestGitHub({
      repository: "Epoch-ML/zergchat-releases",
      path: "rulesets",
      paginationKey: "array",
    }, { token: "test-token", fetchImpl }), message);
  }

  await assert.rejects(requestGitHub({
    repository: "Epoch-ML/zergchat-releases",
    path: "actions/workflows",
    paginationKey: "workflows",
  }, {
    token: "test-token",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ total_count: 2, workflows: [{ id: 1 }] }),
    }),
  }), /pagination total_count does not match 1 records/);

  await assert.rejects(requestGitHub({
    repository: "Epoch-ML/zergchat-releases",
    path: "actions/workflows",
    paginationKey: "unknown",
  }, { token: "test-token", fetchImpl: async () => null }), /pagination key is invalid/);
});

test("the GitHub boundary allows only an explicitly missing resource", async () => {
  const notFound = async () => ({
    ok: false, status: 404, json: async () => ({ message: "Not Found" }),
  });
  assert.equal(await requestGitHub({
    repository: "Epoch-ML/zergchat-releases",
    path: "branches/release-data",
    allowNotFound: true,
  }, { token: "test-token", fetchImpl: notFound }), null);
  await assert.rejects(
    requestGitHub({
      repository: "Epoch-ML/zergchat-releases", path: "rulesets",
    }, { token: "test-token", fetchImpl: notFound }),
    /GitHub API Epoch-ML\/zergchat-releases\/rulesets returned 404/,
  );
  await assert.rejects(
    requestGitHub({
      repository: "Epoch-ML/zergchat-releases", path: "rulesets",
    }, { token: "", fetchImpl: notFound }),
    /GH_TOKEN is required for repository preflight/,
  );
  await assert.rejects(
    requestGitHub({
      repository: "Epoch-ML/zergchat-releases", path: "rulesets",
    }, { token: "test-token", fetchImpl: null }),
    /fetchImpl must be a function/,
  );
  const serverFailure = async () => ({
    ok: false, status: 500, json: async () => ({ message: "failure" }),
  });
  await assert.rejects(
    requestGitHub({
      repository: "Epoch-ML/zergchat-releases",
      path: "branches/release-data",
      allowNotFound: true,
    }, { token: "test-token", fetchImpl: serverFailure }),
    /returned 500/,
  );
});

test("the collector normalizes settings through one injected HTTP boundary", async () => {
  const responses = new Map([
    ["Epoch-ML/zergchat-releases:", {
      full_name: "Epoch-ML/zergchat-releases",
      private: false,
      archived: false,
      default_branch: "main",
    }],
    ["Epoch-ML/zergchat-releases:immutable-releases", { enabled: true }],
    ["Epoch-ML/zergchat-releases:pages", {
      https_enforced: true, build_type: "workflow",
      html_url: "https://epoch-ml.github.io/zergchat-releases/", public: true,
    }],
    ["Epoch-ML/zergchat-releases:branches/release-data", {
      name: "release-data",
      commit: { sha: "a".repeat(40), commit: { tree: { sha: "b".repeat(40) } } },
    }],
    [`Epoch-ML/zergchat-releases:git/trees/${"b".repeat(40)}?recursive=1`, {
      truncated: false,
      tree: releaseDataEntries().toReversed(),
    }],
    ["Epoch-ML/zergchat-releases:actions/workflows", { workflows: [{
      path: ".github/workflows/release.yml", state: "disabled_manually",
    }] }],
    ["Epoch-ML/zergchat-releases:environments", { environments: [{
      name: "zergchat-feed",
      protection_rules: [
        { type: "branch_policy" },
        { type: "required_reviewers", prevent_self_review: false,
          reviewers: [
            { type: "User", reviewer: { id: 1042757 } },
            { type: "Team", reviewer: { id: 42 } },
          ] },
        { type: "wait_timer", wait_timer: 15 },
      ],
      deployment_branch_policy: {
        protected_branches: false,
        custom_branch_policies: true,
      },
    }] }],
    ["Epoch-ML/zergchat-releases:environments/zergchat-feed/secrets", {
      secrets: [{ name: "Z_SECRET" }, { name: "A_SECRET" }],
    }],
    ["Epoch-ML/zergchat-releases:environments/zergchat-feed/deployment-branch-policies", {
      branch_policies: [{ name: "main", type: "branch" }],
    }],
    ["Epoch-ML/zergchat-releases:actions/secrets", {
      secrets: [{ name: "Z_REPOSITORY" }, { name: "A_REPOSITORY" }],
    }],
    ["Epoch-ML/zergchat-releases:keys", [
      {
        title: "feed key",
        verified: true,
        read_only: false,
        key: testDeployPublicKey,
      },
    ]],
    ["Epoch-ML/zergchat-releases:rulesets", [{ id: 2 }, { id: 1 }]],
    ["Epoch-ML/zergchat-releases:rulesets/1", {
      name: "Reviewed release requests", enforcement: "active", target: "branch",
      conditions: { ref_name: { include: ["refs/heads/main"], exclude: [] } },
      bypass_actors: [
        { actor_type: "User", actor_id: 1042757, bypass_mode: "always" },
        { actor_type: "DeployKey", actor_id: null, bypass_mode: "always" },
      ],
      rules: [
        { type: "pull_request", parameters: {
          allowed_merge_methods: ["rebase"], required_approving_review_count: 1,
          dismiss_stale_reviews_on_push: true,
          require_code_owner_review: false,
          require_last_push_approval: true,
          required_review_thread_resolution: true,
        } },
        { type: "required_status_checks", parameters: {
          strict_required_status_checks_policy: true,
          do_not_enforce_on_create: false,
          required_status_checks: [{
            context: "Protected-base release policy", integration_id: 15368,
          }],
        } },
        { type: "required_linear_history" },
      ],
    }],
    ["Epoch-ML/zergchat-releases:rulesets/2", {
      name: "Inactive", enforcement: "evaluate", target: "branch",
      conditions: { ref_name: { include: ["~ALL"], exclude: [] } },
      bypass_actors: [], rules: [{ type: "deletion" }],
    }],
    ["Epoch-ML/zerg:", {
      full_name: "Epoch-ML/zerg",
      private: true,
      archived: false,
      default_branch: "development",
    }],
    ["Epoch-ML/zerg:actions/workflows", { workflows: [{
      path: ".github/workflows/zergchat-native-release.yml", state: "active",
    }] }],
    ["Epoch-ML/zerg:environments", { environments: [{
      name: "zergchat-release-request",
      protection_rules: [{ type: "branch_policy" }],
      deployment_branch_policy: {
        protected_branches: false,
        custom_branch_policies: true,
      },
    }] }],
    ["Epoch-ML/zerg:environments/zergchat-release-request/secrets", {
      secrets: [],
    }],
    ["Epoch-ML/zerg:environments/zergchat-release-request/deployment-branch-policies", {
      branch_policies: [
        { name: "zergchat-preview-v*", type: "tag" },
        { name: "zergchat-v*", type: "tag" },
      ],
    }],
    ["Epoch-ML/zerg:actions/secrets", { secrets: [] }],
    ["Epoch-ML/zerg:keys", [{
      title: "source key",
      verified: true,
      read_only: true,
      key: testDeployPublicKey,
    }]],
    ["Epoch-ML/zerg:rulesets", [{ id: 3 }]],
    ["Epoch-ML/zerg:rulesets/3", {
      name: "Development branch history", enforcement: "active", target: "branch",
      conditions: {
        ref_name: { include: ["refs/heads/development"], exclude: [] },
      },
      bypass_actors: [],
      rules: [{ type: "deletion" }, { type: "non_fast_forward" }],
    }],
  ]);
  const calls = [];
  const pagination = [];
  const request = async ({ repository, path, paginationKey }) => {
    const key = `${repository}:${path}`;
    calls.push(key);
    if (paginationKey !== undefined) pagination.push(`${key}:${paginationKey}`);
    return structuredClone(responses.get(key));
  };

  const state = await collectRepositoryState({ request });
  assert.deepEqual(state.release.repository, {
    full_name: "Epoch-ML/zergchat-releases",
    private: false,
    archived: false,
    default_branch: "main",
  });
  assert.deepEqual(state.source.repository, {
    full_name: "Epoch-ML/zerg",
    private: true,
    archived: false,
    default_branch: "development",
  });
  assert.deepEqual(state.release.feedBranch, {
    name: "release-data", sha: "a".repeat(40), tree_sha: "b".repeat(40),
    truncated: false,
    entries: releaseDataEntries(),
  });
  assert.deepEqual(state.release.environments["zergchat-feed"], {
    secrets: ["A_SECRET", "Z_SECRET"], refs: ["branch:main"],
    reviewers: ["Team:42", "User:1042757"],
    prevent_self_review: false, wait_timer: 15,
    protection_rules: ["branch_policy", "required_reviewers", "wait_timer"],
    deployment_branch_policy: {
      protected_branches: false,
      custom_branch_policies: true,
    },
  });
  assert.deepEqual(state.release.rulesets, [{
    name: "Reviewed release requests", target: "branch",
    include: ["refs/heads/main"], exclude: [],
    bypass: ["DeployKey:any:always", "User:1042757:always"],
    rules: [
      reviewedPullRequestRule,
      "required_linear_history",
      releaseStatusRule,
    ],
  }]);
  assert.deepEqual(state.release.deployKeys, [{
    title: "feed key", verified: true, read_only: false,
    fingerprint: testDeployFingerprint,
  }]);
  assert.deepEqual(state.release.repositorySecrets, [
    "A_REPOSITORY",
    "Z_REPOSITORY",
  ]);
  assert.deepEqual(state.release.workflows, [{
    path: ".github/workflows/release.yml",
    state: "disabled_manually",
  }]);
  assert.deepEqual(state.source.repositorySecrets, []);
  assert.deepEqual(state.source.workflows, [{
    path: ".github/workflows/zergchat-native-release.yml",
    state: "active",
  }]);
  assert.deepEqual(state.source.environments["zergchat-release-request"], {
    secrets: [], refs: ["tag:zergchat-preview-v*", "tag:zergchat-v*"],
    reviewers: [], prevent_self_review: null, wait_timer: null,
    protection_rules: ["branch_policy"],
    deployment_branch_policy: {
      protected_branches: false,
      custom_branch_policies: true,
    },
  });
  assert.deepEqual(state.source.rulesets, [{
    name: "Development branch history", target: "branch",
    include: ["refs/heads/development"], exclude: [],
    bypass: [], rules: ["deletion", "non_fast_forward"],
  }]);
  assert.deepEqual(state.source.deployKeys, [{
    title: "source key", verified: true, read_only: true,
    fingerprint: testDeployFingerprint,
  }]);
  assert.deepEqual(calls, [...responses.keys()]);
  assert.deepEqual(pagination, [
    "Epoch-ML/zergchat-releases:actions/workflows:workflows",
    "Epoch-ML/zergchat-releases:environments:environments",
    "Epoch-ML/zergchat-releases:environments/zergchat-feed/secrets:secrets",
    "Epoch-ML/zergchat-releases:environments/zergchat-feed/deployment-branch-policies:branch_policies",
    "Epoch-ML/zergchat-releases:actions/secrets:secrets",
    "Epoch-ML/zergchat-releases:keys:array",
    "Epoch-ML/zergchat-releases:rulesets:array",
    "Epoch-ML/zerg:actions/workflows:workflows",
    "Epoch-ML/zerg:environments:environments",
    "Epoch-ML/zerg:environments/zergchat-release-request/secrets:secrets",
    "Epoch-ML/zerg:environments/zergchat-release-request/deployment-branch-policies:branch_policies",
    "Epoch-ML/zerg:actions/secrets:secrets",
    "Epoch-ML/zerg:keys:array",
    "Epoch-ML/zerg:rulesets:array",
  ]);

  for (const [key, malformed] of [
    ["Epoch-ML/zergchat-releases:actions/secrets", { secrets: "invalid" }],
    ["Epoch-ML/zerg:actions/secrets", { secrets: null }],
    ["Epoch-ML/zergchat-releases:rulesets", { rulesets: [] }],
    ["Epoch-ML/zerg:environments", {
      environments: [{
        name: "zergchat-release-request", protection_rules: "invalid",
      }],
    }],
    ["Epoch-ML/zerg:environments", {
      environments: [{
        name: "zergchat-release-request",
        protection_rules: [{
          type: "required_reviewers",
          prevent_self_review: false,
          reviewers: [{ type: "User", reviewer: { id: "not-an-integer" } }],
        }],
      }],
    }],
    ["Epoch-ML/zergchat-releases:environments/zergchat-feed/secrets", {
      secrets: null,
    }],
    ["Epoch-ML/zergchat-releases:rulesets/1", {
      ...responses.get("Epoch-ML/zergchat-releases:rulesets/1"),
      conditions: { ref_name: { include: ["refs/heads/main", 7] } },
    }],
    ["Epoch-ML/zergchat-releases:rulesets/1", {
      ...responses.get("Epoch-ML/zergchat-releases:rulesets/1"),
      rules: [{ type: "pull_request", parameters: {
        allowed_merge_methods: ["rebase", 7],
        required_approving_review_count: 1,
        require_last_push_approval: true,
      } }],
    }],
  ]) {
    const original = responses.get(key);
    responses.set(key, malformed);
    await assert.rejects(
      collectRepositoryState({ request }),
      (error) => error instanceof RepositoryPreflightError,
      key,
    );
    responses.set(key, original);
  }
});

test("the collector rejects a non-callable request boundary", async () => {
  await assert.rejects(
    collectRepositoryState({ request: null }),
    (error) => error instanceof RepositoryPreflightError &&
      error.message === "request must be a function",
  );
});

test("the preflight CLI rejects trailing arguments before any network access", () => {
  const result = spawnSync(
    process.execPath,
    [preflightCli, "cutover", "unexpected"],
    { encoding: "utf8", env: { ...process.env, GH_TOKEN: "" } },
  );
  assert.equal(result.status, 1);
  assert.match(result.stderr, /usage: repository-preflight\.mjs cutover\|live/);
  assert.doesNotMatch(result.stderr, /GH_TOKEN is required/);
});

test("the public preflight runner emits state and returns an observable status", async () => {
  for (const [phase, state, expectedStatus, expectedCodes] of [
    ["cutover", idealState(), 0, []],
    ["live", idealState("active"), 0, []],
    ["cutover", (() => {
      const state = idealState();
      state.release.immutableReleases.enabled = false;
      return state;
    })(), 1, ["immutable-releases"]],
  ]) {
    const output = [];
    const status = await runRepositoryPreflight([phase], {
      // GitHub collection is the external HTTP boundary.
      collect: async () => structuredClone(state),
      // Writing output is the process stdout boundary.
      write: (value) => output.push(value),
    });
    assert.equal(status, expectedStatus, phase);
    assert.equal(output.length, 1, phase);
    assert.deepEqual(
      JSON.parse(output[0]).errors.map(({ code }) => code),
      expectedCodes,
      phase,
    );
  }
});

test("the public preflight runner rejects every invalid argument shape", async () => {
  for (const args of [null, [], ["preview"], ["cutover", "extra"]]) {
    await assert.rejects(
      runRepositoryPreflight(args, {
        // GitHub collection must not run for invalid process arguments.
        collect: async () => {
          throw new Error("unexpected collection");
        },
      }),
      (error) => error instanceof RepositoryPreflightError &&
        error.message === "usage: repository-preflight.mjs cutover|live",
    );
  }
});
