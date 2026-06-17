#!/usr/bin/env node
/**
 * Deterministic script gate for short dramas (微短剧 / 竖屏短剧). Zero dependencies.
 *   node scripts/check-short-drama.mjs <path-to-story.drama.json>
 *
 * "Is this a hit? Are the reversals juicy? Is the value orientation OK?" is content-review's
 * job. THIS script enforces the reproducible structure/pacing/compliance facts the genre runs on
 * (see docs/research/2026-06-06-short-drama-structure.md):
 *
 *   1. the .drama.json conforms to schemas/short-drama.schema.json
 *   2. episode numbers are 1-based, contiguous, unique, and count >= min_episodes (a real serial)
 *   3. episode 1's FIRST beat is role 'hook' (黄金前3秒 — open on conflict)
 *   4. EVERY episode ends on a non-empty cliffhanger (结尾钩子 — the genre's #1 rule)
 *   5. every episode has at least one beat
 *   6. paywall_episode (if set) resolves to a real episode and is NOT the last one (卡点卡中段)
 *   7. each episode's estimated spoken runtime is within tolerance of target_seconds_per_episode
 *   8. synopsis length >= min_synopsis_chars (备案 concept readiness)
 *
 * Defaults (overridable per drama): target_seconds_per_episode 90, spoken_cpm 240, tolerance 0.5,
 * min_episodes 2, min_synopsis_chars 100. Char counting is CJK-aware; only `lines` (spoken) count
 * toward runtime — action-only `summary` text does not.
 *
 * Exit 0 = OK. Exit 1 = blocked (reasons on stderr). Exit 2 = bad usage.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./lib/json-schema-mini.mjs";
import { findComplianceIssues } from "./lib/compliance-cn.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_TARGET_SECONDS = 90;
const DEFAULT_SPOKEN_CPM = 240;
const DEFAULT_TOLERANCE = 0.5;
const DEFAULT_MIN_EPISODES = 2;
const DEFAULT_MIN_SYNOPSIS_CHARS = 100;

const arg = process.argv[2];
if (!arg) {
  console.error("usage: node scripts/check-short-drama.mjs <story.drama.json>");
  process.exit(2);
}
const dramaPath = resolve(process.cwd(), arg);
if (!existsSync(dramaPath)) {
  console.error(`drama file not found: ${dramaPath}`);
  process.exit(2);
}

const reasons = [];
let drama;
try {
  drama = JSON.parse(readFileSync(dramaPath, "utf8"));
} catch (e) {
  console.error(`✖ ${basename(dramaPath)} is not valid JSON: ${e.message}`);
  process.exit(1);
}

// 1. schema ------------------------------------------------------------------
try {
  const schema = JSON.parse(readFileSync(resolve(REPO_ROOT, "schemas/short-drama.schema.json"), "utf8"));
  for (const err of validate(drama, schema, "drama")) reasons.push(`schema: ${err}`);
} catch (e) {
  reasons.push(`could not load short-drama schema: ${e.message}`);
}

// CJK-aware char/word count (same tokenizer family as the readability + script gates)
const countChars = (str) =>
  (String(str).match(/[A-Za-z0-9][A-Za-z0-9'’‑-]*/g) || []).length +
  (String(str).match(/[一-鿿㐀-䶿]/g) || []).length;

const episodes = Array.isArray(drama.episodes) ? drama.episodes : [];
const targetSeconds = numOr(drama.target_seconds_per_episode, DEFAULT_TARGET_SECONDS, (n) => n > 0);
const spokenCpm = numOr(drama.spoken_cpm, DEFAULT_SPOKEN_CPM, (n) => n > 0);
const tolerance = numOr(drama.tolerance, DEFAULT_TOLERANCE, (n) => n >= 0);
const minEpisodes = numOr(drama.min_episodes, DEFAULT_MIN_EPISODES, (n) => n >= 1);
const minSynopsis = numOr(drama.min_synopsis_chars, DEFAULT_MIN_SYNOPSIS_CHARS, (n) => n >= 0);
const secondsFor = (chars) => (chars / spokenCpm) * 60;

function numOr(v, dflt, ok) {
  return typeof v === "number" && ok(v) ? v : dflt;
}

