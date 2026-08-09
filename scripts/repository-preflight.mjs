#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export class RepositoryPreflightError extends Error {
  constructor(message) {
    super(message);
    this.name = "RepositoryPreflightError";
  }
}

export function auditRepositoryState(state, { phase } = {}) {
  if (phase !== "cutover" && phase !== "live") {
    throw new RepositoryPreflightError("phase must be cutover or live");
  }
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    throw new RepositoryPreflightError("repository state must be an object");
  }
  return { errors: [], warnings: [] };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  console.error("repository-preflight: live collection is not implemented");
  process.exitCode = 1;
}
