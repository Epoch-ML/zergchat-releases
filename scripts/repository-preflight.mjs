#!/usr/bin/env node

import { pathToFileURL } from "node:url";

const RELEASE_REPOSITORY = "Epoch-ML/zergchat-releases";
const SOURCE_REPOSITORY = "Epoch-ML/zerg";
const RELEASE_WORKFLOW = ".github/workflows/release.yml";
const RELEASE_POLICY_ANCHOR = ".github/workflows/policy-anchor.yml";
const SOURCE_WORKFLOW = ".github/workflows/zergchat-native-release.yml";
const SOURCE_POLICY_ANCHOR =
  ".github/workflows/zergchat-release-policy-anchor.yml";
const CANONICAL_PAGES_URL = "https://epoch-ml.github.io/zergchat-releases/";
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const MAX_RELEASE_DATA_ENTRIES = 4_096;
const MAX_RELEASE_DATA_FILE_BYTES = 1_048_576;
const MAX_RELEASE_DATA_TOTAL_BYTES = 67_108_864;
const MAX_GITHUB_PAGES = 100;
const MAX_GITHUB_PAGE_RECORDS = 100;
const MAX_GITHUB_RECORDS = MAX_GITHUB_PAGES * MAX_GITHUB_PAGE_RECORDS;
const PAGINATION_KEYS = new Set([
  "array",
  "branch_policies",
  "environments",
  "secrets",
  "workflows",
]);
const STABLE_METADATA_PATH_PATTERN =
  /^stable\/releases\/(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.json$/;
const PREVIEW_METADATA_PATH_PATTERN =
  /^preview\/releases\/(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)-preview\.(?:[1-9]\d*)\.json$/;
const REQUIRED_RELEASE_DATA_DIRECTORIES = new Set([
  "preview",
  "preview/releases",
  "stable",
  "stable/releases",
]);
const REQUIRED_RELEASE_DATA_BLOBS = new Set([
  ".nojekyll",
  "index.html",
]);
const ALLOWED_FIXED_RELEASE_DATA_BLOBS = new Set([
  ...REQUIRED_RELEASE_DATA_BLOBS,
  "preview/latest.json",
  "stable/latest.json",
]);

const EXPECTED_ENVIRONMENTS = Object.freeze({
  "zergchat-preview-build": Object.freeze({
    secrets: Object.freeze(["ZERG_SOURCE_DEPLOY_KEY"]),
    refs: Object.freeze(["branch:main"]),
    reviewers: Object.freeze(["User:1042757"]),
    prevent_self_review: false,
    wait_timer: null,
  }),
  "zergchat-stable-build": Object.freeze({
    secrets: Object.freeze(["ZERG_SOURCE_DEPLOY_KEY"]),
    refs: Object.freeze(["branch:main"]),
    reviewers: Object.freeze(["User:1042757"]),
    prevent_self_review: false,
    wait_timer: null,
  }),
  "zergchat-apple-preview": Object.freeze({
    secrets: Object.freeze([]),
    refs: Object.freeze(["branch:main"]),
    reviewers: Object.freeze([]),
    prevent_self_review: null,
    wait_timer: null,
  }),
  "zergchat-apple-stable": Object.freeze({
    secrets: Object.freeze([
      "ZERGCHAT_APPLE_API_ISSUER",
      "ZERGCHAT_APPLE_API_KEY_ID",
      "ZERGCHAT_APPLE_API_PRIVATE_KEY",
      "ZERGCHAT_APPLE_CERTIFICATE",
      "ZERGCHAT_APPLE_CERTIFICATE_PASSWORD",
      "ZERGCHAT_APPLE_SIGNING_IDENTITY",
    ]),
    refs: Object.freeze(["branch:main"]),
    reviewers: Object.freeze(["User:1042757"]),
    prevent_self_review: false,
    wait_timer: null,
  }),
  "zergchat-preview-updater": Object.freeze({
    secrets: Object.freeze([
      "ZERGCHAT_PREVIEW_TAURI_SIGNING_PRIVATE_KEY",
      "ZERGCHAT_PREVIEW_TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    ]),
    refs: Object.freeze(["branch:main"]),
    reviewers: Object.freeze(["User:1042757"]),
    prevent_self_review: false,
    wait_timer: null,
  }),
  "zergchat-stable-updater": Object.freeze({
    secrets: Object.freeze([
      "ZERGCHAT_STABLE_TAURI_SIGNING_PRIVATE_KEY",
      "ZERGCHAT_STABLE_TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    ]),
    refs: Object.freeze(["branch:main"]),
    reviewers: Object.freeze(["User:1042757"]),
    prevent_self_review: false,
    wait_timer: null,
  }),
  "zergchat-feed": Object.freeze({
    secrets: Object.freeze(["ZERGCHAT_FEED_DEPLOY_KEY"]),
    refs: Object.freeze(["branch:main"]),
    reviewers: Object.freeze([]),
    prevent_self_review: null,
    wait_timer: null,
  }),
  "github-pages": Object.freeze({
    secrets: Object.freeze([]),
    refs: Object.freeze(["branch:main"]),
    reviewers: Object.freeze([]),
    prevent_self_review: null,
    wait_timer: null,
  }),
});

const EXPECTED_RULESETS = Object.freeze([
  Object.freeze({
    name: "Release branch authority",
    refs: Object.freeze(["refs/heads/main"]),
    bypass: Object.freeze(["User:1042757"]),
    rules: Object.freeze(["creation", "update"]),
  }),
  Object.freeze({
    name: "Release branch history",
    refs: Object.freeze(["refs/heads/main"]),
    bypass: Object.freeze([]),
    rules: Object.freeze(["deletion", "non_fast_forward"]),
  }),
  Object.freeze({
    name: "Reviewed release requests",
    refs: Object.freeze(["refs/heads/main"]),
    bypass: Object.freeze(["User:1042757"]),
    rules: Object.freeze([
      "pull_request:rebase:1:last-push",
      "required_linear_history",
      "required_status_checks:Protected-base release policy:15368:strict",
    ]),
  }),
  Object.freeze({
    name: "ZergChat feed authority",
    refs: Object.freeze(["refs/heads/release-data"]),
    bypass: Object.freeze(["DeployKey:any"]),
    rules: Object.freeze(["creation", "update"]),
  }),
  Object.freeze({
    name: "ZergChat feed history",
    refs: Object.freeze(["refs/heads/release-data"]),
    bypass: Object.freeze([]),
    rules: Object.freeze(["deletion", "non_fast_forward"]),
  }),
  Object.freeze({
    name: "Release tag authority",
    refs: Object.freeze([
      "refs/tags/zergchat-preview-v*",
      "refs/tags/zergchat-v*",
    ]),
    bypass: Object.freeze(["User:1042757"]),
    rules: Object.freeze(["creation"]),
  }),
  Object.freeze({
    name: "Release tag immutability",
    refs: Object.freeze([
      "refs/tags/zergchat-preview-v*",
      "refs/tags/zergchat-v*",
    ]),
    bypass: Object.freeze([]),
    rules: Object.freeze(["deletion", "update"]),
  }),
]);

const EXPECTED_SOURCE_RULESETS = Object.freeze([
  Object.freeze({
    name: "Development branch authority",
    refs: Object.freeze(["refs/heads/development"]),
    bypass: Object.freeze(["User:1042757"]),
    rules: Object.freeze(["creation", "update"]),
  }),
  Object.freeze({
    name: "Development branch history",
    refs: Object.freeze(["refs/heads/development"]),
    bypass: Object.freeze([]),
    rules: Object.freeze(["deletion", "non_fast_forward"]),
  }),
  Object.freeze({
    name: "Reviewed development changes",
    refs: Object.freeze(["refs/heads/development"]),
    bypass: Object.freeze(["User:1042757"]),
    rules: Object.freeze([
      "pull_request:rebase:1:last-push",
      "required_linear_history",
      "required_status_checks:Protected-base ZergLang release policy:15368:strict",
      "required_status_checks:Protected-base ZergChat release policy:15368:strict",
    ]),
  }),
  Object.freeze({
    name: "Desktop release tag authority",
    refs: Object.freeze([
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
    ]),
    bypass: Object.freeze(["User:1042757"]),
    rules: Object.freeze(["creation"]),
  }),
  Object.freeze({
    name: "Desktop release tag immutability",
    refs: Object.freeze([
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
    ]),
    bypass: Object.freeze([]),
    rules: Object.freeze(["deletion", "update"]),
  }),
]);

const EXPECTED_SOURCE_ENVIRONMENT = Object.freeze({
  secrets: Object.freeze([]),
  refs: Object.freeze([
    "tag:zergchat-preview-v*",
    "tag:zergchat-v*",
  ]),
  reviewers: Object.freeze([]),
  prevent_self_review: null,
  wait_timer: null,
});

export class RepositoryPreflightError extends Error {
  constructor(message) {
    super(message);
    this.name = "RepositoryPreflightError";
  }
}

function requireObject(value, description) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new RepositoryPreflightError(`${description} must be an object`);
  }
  return value;
}

function requireArray(value, description) {
  if (!Array.isArray(value)) {
    throw new RepositoryPreflightError(`${description} must be an array`);
  }
  return value;
}

function requireStringArray(value, description) {
  const values = requireArray(value, description);
  if (values.some((item) => typeof item !== "string")) {
    throw new RepositoryPreflightError(`${description} must contain only strings`);
  }
  return values;
}

function sortedStrings(values) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) {
    return [];
  }
  return [...values].sort();
}

function equalStrings(left, right) {
  if (
    !Array.isArray(left) ||
    !Array.isArray(right) ||
    left.some((value) => typeof value !== "string") ||
    right.some((value) => typeof value !== "string")
  ) {
    return false;
  }
  const actual = sortedStrings(left);
  const expected = sortedStrings(right);
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function diagnostic(code, message) {
  return { code, message };
}

function findWorkflow(workflows, path) {
  return Array.isArray(workflows)
    ? workflows.find((workflow) => workflow.path === path)
    : undefined;
}

function rulesetMatches(actual, expected) {
  return actual !== undefined &&
    equalStrings(actual.refs, expected.refs) &&
    equalStrings(actual.bypass, expected.bypass) &&
    equalStrings(actual.rules, expected.rules);
}

function environmentMatches(actual, expected) {
  return actual !== undefined &&
    equalStrings(actual.secrets, expected.secrets) &&
    equalStrings(actual.refs, expected.refs) &&
    equalStrings(actual.reviewers, expected.reviewers) &&
    actual.prevent_self_review === expected.prevent_self_review &&
    actual.wait_timer === expected.wait_timer;
}

function isBoundedFeedBranch(feedBranch, { requireChannel }) {
  if (
    feedBranch === null ||
    typeof feedBranch !== "object" ||
    Array.isArray(feedBranch) ||
    feedBranch.name !== "release-data" ||
    !SHA_PATTERN.test(feedBranch.sha) ||
    !SHA_PATTERN.test(feedBranch.tree_sha) ||
    feedBranch.truncated !== false ||
    !Array.isArray(feedBranch.entries) ||
    feedBranch.entries.length < 2 ||
    feedBranch.entries.length > MAX_RELEASE_DATA_ENTRIES
  ) {
    return false;
  }
  const paths = new Set();
  let aggregateBytes = 0;
  let previewMetadataCount = 0;
  let stableMetadataCount = 0;
  for (const entry of feedBranch.entries) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      typeof entry.path !== "string" ||
      entry.path.length === 0 ||
      entry.path.length > 512 ||
      paths.has(entry.path)
    ) {
      return false;
    }
    paths.add(entry.path);

    if (REQUIRED_RELEASE_DATA_DIRECTORIES.has(entry.path)) {
      if (
        entry.type !== "tree" ||
        entry.mode !== "040000" ||
        entry.size !== undefined
      ) {
        return false;
      }
      continue;
    }

    const previewMetadata = PREVIEW_METADATA_PATH_PATTERN.test(entry.path);
    const stableMetadata = STABLE_METADATA_PATH_PATTERN.test(entry.path);
    if (
      !ALLOWED_FIXED_RELEASE_DATA_BLOBS.has(entry.path) &&
      !previewMetadata &&
      !stableMetadata
    ) {
      return false;
    }
    if (
      entry.type !== "blob" ||
      entry.mode !== "100644" ||
      !Number.isSafeInteger(entry.size) ||
      entry.size < 0 ||
      entry.size > MAX_RELEASE_DATA_FILE_BYTES
    ) {
      return false;
    }
    if (entry.path === ".nojekyll" && entry.size !== 0) return false;
    if (entry.path !== ".nojekyll" && entry.size === 0) return false;
    aggregateBytes += entry.size;
    if (!Number.isSafeInteger(aggregateBytes) ||
        aggregateBytes > MAX_RELEASE_DATA_TOTAL_BYTES) {
      return false;
    }
    if (previewMetadata) previewMetadataCount += 1;
    if (stableMetadata) stableMetadataCount += 1;
  }
  if (![...REQUIRED_RELEASE_DATA_BLOBS].every((path) => paths.has(path))) {
    return false;
  }
  const channelComplete = (channel, metadataCount) => {
    const channelPaths = [
      channel,
      `${channel}/latest.json`,
      `${channel}/releases`,
    ];
    const present = [...paths].some(
      (path) => path === channel || path.startsWith(`${channel}/`),
    );
    return !present ||
      (channelPaths.every((path) => paths.has(path)) && metadataCount > 0);
  };
  const previewPresent = paths.has("preview");
  const stablePresent = paths.has("stable");
  return channelComplete("preview", previewMetadataCount) &&
    channelComplete("stable", stableMetadataCount) &&
    (!requireChannel || previewPresent || stablePresent);
}

