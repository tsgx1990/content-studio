#!/usr/bin/env node
/**
 * validate-sidecar — check a JSON sidecar against its contract in schemas/.
 * Zero dependencies. Run with: node scripts/validate-sidecar.mjs <file.json>
 *
 * Auto-detects the schema from the filename:
 *   *.review.json    -> schemas/review.schema.json
 *   *.research.json  -> schemas/keyword-research.schema.json
 *   *.continuity.json-> schemas/continuity-report.schema.json
 *   *.spec.json      -> schemas/children-story.schema.json
 *   *.if.json        -> schemas/interactive-fiction.schema.json
 *   *.script.json    -> schemas/youtube-script.schema.json
 *   *.note.json      -> schemas/xhs-post.schema.json
 *   *.drama.json     -> schemas/short-drama.schema.json
 *   *.lesson.json    -> schemas/english-learning-story.schema.json
 *   *.game.json      -> schemas/game-story.schema.json
 *   *.audio.json     -> schemas/audio-story.schema.json
 *   *.feedback.json  -> schemas/topic-feedback.schema.json
*   *.data.json      -> schemas/data-anchors.schema.json
 *   .../state.json   -> schemas/story-state.schema.json
 *
 * Exit 0 = valid. Exit 1 = invalid (errors on stderr). Exit 2 = bad usage.
 *
 * The publish gate (check-prepublish.mjs) validates the review sidecar itself; this CLI lets
 * the research sidecar be enforced too (e.g. from the keyword-research skill before drafting).
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./lib/json-schema-mini.mjs";
import { SCHEMA_BY_SUFFIX } from "./lib/gates.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/validate-sidecar.mjs <path-to-sidecar.json>");
  process.exit(2);
}

const filePath = resolve(process.cwd(), target);
if (!existsSync(filePath)) {
  console.error(`sidecar not found: ${filePath}`);
  process.exit(2);
}

const match = SCHEMA_BY_SUFFIX.find(([re]) => re.test(filePath));
if (!match) {
  console.error(`cannot tell which schema applies to ${basename(filePath)} (expected *.review.json or *.research.json)`);
  process.exit(2);
}

let data, schema;
try {
  data = JSON.parse(readFileSync(filePath, "utf8"));
} catch (e) {
  console.error(`✖ ${basename(filePath)} is not valid JSON: ${e.message}`);
  process.exit(1);
}
try {
  schema = JSON.parse(readFileSync(resolve(REPO_ROOT, match[1]), "utf8"));
} catch (e) {
  console.error(`could not load ${match[1]}: ${e.message}`);
  process.exit(2);
}

const errors = validate(data, schema, basename(filePath));
if (errors.length) {
  console.error(`✖ ${basename(filePath)} does not conform to ${match[1]}:`);
  for (const err of errors) console.error("  - " + err);
  process.exit(1);
}

console.log(`✔ ${basename(filePath)} conforms to ${match[1]}`);
process.exit(0);