if (episodes.length) {
  // 2. episode numbering: 1-based, contiguous, unique, enough of them ---------
  if (episodes.length < minEpisodes) {
    reasons.push(`only ${episodes.length} episode(s) — a serialized drama needs >= ${minEpisodes} (set min_episodes to override)`);
  }
  const nums = episodes.map((e) => e && e.number);
  const seen = new Set();
  for (let i = 0; i < episodes.length; i++) {
    const n = nums[i];
    if (n !== i + 1) {
      reasons.push(`episode at index ${i} has number ${n} — episodes must be 1-based and contiguous (expected ${i + 1})`);
    }
    if (seen.has(n)) reasons.push(`duplicate episode number ${n}`);
    seen.add(n);
  }

  // 3. episode 1 opens on a hook ---------------------------------------------
  const ep1 = episodes[0];
  const ep1Beats = ep1 && Array.isArray(ep1.beats) ? ep1.beats : [];
  if (ep1Beats.length && ep1Beats[0].role !== "hook") {
    reasons.push(`episode 1's first beat is role '${ep1Beats[0].role}', not 'hook' — open on the 黄金前3秒 conflict`);
  }

  // 4 + 5 + 7. per-episode: cliffhanger, has beats, runtime -------------------
  episodes.forEach((ep, i) => {
    const label = `episode ${ep && ep.number != null ? ep.number : i + 1}`;
    // 4. non-empty cliffhanger (THE rule)
    if (typeof ep.cliffhanger !== "string" || !ep.cliffhanger.trim()) {
      reasons.push(`${label} has no cliffhanger — every episode must end on a hook to drive the next click`);
    }
    // 5. at least one beat
    const beats = Array.isArray(ep.beats) ? ep.beats : [];
    if (!beats.length) {
      reasons.push(`${label} has no beats`);
      return;
    }
    // 7. runtime within tolerance (only spoken `lines` count)
    const chars = beats.reduce((n, b) => n + countChars(b && b.lines ? b.lines : ""), 0);
    const est = secondsFor(chars);
    const lo = targetSeconds * (1 - tolerance);
    const hi = targetSeconds * (1 + tolerance);
    if (est < lo || est > hi) {
      reasons.push(
        `${label} estimated ${est.toFixed(0)}s of dialogue (${chars} chars @ ${spokenCpm} cpm) is outside ` +
        `${lo.toFixed(0)}–${hi.toFixed(0)}s (target ${targetSeconds}s ±${Math.round(tolerance * 100)}%)`
      );
    }
  });

  // 6. paywall episode resolves and is not last ------------------------------
  if (drama.paywall_episode != null) {
    const p = drama.paywall_episode;
    if (typeof p !== "number" || !Number.isInteger(p) || p < 1 || p > episodes.length) {
      reasons.push(`paywall_episode ${p} does not resolve to a real episode (1..${episodes.length})`);
    } else if (p === episodes.length) {
      reasons.push(`paywall_episode ${p} is the last episode — the 付费卡点 must sit mid-series with episodes still to come`);
    }
  }
}

// 8. synopsis present and long enough ----------------------------------------
const synopsisChars = countChars(drama.synopsis || "");
if (synopsisChars < minSynopsis) {
  reasons.push(`synopsis is ${synopsisChars} chars (< ${minSynopsis}) — add a 内容概要 (备案 wants ≥500字)`);
}

// opt-in 中文 marketing-compliance scan (极限词 + 导流 + 行业违禁承诺). Off unless the drama
// declares a `compliance` block — keeps existing demos unaffected. Scans spoken lines, action
// summaries and the synopsis.
if (drama.compliance) {
  const c = drama.compliance;
  const parts = [drama.synopsis || ""];
  for (const ep of episodes) {
    for (const b of Array.isArray(ep.beats) ? ep.beats : []) {
      if (b && b.lines) parts.push(b.lines);
      if (b && b.summary) parts.push(b.summary);
    }
  }
  const opts = { industries: Array.isArray(c.industries) ? c.industries : [] };
  if (Array.isArray(c.extremes)) opts.extremes = c.extremes;
  if (Array.isArray(c.diversion)) opts.diversion = c.diversion;
  for (const f of findComplianceIssues(parts.join("\n"), opts)) {
    if (f.kind === "extreme") reasons.push(`极限词/违禁承诺 "${f.term}" in script — 广告法 risk (限流/罚款). Remove or soften.`);
    else if (f.kind === "diversion") reasons.push(`导流词 "${f.term}" in script — off-platform contact triggers 限流/封号. Remove it.`);
    else reasons.push(`a phone number "${f.term}" in script — remove contact info.`);
  }
}

if (reasons.length) {
  console.error("✖ short-drama gate FAILED:");
  for (const r of reasons) console.error("  - " + r);
  process.exit(1);
}

const totalChars = episodes.reduce(
  (n, ep) => n + (Array.isArray(ep.beats) ? ep.beats : []).reduce((m, b) => m + countChars(b && b.lines ? b.lines : ""), 0),
  0
);
console.log(
  `✔ short-drama gate passed: ${basename(dramaPath)} ` +
  `(${episodes.length} episodes, every episode cliffhung, ~${secondsFor(totalChars / Math.max(episodes.length, 1)).toFixed(0)}s avg dialogue/ep @ ${spokenCpm} cpm)`
);
process.exit(0);