export function auditRepositoryState(state, { phase } = {}) {
  if (phase !== "cutover" && phase !== "live") {
    throw new RepositoryPreflightError("phase must be cutover or live");
  }
  const root = requireObject(state, "repository state");
  const release = requireObject(root.release, "release repository state");
  const source = requireObject(root.source, "source repository state");
  const errors = [];
  const warnings = [];
  const expectedWorkflowState = phase === "cutover" ? "disabled_manually" : "active";

  if (release.immutableReleases?.enabled !== true) {
    errors.push(diagnostic(
      "immutable-releases",
      "release immutability must be enabled",
    ));
  }
  if (
    release.pages?.https_enforced !== true ||
    release.pages?.build_type !== "workflow"
  ) {
    errors.push(diagnostic(
      "pages-contract",
      "Pages must use a workflow deployment with HTTPS enforced",
    ));
  }
  if (
    release.pages?.html_url !== CANONICAL_PAGES_URL ||
    release.pages?.public !== true
  ) {
    errors.push(diagnostic(
      "pages-contract",
      "Pages must publish the canonical public HTTPS origin",
    ));
  }
  if (!isBoundedFeedBranch(release.feedBranch, {
    requireChannel: phase === "live",
  })) {
    errors.push(diagnostic(
      "feed-branch-contract",
      "release-data must contain only the bounded root updater-feed topology",
    ));
  }

  for (const [repository, workflows, workflowPath, anchorPath] of [
    [
      "release",
      release.workflows,
      RELEASE_WORKFLOW,
      RELEASE_POLICY_ANCHOR,
    ],
    ["source", source.workflows, SOURCE_WORKFLOW, SOURCE_POLICY_ANCHOR],
  ]) {
    const workflow = findWorkflow(workflows, workflowPath);
    const anchor = findWorkflow(workflows, anchorPath);
    const requiredWorkflowState = repository === "release"
      ? expectedWorkflowState
      : "active";
    if (
      workflow?.state !== requiredWorkflowState ||
      anchor?.state !== "active"
    ) {
      errors.push(diagnostic(
        "workflow-state",
        `${repository} workflow must be ${requiredWorkflowState} and its ` +
          "protected-base policy anchor must be active",
      ));
    }
  }
  const approvedReleaseWorkflows = new Set([
    RELEASE_WORKFLOW,
    RELEASE_POLICY_ANCHOR,
    ".github/workflows/policy.yml",
  ]);
  if (
    Array.isArray(release.workflows) &&
    release.workflows.some(({ path }) => !approvedReleaseWorkflows.has(path))
  ) {
    errors.push(diagnostic(
      "workflow-state",
      "the release repository may contain only reviewed workflow files",
    ));
  }
  if (findWorkflow(release.workflows, ".github/workflows/policy.yml")?.state !== "active") {
    errors.push(diagnostic(
      "workflow-state",
      "the secondary release policy workflow must remain active",
    ));
  }

  const environments = requireObject(
    release.environments,
    "release environments",
  );
  if (
    Object.keys(environments).some(
      (name) => EXPECTED_ENVIRONMENTS[name] === undefined,
    )
  ) {
    errors.push(diagnostic(
      "environment-contract",
      "the release repository may contain only reviewed environments",
    ));
  }
  for (const [name, expected] of Object.entries(EXPECTED_ENVIRONMENTS)) {
    const actual = environments[name];
    if (!environmentMatches(actual, expected)) {
      errors.push(diagnostic(
      "environment-contract",
      `${name} environment credentials, refs, or protection rules differ`,
      ));
    }
  }

  const writableKeys = Array.isArray(release.deployKeys)
    ? release.deployKeys.filter((key) => key.read_only === false)
    : [];
  if (
    writableKeys.length !== 1 ||
    writableKeys[0].verified !== true ||
    !writableKeys[0].title.startsWith("ZergChat release feed writer ")
  ) {
    errors.push(diagnostic(
      "deploy-key",
      "the public repository must have exactly one verified feed writer key",
    ));
  }
  const sourceKeys = Array.isArray(source.deployKeys)
    ? source.deployKeys.filter((key) =>
      key.title.startsWith("ZergChat releases source checkout ")
    )
    : [];
  if (
    sourceKeys.length !== 1 ||
    sourceKeys[0].verified !== true ||
    sourceKeys[0].read_only !== true
  ) {
    errors.push(diagnostic(
      "source-key",
      "the ZergChat source deploy key must be verified and read-only",
    ));
  }
  const sourceEnvironments = requireObject(
    source.environments,
    "source environments",
  );
  const sourceRequestEnvironment = sourceEnvironments["zergchat-release-request"];
  if (
    !environmentMatches(
      sourceRequestEnvironment,
      EXPECTED_SOURCE_ENVIRONMENT,
    )
  ) {
    errors.push(diagnostic(
      "source-environment-contract",
      "zergchat-release-request must be secret-free and tag-scoped",
    ));
  }
  if (
    Array.isArray(source.repositorySecrets) &&
    source.repositorySecrets.includes("ZERGCHAT_RELEASES_DEPLOY_KEY")
  ) {
    errors.push(diagnostic(
      "source-repository-secret",
      "source request write credentials must be absent",
    ));
  }
  if (Array.isArray(release.repositorySecrets) && release.repositorySecrets.length > 0) {
    errors.push(diagnostic(
      "repository-secret",
      "release credentials must remain environment-scoped",
    ));
  }

  const rulesets = Array.isArray(release.rulesets) ? release.rulesets : [];
  const expectedRulesetNames = new Set(EXPECTED_RULESETS.map(({ name }) => name));
  const actualRulesetNames = rulesets.map(({ name }) => name);
  if (
    actualRulesetNames.some((name) => !expectedRulesetNames.has(name)) ||
    new Set(actualRulesetNames).size !== actualRulesetNames.length
  ) {
    errors.push(diagnostic(
      "ruleset-contract",
      "the release repository must contain exactly the reviewed rulesets",
    ));
  }
  for (const expected of EXPECTED_RULESETS) {
    const actual = rulesets.find((ruleset) => ruleset.name === expected.name);
    if (!rulesetMatches(actual, expected)) {
      errors.push(diagnostic(
        "ruleset-contract",
        `${expected.name} differs from the cutover contract`,
      ));
    }
  }
  const sourceRulesets = Array.isArray(source.rulesets) ? source.rulesets : [];
  const expectedSourceRulesetNames = new Set(
    EXPECTED_SOURCE_RULESETS.map(({ name }) => name),
  );
  const actualSourceRulesetNames = sourceRulesets.map(({ name }) => name);
  if (
    actualSourceRulesetNames.some(
      (name) => !expectedSourceRulesetNames.has(name),
    ) ||
    new Set(actualSourceRulesetNames).size !== actualSourceRulesetNames.length
  ) {
    errors.push(diagnostic(
      "source-ruleset-contract",
      "the source repository must contain exactly the reviewed rulesets",
    ));
  }
  for (const expected of EXPECTED_SOURCE_RULESETS) {
    const actual = sourceRulesets.find((ruleset) => ruleset.name === expected.name);
    if (!rulesetMatches(actual, expected)) {
      errors.push(diagnostic(
        "source-ruleset-contract",
        `${expected.name} differs from the cutover contract`,
      ));
    }
  }
  const reviewed = rulesets.find(
    (ruleset) => ruleset.name === "Reviewed release requests",
  );
  if (reviewed?.bypass?.includes("User:1042757")) {
    warnings.push(diagnostic(
      "human-review-limitation",
      "Idan retains review bypass until a second trusted human is available",
    ));
  }

  const sortDiagnostics = (values) => values.sort((left, right) =>
    `${left.code}:${left.message}`.localeCompare(`${right.code}:${right.message}`)
  );
  return {
    errors: sortDiagnostics(errors),
    warnings: sortDiagnostics(warnings),
  };
}

