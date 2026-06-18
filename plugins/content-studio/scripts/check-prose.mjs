#!/usr/bin/env node
/**
 * Deterministic gate for the prose-card (micro-story / short narrative) vertical. Zero dependencies.
 *   node scripts/check-prose.mjs <path-to.prose.json>
 *
 * This is the LIGHTWEIGHT vertical — plain narrative text with none of the audio-story scaffolding
 * (no voices/sounds/cues, no TTS-safety gate, no runtime gate). So this gate enforces only the few
 * mechanical facts worth blocking on; "is the story good?" (voice, arc, payoff) stays content-review:
 *
 *   1. the .prose.json conforms to schemas/prose.schema.json
 *   2. title length within [1, title_max] (default 40 units — a title, not a paragraph)
 *   3. body length within [min, max] (default 60..800 CJK-AWARE units — a 汉字 or a Latin word = 1,
 *      so a ~250-字 Chinese micro-story and a ~250-word English one are judged on the same scale)
 *   4. OPT-IN only: if the file carries a `compliance` block, scan title+body for ZH 极限词/承诺词
 *      (off by default so fiction using 最/第一 in dialogue isn't false-tripped)
 *
 * AI-tell / voice scanning runs on the rendered .md (check-ai-tells.mjs) in the skill workflow, not
 * here. Length counting reuses lib/cjk-pacing (the single source the script/audio gates use).
 * All limits are overridable per file. Exit 0 = OK. 1 = blocked. 2 = bad usage.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./lib/json-schema-mini.mjs";
import { countWords } from "./lib/cjk-pacing.mjs";
import { EXTREME_TERMS, findComplianceIssues } from "./lib/compliance-cn.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULTS = { min: 60, max: 800, title_max: 40 };

const arg = process.argv[2];
if (!arg) {
  console.error("usage: node scripts/check-prose.mjs <file.prose.json>");
  process.exit(2);
}
const srcPath = resolve(process.cwd(), arg);
if (!existsSync(srcPath)) {
  console.error(`prose file not found: ${srcPath}`);
  process.exit(2);
}

const reasons = [];
let prose;
try {
  prose = JSON.parse(readFileSync(srcPath, "utf8"));
} catch (e) {
  console.error(`✖ ${basename(srcPath)} is not valid JSON: ${e.message}`);
  process.exit(1);
}

// 1. schema ------------------------------------------------------------------
try {
  const schema = JSON.parse(readFileSync(resolve(REPO_ROOT, "schemas/prose.schema.json"), "utf8"));
  for (const err of validate(prose, schema, "prose")) reasons.push(`schema: ${err}`);
} catch (e) {
  reasons.push(`could not load prose schema: ${e.message}`);
}

const L = { ...DEFAULTS, ...(prose.length || {}) };

// 2. title length (CJK-aware units) ------------------------------------------
if (typeof prose.title === "string") {
  const n = countWords(prose.title);
  if (n > L.title_max) reasons.push(`title is ${n} units > max ${L.title_max} (keep it a title, not a paragraph)`);
}

// 3. body length band (CJK-aware units) --------------------------------------
if (typeof prose.body === "string") {
  const n = countWords(prose.body);
  if (n < L.min) reasons.push(`body is ${n} units < min ${L.min} (too thin for a story card; widen length.min only if you mean it)`);
  if (n > L.max) reasons.push(`body is ${n} units > max ${L.max} (a prose card should stay short; raise length.max only if you mean it)`);
}

// 4. OPT-IN compliance scan (only when a `compliance` block is present) -------
if (prose.compliance && typeof prose.compliance === "object") {
  const industries = Array.isArray(prose.compliance.industries) ? prose.compliance.industries : [];
  const haystack = `${prose.title || ""}\n${prose.body || ""}`;
  // A prose card has no platform, so diversion (微信/二维码…) and phone rules don't apply — scan only
  // 极限词 + (opt-in) industry 承诺词, which findComplianceIssues both return as kind "extreme".
  for (const f of findComplianceIssues(haystack, { extremes: EXTREME_TERMS, diversion: [], industries, scanPhone: false })) {
    reasons.push(`极限词/承诺词 "${f.term}" in title/body — absolute/guarantee claims carry 广告法 risk. Remove or soften it.`);
  }
}

if (reasons.length) {
  console.error("✖ prose gate FAILED:");
  for (const r of reasons) console.error("  - " + r);
  process.exit(1);
}
console.log(
  `✔ prose gate passed: ${basename(srcPath)} ` +
  `(title ${countWords(prose.title)} units, body ${countWords(prose.body)} units)`
);
process.exit(0);
