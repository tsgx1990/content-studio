#!/usr/bin/env node
/**
 * Deterministic script gate for YouTube scripts. Zero dependencies.
 *   node scripts/check-script.mjs <path-to-story.script.json>
 *
 * "Is this script engaging?" is content-review's job. THIS script enforces the reproducible,
 * retention-grounded structure + pacing facts (see docs/research/2026-06-06-youtube-script-pacing.md):
 *
 *   1. the .script.json conforms to schemas/youtube-script.schema.json
 *   2. the FIRST section is role 'hook' (you only get ~10s — lead with it)
 *   3. there is at least one 'cta' section (ask the viewer to do something)
 *   4. estimated runtime (sum of narration words / wpm) is within tolerance of target_seconds
 *   5. the hook is short enough (estimated hook seconds <= max_hook_seconds)
 *
 * Defaults (overridable per script): wpm 150, chars_per_minute 240, tolerance 0.15, max_hook_seconds 15.
 * Runtime is CJK-aware: Latin words are timed at `wpm`, CJK characters at `chars_per_minute` (a
 * Chinese narrator speaks ~240 chars/min, not 150 "words"/min) — mixing the two under one English
 * rate badly mis-estimates non-English scripts. 'visual' notes are NOT counted.
 *
 * Exit 0 = OK. Exit 1 = blocked (reasons on stderr). Exit 2 = bad usage.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./lib/json-schema-mini.mjs";
import { findComplianceIssues } from "./lib/compliance-cn.mjs";
import { DEFAULT_WPM, DEFAULT_CPM, countWords, secondsForText as secondsFor } from "./lib/cjk-pacing.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TOLERANCE = 0.15;
const DEFAULT_MAX_HOOK_SECONDS = 15;

const arg = process.argv[2];
if (!arg) {
  console.error("usage: node scripts/check-script.mjs <story.script.json>");
  process.exit(2);
}
const scriptPath = resolve(process.cwd(), arg);
if (!existsSync(scriptPath)) {
  console.error(`script file not found: ${scriptPath}`);
  process.exit(2);
}

const reasons = [];
let script;
try {
  script = JSON.parse(readFileSync(scriptPath, "utf8"));
} catch (e) {
  console.error(`✖ ${basename(scriptPath)} is not valid JSON: ${e.message}`);
  process.exit(1);
}

// 1. schema ------------------------------------------------------------------
try {
  const schema = JSON.parse(readFileSync(resolve(REPO_ROOT, "schemas/youtube-script.schema.json"), "utf8"));
  for (const err of validate(script, schema, "script")) reasons.push(`schema: ${err}`);
} catch (e) {
  reasons.push(`could not load youtube-script schema: ${e.message}`);
}

const sections = Array.isArray(script.sections) ? script.sections : [];
const wpm = typeof script.words_per_minute === "number" && script.words_per_minute > 0 ? script.words_per_minute : DEFAULT_WPM;
const cpm = typeof script.chars_per_minute === "number" && script.chars_per_minute > 0 ? script.chars_per_minute : DEFAULT_CPM;
const tolerance = typeof script.tolerance === "number" && script.tolerance >= 0 ? script.tolerance : DEFAULT_TOLERANCE;
const maxHookSeconds = typeof script.max_hook_seconds === "number" && script.max_hook_seconds > 0 ? script.max_hook_seconds : DEFAULT_MAX_HOOK_SECONDS;
// Time Latin words at wpm and CJK characters at cpm — for a pure-English script this is identical
// to the old words/wpm estimate (no CJK chars), but a Chinese script is no longer mis-estimated.
const secondsForText = (str) => secondsFor(str, wpm, cpm);

if (sections.length) {
  // 2. hook is first ---------------------------------------------------------
  if (sections[0].role !== "hook") {
    reasons.push(`the first section must be role 'hook' (it is '${sections[0].role}') — lead with the hook`);
  }
  // 3. has a CTA -------------------------------------------------------------
  if (!sections.some((s) => s && s.role === "cta")) {
    reasons.push("no section has role 'cta' — add a call to action (subscribe / link / next step)");
  }
  // 4. runtime within tolerance ---------------------------------------------
  const totalWords = sections.reduce((n, s) => n + countWords(s.narration || ""), 0);
  const estSeconds = sections.reduce((n, s) => n + secondsForText(s.narration || ""), 0);
  if (typeof script.target_seconds === "number" && script.target_seconds > 0) {
    const lo = script.target_seconds * (1 - tolerance);
    const hi = script.target_seconds * (1 + tolerance);
    if (estSeconds < lo || estSeconds > hi) {
      reasons.push(
        `estimated runtime ${estSeconds.toFixed(0)}s (${totalWords} words @ ${wpm} wpm / ${cpm} cpm) is outside ` +
        `${lo.toFixed(0)}–${hi.toFixed(0)}s (target ${script.target_seconds}s ±${Math.round(tolerance * 100)}%)`
      );
    }
  }
  // 5. hook short enough -----------------------------------------------------
  const hook = sections.find((s) => s && s.role === "hook");
  if (hook) {
    const hookSeconds = secondsForText(hook.narration || "");
    if (hookSeconds > maxHookSeconds) {
      reasons.push(`hook is ~${hookSeconds.toFixed(0)}s of narration > max ${maxHookSeconds}s — tighten it (you have ~10s to grab the viewer)`);
    }
  }
}

// opt-in 中文 marketing-compliance scan (极限词 + 导流 + 行业违禁承诺). Off unless the script
// declares a `compliance` block — keeps EN/other scripts and existing demos unaffected.
if (script.compliance) {
  const c = script.compliance;
  const text = sections.map((s) => (s && s.narration ? s.narration : "")).join("\n");
  const opts = { industries: Array.isArray(c.industries) ? c.industries : [] };
  if (Array.isArray(c.extremes)) opts.extremes = c.extremes;
  if (Array.isArray(c.diversion)) opts.diversion = c.diversion;
  for (const f of findComplianceIssues(text, opts)) {
    if (f.kind === "extreme") reasons.push(`极限词/违禁承诺 "${f.term}" in narration — 广告法 risk (限流/罚款). Remove or soften.`);
    else if (f.kind === "diversion") reasons.push(`导流词 "${f.term}" in narration — off-platform contact triggers 限流/封号. Remove it.`);
    else reasons.push(`a phone number "${f.term}" in narration — remove contact info.`);
  }
}

if (reasons.length) {
  console.error("✖ script gate FAILED:");
  for (const r of reasons) console.error("  - " + r);
  process.exit(1);
}
const totalWords = sections.reduce((n, s) => n + countWords(s.narration || ""), 0);
const totalSeconds = sections.reduce((n, s) => n + secondsForText(s.narration || ""), 0);
console.log(
  `✔ script gate passed: ${basename(scriptPath)} ` +
  `(${sections.length} sections, ${totalWords} words, ~${totalSeconds.toFixed(0)}s @ ${wpm} wpm / ${cpm} cpm)`
);
process.exit(0);