function normalizeRule(rule) {
  if (rule.type === "pull_request") {
    const parameters = rule.parameters ?? {};
    const methods = sortedStrings(requireStringArray(
      parameters.allowed_merge_methods,
      "pull-request merge methods",
    )).join("+");
    const approvals = parameters.required_approving_review_count;
    const lastPush = parameters.require_last_push_approval === true
      ? "last-push"
      : "no-last-push";
    return `pull_request:${methods}:${approvals}:${lastPush}`;
  }
  if (rule.type === "required_status_checks") {
    const parameters = rule.parameters ?? {};
    const strict = parameters.strict_required_status_checks_policy === true
      ? "strict"
      : "non-strict";
    const checks = requireArray(
      parameters.required_status_checks,
      "required status checks",
    );
    return checks.map((rawCheck) => {
      const check = requireObject(rawCheck, "required status check");
      return `required_status_checks:${check.context}:${check.integration_id}:${strict}`;
    });
  }
  return rule.type;
}

function normalizeRuleset(ruleset) {
  const refs = requireStringArray(
    ruleset.conditions?.ref_name?.include,
    "ruleset references",
  );
  const bypass = requireArray(
    ruleset.bypass_actors,
    "ruleset bypass actors",
  ).map((rawActor) => {
    const actor = requireObject(rawActor, "ruleset bypass actor");
    return `${actor.actor_type}:${actor.actor_id ?? "any"}`;
  });
  const rules = requireArray(ruleset.rules, "ruleset rules")
    .map((rule) => requireObject(rule, "ruleset rule"))
    .flatMap(normalizeRule);
  return {
    name: ruleset.name,
    refs: sortedStrings(refs),
    bypass: sortedStrings(bypass),
    rules: sortedStrings(rules),
  };
}

