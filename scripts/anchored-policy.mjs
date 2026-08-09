#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export class AnchoredPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = "AnchoredPolicyError";
  }
}

export function auditAnchoredPullRequestData(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new AnchoredPolicyError("anchored pull request data must be an object");
  }
  return [];
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.error("anchored-policy: bounded CLI is not implemented");
  process.exitCode = 1;
}
