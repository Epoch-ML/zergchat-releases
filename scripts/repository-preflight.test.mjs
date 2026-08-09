import assert from "node:assert/strict";
import test from "node:test";

import fc from "fast-check";

import {
  RepositoryPreflightError,
  auditRepositoryState,
} from "./repository-preflight.mjs";

const reviewer = "User:1042757";
const mainRef = ["branch:main"];

const environments = {
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
};

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

const releaseRulesets = [
  { name: "Release branch authority", refs: ["refs/heads/main"],
    bypass: [reviewer], rules: ["creation", "update"] },
  { name: "Release branch history", refs: ["refs/heads/main"],
    bypass: [], rules: ["deletion", "non_fast_forward"] },
  { name: "Reviewed release requests", refs: ["refs/heads/main"],
    bypass: [reviewer], rules: [
      "pull_request:rebase:1:last-push", "required_linear_history",
      "required_status_checks:Protected-base release policy:15368:strict",
    ] },
  { name: "ZergChat feed authority", refs: ["refs/heads/release-data"],
    bypass: ["DeployKey:any"], rules: ["creation", "update"] },
  { name: "ZergChat feed history", refs: ["refs/heads/release-data"],
    bypass: [], rules: ["deletion", "non_fast_forward"] },
  { name: "Release tag authority", refs: [
    "refs/tags/zergchat-preview-v*", "refs/tags/zergchat-v*",
  ], bypass: [reviewer], rules: ["creation"] },
  { name: "Release tag immutability", refs: [
    "refs/tags/zergchat-preview-v*", "refs/tags/zergchat-v*",
  ], bypass: [], rules: ["deletion", "update"] },
];

const sourceRulesets = [
  { name: "Development branch authority", refs: ["refs/heads/development"],
    bypass: [reviewer], rules: ["creation", "update"] },
  { name: "Development branch history", refs: ["refs/heads/development"],
    bypass: [], rules: ["deletion", "non_fast_forward"] },
  { name: "Reviewed development changes", refs: ["refs/heads/development"],
    bypass: [reviewer], rules: [
      "pull_request:rebase:1:last-push", "required_linear_history",
      "required_status_checks:Protected-base ZergChat release policy:15368:strict",
    ] },
  { name: "Desktop release tag authority", refs: desktopTags,
    bypass: [reviewer], rules: ["creation"] },
  { name: "Desktop release tag immutability", refs: desktopTags,
    bypass: [], rules: ["deletion", "update"] },
];

function idealState(releaseState = "disabled_manually") {
  return structuredClone({
    release: {
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
        entries: [
          { path: "site", mode: "040000", type: "tree" },
          { path: "site/.nojekyll", mode: "100644", type: "blob" },
          { path: "site/index.html", mode: "100644", type: "blob" },
        ],
      },
      workflows: [
        { path: ".github/workflows/release.yml", state: releaseState },
        { path: ".github/workflows/policy.yml", state: "active" },
        { path: ".github/workflows/policy-anchor.yml", state: "active" },
      ],
      environments,
      repositorySecrets: [],
      deployKeys: [{ title: "ZergChat release feed writer 2026", read_only: false, verified: true }],
      rulesets: releaseRulesets,
    },
    source: {
      workflows: [
        { path: ".github/workflows/zergchat-native-release.yml", state: "active" },
        { path: ".github/workflows/zergchat-release-policy-anchor.yml", state: "active" },
      ],
      environments: {
        "zergchat-release-request": {
          secrets: [],
          refs: ["tag:zergchat-preview-v*", "tag:zergchat-v*"],
          reviewers: [], prevent_self_review: null, wait_timer: null,
        },
      },
      repositorySecrets: [],
      deployKeys: [{ title: "ZergChat releases source checkout 2026", read_only: true, verified: true }],
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
  state.source.rulesets.find(({ name }) => name === "Desktop release tag immutability").refs = [];
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
    path: ".github/workflows/unrelated.yml",
    state: "active",
  });
  assert.equal(errorCodes(unrelated).includes("workflow-state"), false);
});