function repositoryResourceUrl(repository, path) {
  const resource = path === "" ? repository : `${repository}/${path}`;
  return new URL(`https://api.github.com/repos/${resource}`);
}

function validatedPaginationUrl(rawUrl, resourceUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new RepositoryPreflightError("GitHub API returned a malformed pagination Link");
  }
  const parameterNames = [...url.searchParams.keys()];
  const page = url.searchParams.getAll("page");
  const perPage = url.searchParams.getAll("per_page");
  if (
    url.origin !== "https://api.github.com" ||
    url.username !== "" ||
    url.password !== "" ||
    url.hash !== "" ||
    url.pathname !== resourceUrl.pathname ||
    parameterNames.some((name) => name !== "page" && name !== "per_page") ||
    new Set(parameterNames).size !== parameterNames.length ||
    page.length !== 1 ||
    !/^[1-9]\d*$/.test(page[0]) ||
    Number(page[0]) > MAX_GITHUB_PAGES ||
    perPage.length !== 1 ||
    perPage[0] !== String(MAX_GITHUB_PAGE_RECORDS)
  ) {
    throw new RepositoryPreflightError("GitHub API returned an untrusted pagination URL");
  }
  return url;
}

function nextPaginationUrl(response, resourceUrl) {
  if (response.headers === undefined ||
      typeof response.headers.get !== "function") {
    throw new RepositoryPreflightError("GitHub API pagination headers are unavailable");
  }
  const header = response.headers.get("link");
  if (header === null || header === "") return null;
  const relations = new Map();
  for (const rawPart of header.split(",")) {
    const match = /^\s*<([^<>]+)>;\s*rel="(first|last|next|prev)"\s*$/.exec(rawPart);
    if (match === null || relations.has(match[2])) {
      throw new RepositoryPreflightError("GitHub API returned a malformed pagination Link");
    }
    relations.set(match[2], validatedPaginationUrl(match[1], resourceUrl));
  }
  return relations.get("next") ?? null;
}

