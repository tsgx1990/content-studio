#!/usr/bin/env node
/**
 * Deterministic readability / age-appropriateness gate for children's stories. Zero dependencies.
 *   node scripts/check-readability.mjs <path-to-story.md> [<path-to-spec.json>]
 *
 * Semantic quality ("is this a good, kind, age-appropriate story?") stays with content-review.
 * THIS script enforces what is reproducibly checkable from the prose + the story spec — the
 * children-story analogue of check-continuity.mjs (no-resurrection) for fiction:
 *
 *   1. the <basename>.spec.json sidecar exists, is valid JSON, and conforms to its schema
 *   2. word count is within the age band's range
 *   3. average sentence length is within the age band's cap
 *   4. no single sentence exceeds the age band's hard cap
 *   5. none of spec.safety.avoid terms appear in the prose (case-insensitive substring)
 *
 * Bounds come from AGE_BANDS (grounded in docs/research/2026-06-05-childrens-readability.md);
 * the spec may override any of them via `readability`. Counting is CJK-aware (a CJK character
 * counts as one token; sentences split on both Latin .!? and CJK 。！？… terminators).
 *
 * Exit 0 = OK. Exit 1 = blocked (reasons on stderr). Exit 2 = bad usage.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./lib/json-schema-mini.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Per-band defaults for ONE short story (not a whole book). See the research note for provenance.
const AGE_BANDS = {
  "3-5":  { word_count: { min: 80,  max: 500 },  max_avg_sentence_words: 10, max_sentence_words: 16 },
  "6-8":  { word_count: { min: 250, max: 900 },  max_avg_sentence_words: 14, max_sentence_words: 22 },
  "9-12": { word_count: { min: 600, max: 2500 }, max_avg_sentence_words: 17, max_sentence_words: 28 },
};

const storyArg = process.argv[2];
if (!storyArg) {
  console.error("usage: node scripts/check-readability.mjs <story.md> [<spec.json>]");
  process.exit(2);
}
const storyPath = resolve(process.cwd(), storyArg);
if (!existsSync(storyPath)) {
  console.error(`story file not found: ${storyPath}`);
  process.exit(2);
}
const specPath = process.argv[3]
  ? resolve(process.cwd(), process.argv[3])
  : storyPath.replace(/\.md$/i, ".spec.json");

const reasons = [];

// --- 1. spec exists + schema ------------------------------------------------
let spec = null;
if (!existsSync(specPath)) {
  reasons.push(`missing story spec: ${basename(specPath)} (run the children-story skill first)`);
} else {
  try {
    spec = JSON.parse(readFileSync(specPath, "utf8"));
  } catch (e) {
    reasons.push(`story spec is not valid JSON: ${e.message}`);
  }
}
if (spec) {
  try {
    const schema = JSON.parse(readFileSync(resolve(REPO_ROOT, "schemas/children-story.schema.json"), "utf8"));
    for (const err of validate(spec, schema, "spec")) reasons.push(`spec schema: ${err}`);
  } catch (e) {
    reasons.push(`could not load schemas/children-story.schema.json: ${e.message}`);
  }
}

// --- prose extraction + CJK-aware tokenizing --------------------------------
function extractProse(md) {
  let s = md;
  s = s.replace(/^---\n[\s\S]*?\n---\n/, "");      // strip a YAML front-matter block if present
  s = s.replace(/^#{1,6}\s.*$/gm, "");             // drop ATX headings (titles)
  s = s.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1"); // images/links -> their text
  s = s.replace(/[*_`>#]/g, "");                   // strip residual markdown markers
  return s;
}
const countWords = (str) =>
  (str.match(/[A-Za-z0-9][A-Za-z0-9'’‑-]*/g) || []).length +
  (str.match(/[一-鿿㐀-䶿]/g) || []).length;
const splitSentences = (str) =>
  str.split(/[.!?]+(?=\s|$)|[。！？…]+/).map((x) => x.trim()).filter(Boolean);

const rawContent = readFileSync(storyPath, "utf8");
const prose = extractProse(rawContent);
const sentences = splitSentences(prose);
const totalWords = countWords(prose);
const sentenceCount = sentences.length;
const avgSentenceWords = sentenceCount ? totalWords / sentenceCount : 0;
let longest = { words: 0, text: "" };
for (const sen of sentences) {
  const w = countWords(sen);
  if (w > longest.words) longest = { words: w, text: sen };
}

// --- 2-4. readability bounds (band defaults, spec may override) -------------
if (spec && spec.age_band) {
  const band = AGE_BANDS[spec.age_band];
  if (!band) {
    reasons.push(`unknown age_band "${spec.age_band}" (expected one of ${Object.keys(AGE_BANDS).join(", ")})`);
  } else {
    const ov = spec.readability || {};
    const wc = { ...band.word_count, ...(ov.word_count || {}) };
    const maxAvg = ov.max_avg_sentence_words ?? band.max_avg_sentence_words;
    const maxOne = ov.max_sentence_words ?? band.max_sentence_words;

    if (totalWords < wc.min) reasons.push(`too short for age ${spec.age_band}: ${totalWords} words < min ${wc.min}`);
    if (totalWords > wc.max) reasons.push(`too long for age ${spec.age_band}: ${totalWords} words > max ${wc.max}`);
    if (avgSentenceWords > maxAvg) {
      reasons.push(`average sentence too long for age ${spec.age_band}: ${avgSentenceWords.toFixed(1)} words/sentence > max ${maxAvg}`);
    }
    if (longest.words > maxOne) {
      reasons.push(`a sentence is too long for age ${spec.age_band}: ${longest.words} words > max ${maxOne} — "${longest.text.slice(0, 60)}…"`);
    }
  }
}

// --- 5. safety: banned terms must not appear --------------------------------
// ASCII terms match on WORD BOUNDARIES (so "war" does not fire inside "warm", nor "kill" in
// "skill"); CJK/other terms have no word boundaries, so fall back to substring.
function termPresent(hay, term) {
  const t = String(term).toLowerCase().trim();
  if (!t) return false;
  if (/^[\x20-\x7e]+$/.test(t) && /[a-z0-9]/.test(t)) {
    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${esc}\\b`, "i").test(hay);
  }
  return hay.includes(t);
}
if (spec && spec.safety && Array.isArray(spec.safety.avoid)) {
  const hay = prose.toLowerCase();
  for (const term of spec.safety.avoid) {
    if (termPresent(hay, term)) {
      reasons.push(`safety: forbidden term "${term}" appears in the story (spec.safety.avoid)`);
    }
  }
}

if (reasons.length) {
  console.error("✖ readability gate FAILED:");
  for (const r of reasons) console.error("  - " + r);
  process.exit(1);
}
console.log(
  `✔ readability gate passed: ${basename(storyPath)} ` +
  `(${totalWords} words, ${sentenceCount} sentences, avg ${avgSentenceWords.toFixed(1)}, longest ${longest.words})`
);
process.exit(0);