test("every environment field and required secret is exact", () => {
  for (const name of Object.keys(environments)) {
    for (const mutate of [
      (environment) => { environment.refs = []; },
      (environment) => { environment.secrets.push("UNEXPECTED_SECRET"); },
      (environment) => { environment.reviewers = ["Team:42"]; },
      (environment) => { environment.prevent_self_review = true; },
      (environment) => { environment.wait_timer = 5; },
    ]) {
      const state = idealState();
      mutate(state.release.environments[name]);
      assert.deepEqual(errorCodes(state), ["environment-contract"], name);
    }
  }
  const missing = idealState();
  delete missing.release.environments["zergchat-preview-build"];
  assert.deepEqual(errorCodes(missing), ["environment-contract"]);

  for (const mutate of [
    (environment) => { environment.refs = ["branch:development"]; },
    (environment) => { environment.secrets = ["WRITE_KEY"]; },
    (environment) => { environment.reviewers = [reviewer]; },
    (environment) => { environment.prevent_self_review = false; },
    (environment) => { environment.wait_timer = 5; },
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
      for (const field of ["refs", "bypass", "rules"]) {
        const state = idealState();
        const value = state[owner].rulesets[index][field];
        state[owner].rulesets[index][field] = value.length === 0
          ? ["unexpected"]
          : [];
        assert.deepEqual(errorCodes(state), [expectedCode], `${owner}/${index}/${field}`);
      }
      const missing = idealState();
      missing[owner].rulesets.splice(index, 1);
      assert.deepEqual(errorCodes(missing), [expectedCode], `${owner}/${index}`);
    }
  }
});

test("feed and source deploy-key authority is exact", () => {
  for (const mutate of [
    (state) => { state.release.deployKeys[0].verified = false; },
    (state) => { state.release.deployKeys[0].read_only = true; },
    (state) => { state.release.deployKeys[0].title = "unrelated writer"; },
    (state) => { state.release.deployKeys.push({
      title: "second writer", verified: true, read_only: false,
    }); },
  ]) {
    const state = idealState();
    mutate(state);
    assert.deepEqual(errorCodes(state), ["deploy-key"]);
  }
  const harmlessReader = idealState();
  harmlessReader.release.deployKeys.push({
    title: "read-only observer", verified: true, read_only: true,
  });
  assert.equal(errorCodes(harmlessReader).includes("deploy-key"), false);

  for (const mutate of [
    (key) => { key.verified = false; },
    (key) => { key.read_only = false; },
    (key) => { key.title = "unrelated reader"; },
  ]) {
    const state = idealState();
    mutate(state.source.deployKeys[0]);
    assert.deepEqual(errorCodes(state), ["source-key"]);
  }
});

test("every bounded release-data branch invariant is enforced", () => {
  const mutations = [
    (branch) => { branch.name = "main"; },
    (branch) => { branch.sha = `x${"a".repeat(40)}`; },
    (branch) => { branch.tree_sha = `${"b".repeat(40)}x`; },
    (branch) => { branch.truncated = true; },
    (branch) => { branch.entries = []; },
    (branch) => { branch.entries.push(structuredClone(branch.entries[0])); },
    (branch) => { branch.entries[1] = null; },
    (branch) => { branch.entries[1] = []; },
    (branch) => { branch.entries[0].mode = "100644"; },
    (branch) => { branch.entries[0].type = "blob"; },
    (branch) => { branch.entries[1].path = "outside/policy.mjs"; },
    (branch) => { branch.entries[1].path = ""; },
    (branch) => { branch.entries[1].path = 7; },
    (branch) => { branch.entries[1].mode = "100755"; },
    (branch) => { branch.entries[1].type = "commit"; },
    (branch) => { branch.entries[1].path = `site/${"x".repeat(508)}`; },
    (branch) => {
      branch.entries = branch.entries.filter(
        ({ path }) => path !== "site/index.html",
      );
    },
  ];
  for (const mutate of mutations) {
    const state = idealState();
    mutate(state.release.feedBranch);
    assert.deepEqual(errorCodes(state), ["feed-branch-contract"]);
  }

  const exactLimit = idealState();
  while (exactLimit.release.feedBranch.entries.length < 4_096) {
    const index = exactLimit.release.feedBranch.entries.length;
    exactLimit.release.feedBranch.entries.push({
      path: `site/generated/${index}.json`, mode: "100644", type: "blob",
    });
  }
  assert.equal(errorCodes(exactLimit).includes("feed-branch-contract"), false);
  exactLimit.release.feedBranch.entries.push({
    path: "site/generated/overflow.json", mode: "100644", type: "blob",
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
});