async function readGitHubJson(response, description) {
  try {
    return await response.json();
  } catch {
    throw new RepositoryPreflightError(`${description} returned malformed JSON`);
  }
}

export async function requestGitHub({
  repository,
  path,
  apiVersion = "2022-11-28",
  allowNotFound = false,
  paginationKey,
}, {
  token = process.env.GH_TOKEN,
  fetchImpl = fetch,
} = {}) {
  if (typeof token !== "string" || token === "") {
    throw new RepositoryPreflightError("GH_TOKEN is required for repository preflight");
  }
  if (typeof fetchImpl !== "function") {
    throw new RepositoryPreflightError("fetchImpl must be a function");
  }
  if (paginationKey !== undefined && !PAGINATION_KEYS.has(paginationKey)) {
    throw new RepositoryPreflightError("GitHub API pagination key is invalid");
  }
  if (paginationKey !== undefined && allowNotFound) {
    throw new RepositoryPreflightError(
      "GitHub API pagination cannot allow a missing resource",
    );
  }
  const resourceUrl = repositoryResourceUrl(repository, path);
  let requestUrl = new URL(resourceUrl);
  if (paginationKey !== undefined) {
    requestUrl.searchParams.set("per_page", String(MAX_GITHUB_PAGE_RECORDS));
  }
  const seen = new Set();
  const records = [];
  let expectedTotal;
  let firstDocument;
  while (true) {
    if (seen.has(requestUrl.href)) {
      throw new RepositoryPreflightError("GitHub API pagination loop detected");
    }
    if (seen.size >= MAX_GITHUB_PAGES) {
      throw new RepositoryPreflightError("GitHub API pagination exceeds its page limit");
    }
    seen.add(requestUrl.href);
    const response = await fetchImpl(requestUrl.href, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": apiVersion,
      },
    });
    if (allowNotFound && response.status === 404) return null;
    if (!response.ok) {
      throw new RepositoryPreflightError(
        `GitHub API ${repository}/${path} returned ${response.status}`,
      );
    }
    const description = `GitHub API ${repository}/${path}`;
    const document = await readGitHubJson(response, description);
    if (paginationKey === undefined) return document;
    const pageRecords = paginationKey === "array"
      ? document
      : requireObject(document, `${description} page`)[paginationKey];
    const page = requireArray(pageRecords, `${description} ${paginationKey}`);
    if (page.length > MAX_GITHUB_PAGE_RECORDS ||
        records.length + page.length > MAX_GITHUB_RECORDS) {
      throw new RepositoryPreflightError(
        `${description} pagination exceeds its record limit`,
      );
    }
    records.push(...page);
    if (paginationKey !== "array") {
      const total = document.total_count;
      if (!Number.isSafeInteger(total) || total < 0 || total > MAX_GITHUB_RECORDS) {
        throw new RepositoryPreflightError(
          `${description} pagination total_count is invalid`,
        );
      }
      if (expectedTotal === undefined) {
        expectedTotal = total;
        firstDocument = document;
      } else if (total !== expectedTotal) {
        throw new RepositoryPreflightError(
          `${description} pagination total_count changed between pages`,
        );
      }
    }
    const next = nextPaginationUrl(response, resourceUrl);
    if (next === null) break;
    requestUrl = next;
  }
  if (paginationKey !== "array" && expectedTotal !== records.length) {
    throw new RepositoryPreflightError(
      `GitHub API ${repository}/${path} pagination total_count does not match ` +
        `${records.length} records`,
    );
  }
  return paginationKey === "array"
    ? records
    : { ...firstDocument, total_count: records.length, [paginationKey]: records };
}

