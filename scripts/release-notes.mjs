import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export function makeReleaseNotes({ version, channel, sourceSha }) {
  return [
    `Zergchat ${version} (${channel}, universal macOS)`,
    "",
    `Built from Epoch-ML/zerg commit ${sourceSha} after source, dependency, Apple platform-signature, updater-signature, and artifact verification.`,
    "",
    "Important upgrade notice: existing native Zergchat installations through 0.1.8 cannot reach this public updater feed. Please download and install this release manually once; automatic in-app updates begin with this updater-v2 build.",
    "",
  ].join("\n");
}

async function main() {
  const [outputPath, version, channel, sourceSha] = process.argv.slice(2);
  if ([outputPath, version, channel, sourceSha].some((value) => value === undefined)) {
    throw new Error(
      "usage: release-notes.mjs OUTPUT_PATH VERSION CHANNEL SOURCE_SHA",
    );
  }
  await writeFile(
    outputPath,
    makeReleaseNotes({ version, channel, sourceSha }),
    { flag: "wx" },
  );
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