async function collectEnvironments(request, repository, response) {
  const environments = {};
  const records = requireArray(response.environments, "repository environments");
  for (const rawRecord of records.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    const record = requireObject(rawRecord, "repository environment");
    const protectionRules = requireArray(
      record.protection_rules ?? [],
      `${record.name} protection rules`,
    );
    const reviewerRules = protectionRules.filter(
      (rule) => rule?.type === "required_reviewers",
    );
    const waitTimerRules = protectionRules.filter(
      (rule) => rule?.type === "wait_timer",
    );
    const reviewers = reviewerRules.flatMap((rule) =>
      requireArray(rule.reviewers, `${record.name} required reviewers`)
        .map((rawReviewer) => {
          const reviewer = requireObject(
            rawReviewer,
            `${record.name} required reviewer`,
          );
          const subject = requireObject(
            reviewer.reviewer,
            `${record.name} required reviewer subject`,
          );
          if (
            typeof reviewer.type !== "string" ||
            !Number.isSafeInteger(subject.id)
          ) {
            throw new RepositoryPreflightError(
              `${record.name} required reviewer identity is invalid`,
            );
          }
          return `${reviewer.type}:${subject.id}`;
        })
    );
    const preventSelfReview = reviewerRules.length === 0
      ? null
      : reviewerRules.length === 1 &&
          typeof reviewerRules[0].prevent_self_review === "boolean"
        ? reviewerRules[0].prevent_self_review
        : "invalid";
    const waitTimer = waitTimerRules.length === 0
      ? null
      : waitTimerRules.length === 1 &&
          Number.isSafeInteger(waitTimerRules[0].wait_timer)
        ? waitTimerRules[0].wait_timer
        : "invalid";
    const secrets = await request({
      repository,
      path: `environments/${encodeURIComponent(record.name)}/secrets`,
      paginationKey: "secrets",
    });
    const policies = await request({
      repository,
      path: `environments/${encodeURIComponent(record.name)}/deployment-branch-policies`,
      paginationKey: "branch_policies",
    });
    environments[record.name] = {
      secrets: requireArray(secrets.secrets, `${record.name} secrets`)
        .map((secret) => requireObject(secret, `${record.name} secret`).name)
        .sort(),
      refs: requireArray(
        policies.branch_policies,
        `${record.name} deployment policies`,
      ).map((policy) => {
        const branchPolicy = requireObject(
          policy,
          `${record.name} deployment policy`,
        );
        return `${branchPolicy.type}:${branchPolicy.name}`;
      }).sort(),
      reviewers: reviewers.sort(),
      prevent_self_review: preventSelfReview,
      wait_timer: waitTimer,
    };
  }
  return environments;
}

async function collectRulesets(request, repository, response) {
  const summaries = requireArray(response, "repository rulesets");
  const rulesets = [];
  for (const summary of summaries.sort((left, right) => left.id - right.id)) {
    const full = await request({
      repository,
      path: `rulesets/${summary.id}`,
    });
    if (full.enforcement === "active") rulesets.push(normalizeRuleset(full));
  }
  return rulesets;
}

export async function collectRepositoryState({
  request = requestGitHub,
  releaseRepository = RELEASE_REPOSITORY,
  sourceRepository = SOURCE_REPOSITORY,
} = {}) {
  if (typeof request !== "function") {
    throw new RepositoryPreflightError("request must be a function");
  }
  const immutableReleases = await request({
    repository: releaseRepository,
    path: "immutable-releases",
    apiVersion: "2026-03-10",
  });
  const pages = await request({ repository: releaseRepository, path: "pages" });
  const feedBranchResponse = await request({
    repository: releaseRepository,
    path: "branches/release-data",
    allowNotFound: true,
  });
  let feedBranch = null;
  if (feedBranchResponse !== null) {
    const branch = requireObject(feedBranchResponse, "release-data branch");
    const commit = requireObject(branch.commit, "release-data commit");
    const commitMetadata = requireObject(
      commit.commit,
      "release-data commit metadata",
    );
    const tree = requireObject(commitMetadata.tree, "release-data tree reference");
    const treeResponse = await request({
      repository: releaseRepository,
      path: `git/trees/${tree.sha}?recursive=1`,
    });
    const treeDocument = requireObject(treeResponse, "release-data tree");
    feedBranch = {
      name: branch.name,
      sha: commit.sha,
      tree_sha: tree.sha,
      truncated: treeDocument.truncated,
      entries: requireArray(treeDocument.tree, "release-data tree entries")
        .map((entry) => {
          const { path, mode, type, size } = requireObject(
            entry,
            "release-data tree entry",
          );
          return type === "blob"
            ? { path, mode, type, size }
            : { path, mode, type };
        }).sort((left, right) => left.path.localeCompare(right.path)),
    };
  }
  const releaseWorkflows = await request({
    repository: releaseRepository,
    path: "actions/workflows",
    paginationKey: "workflows",
  });
  const environmentResponse = await request({
    repository: releaseRepository,
    path: "environments",
    paginationKey: "environments",
  });
  const environments = await collectEnvironments(
    request,
    releaseRepository,
    environmentResponse,
  );
  const repositorySecretsResponse = await request({
    repository: releaseRepository,
    path: "actions/secrets",
    paginationKey: "secrets",
  });
  const releaseKeys = await request({
    repository: releaseRepository,
    path: "keys",
    paginationKey: "array",
  });
  const rulesetResponse = await request({
    repository: releaseRepository,
    path: "rulesets",
    paginationKey: "array",
  });
  const rulesets = await collectRulesets(
    request,
    releaseRepository,
    rulesetResponse,
  );
  const sourceWorkflows = await request({
    repository: sourceRepository,
    path: "actions/workflows",
    paginationKey: "workflows",
  });
  const sourceEnvironmentResponse = await request({
    repository: sourceRepository,
    path: "environments",
    paginationKey: "environments",
  });
  const sourceEnvironments = await collectEnvironments(
    request,
    sourceRepository,
    sourceEnvironmentResponse,
  );
  const sourceRepositorySecretsResponse = await request({
    repository: sourceRepository,
    path: "actions/secrets",
    paginationKey: "secrets",
  });
  const sourceKeys = await request({
    repository: sourceRepository,
    path: "keys",
    paginationKey: "array",
  });
  const sourceRulesetResponse = await request({
    repository: sourceRepository,
    path: "rulesets",
    paginationKey: "array",
  });
  const sourceRulesets = await collectRulesets(
    request,
    sourceRepository,
    sourceRulesetResponse,
  );

  return {
    release: {
      immutableReleases,
      pages,
      feedBranch,
      workflows: requireArray(
        releaseWorkflows.workflows,
        "release workflows",
      ).map(({ path, state }) => ({ path, state })),
      environments,
      repositorySecrets: requireArray(
        repositorySecretsResponse.secrets,
        "release repository secrets",
      ).map((secret) => requireObject(secret, "release repository secret").name)
        .sort(),
      deployKeys: requireArray(releaseKeys, "release deploy keys"),
      rulesets,
    },
    source: {
      workflows: requireArray(
        sourceWorkflows.workflows,
        "source workflows",
      ).map(({ path, state }) => ({ path, state })),
      environments: sourceEnvironments,
      repositorySecrets: requireArray(
        sourceRepositorySecretsResponse.secrets,
        "source repository secrets",
      ).map((secret) => requireObject(secret, "source repository secret").name)
        .sort(),
      deployKeys: requireArray(sourceKeys, "source deploy keys"),
      rulesets: sourceRulesets,
    },
  };
}

export async function runRepositoryPreflight(
  args,
  {
    collect = collectRepositoryState,
    write = (output) => process.stdout.write(output),
  } = {},
) {
  if (!Array.isArray(args) || args.length !== 1) {
    throw new RepositoryPreflightError(
      "usage: repository-preflight.mjs cutover|live",
    );
  }
  const phase = args[0];
  if (phase !== "cutover" && phase !== "live") {
    throw new RepositoryPreflightError(
      "usage: repository-preflight.mjs cutover|live",
    );
  }
  const result = auditRepositoryState(
    await collect(),
    { phase },
  );
  write(`${JSON.stringify(result, null, 2)}\n`);
  return result.errors.length > 0 ? 1 : 0;
}

async function main() {
  process.exitCode = await runRepositoryPreflight(process.argv.slice(2));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(`repository-preflight: ${error.message}`);
    process.exitCode = 1;
  });
}
