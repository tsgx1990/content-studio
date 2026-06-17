#!/usr/bin/env node
/**
 * Deterministic gate for English-learning stories (CEFR graded readers). Zero dependencies.
 *   node scripts/check-graded-reader.mjs <path-to-story.lesson.json>
 *
 * "Is this story pedagogically good / culturally apt?" is content-review's job. THIS script enforces
 * the reproducible grading facts (see docs/research/2026-06-06-cefr-graded-reader.md):
 *
 *   1. the .lesson.json conforms to schemas/english-learning-story.schema.json
 *   2. every sentence's word count <= the level's cap (A1 8 .. C2 26)
 *   3. the story's total word count is within the level's band (A1 60–250 .. C2 900–3500)
 *   4. every target-vocabulary word appears >= min_target_repetitions times (inflection-aware)
 *   5. the undeclared-beyond-core word ratio <= the level's budget (A1 0.10 .. C2 0.80)
 *
 * A word is CONTROLLED if it (or a simple inflection) is in the shipped high-frequency core, OR is a
 * declared target word, OR is a proper noun (capitalized, non-sentence-initial), OR is a number, OR
 * is in the lesson's allowed_extra. Everything else is undeclared beyond-core. Per-level defaults are
 * overridable per lesson. The core is a STARTER list (scripts/lib/english-core-vocab.mjs), not an
 * authoritative CEFR wordlist — the gate is an approximate floor, and it reports the offending words.
 *
 * Exit 0 = OK. Exit 1 = blocked (reasons on stderr). Exit 2 = bad usage.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./lib/json-schema-mini.mjs";
import { CORE } from "./lib/english-core-vocab.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Per-CEFR-level defaults (grounded in the research note).
const LEVELS = {
  A1: { max_sentence_words: 8,  min_words: 60,  max_words: 250,  max_uncontrolled_ratio: 0.10 },
  A2: { max_sentence_words: 10, min_words: 150, max_words: 500,  max_uncontrolled_ratio: 0.15 },
  B1: { max_sentence_words: 14, min_words: 300, max_words: 900,  max_uncontrolled_ratio: 0.25 },
  B2: { max_sentence_words: 18, min_words: 500, max_words: 1500, max_uncontrolled_ratio: 0.40 },
  C1: { max_sentence_words: 22, min_words: 700, max_words: 2500, max_uncontrolled_ratio: 0.60 },
  C2: { max_sentence_words: 26, min_words: 900, max_words: 3500, max_uncontrolled_ratio: 0.80 },
};
const DEFAULT_MIN_TARGET_REPETITIONS = 2;

const arg = process.argv[2];
if (!arg) {
  console.error("usage: node scripts/check-graded-reader.mjs <story.lesson.json>");
  process.exit(2);
}
const lessonPath = resolve(process.cwd(), arg);
if (!existsSync(lessonPath)) {
  console.error(`lesson file not found: ${lessonPath}`);
  process.exit(2);
}

const reasons = [];
let lesson;
try {
  lesson = JSON.parse(readFileSync(lessonPath, "utf8"));
} catch (e) {
  console.error(`✖ ${basename(lessonPath)} is not valid JSON: ${e.message}`);
  process.exit(1);
}

// 1. schema ------------------------------------------------------------------
try {
  const schema = JSON.parse(readFileSync(resolve(REPO_ROOT, "schemas/english-learning-story.schema.json"), "utf8"));
  for (const err of validate(lesson, schema, "lesson")) reasons.push(`schema: ${err}`);
} catch (e) {
  reasons.push(`could not load english-learning-story schema: ${e.message}`);
}

const level = LEVELS[lesson.cefr_level];
if (!level && lesson.cefr_level != null) {
  reasons.push(`unknown cefr_level '${lesson.cefr_level}' (expected one of ${Object.keys(LEVELS).join(", ")})`);
}

// Resolve effective params (per-lesson overrides win) -------------------------
const numOr = (v, dflt, ok) => (typeof v === "number" && ok(v) ? v : dflt);
const base = level || LEVELS.B1;
const maxSentenceWords = numOr(lesson.max_sentence_words, base.max_sentence_words, (n) => n > 0);
const minWords = numOr(lesson.min_words, base.min_words, (n) => n >= 0);
const maxWords = numOr(lesson.max_words, base.max_words, (n) => n > 0);
const maxUncontrolled = numOr(lesson.max_uncontrolled_ratio, base.max_uncontrolled_ratio, (n) => n >= 0 && n <= 1);
const minReps = numOr(lesson.min_target_repetitions, DEFAULT_MIN_TARGET_REPETITIONS, (n) => n >= 1);

const story = typeof lesson.story === "string" ? lesson.story : "";

// --- tokenization -----------------------------------------------------------
const WORD_RE = /[A-Za-z]+(?:'[A-Za-z]+)?/g;
const tokens = story.match(WORD_RE) || [];

// split into sentences on . ! ? … (and keep simple); strip a leading quote.
const sentences = story
  .replace(/\s+/g, " ")
  .split(/(?<=[.!?…])\s+/)
  .map((s) => s.trim())
  .filter(Boolean);

const allowedExtra = new Set((Array.isArray(lesson.allowed_extra) ? lesson.allowed_extra : []).map((w) => String(w).toLowerCase()));

// inflection-aware: is the bare lowercased form (or a simple stem) in `set`?
function inSet(word, set) {
  const w = word.toLowerCase().replace(/'(s|re|ll|ve|d|m|t)$/,'').replace(/n't$/,'');
  if (set.has(w)) return true;
  const cands = [];
  if (w.endsWith("ies")) cands.push(w.slice(0, -3) + "y");
  if (w.endsWith("ied")) cands.push(w.slice(0, -3) + "y");
  if (w.endsWith("es")) cands.push(w.slice(0, -2));
  if (w.endsWith("s")) cands.push(w.slice(0, -1));
  if (w.endsWith("ed")) { cands.push(w.slice(0, -2)); cands.push(w.slice(0, -1)); }
  if (w.endsWith("ing")) { cands.push(w.slice(0, -3)); cands.push(w.slice(0, -3) + "e"); }
  if (w.endsWith("er")) { cands.push(w.slice(0, -2)); cands.push(w.slice(0, -1)); }
  if (w.endsWith("est")) { cands.push(w.slice(0, -3)); cands.push(w.slice(0, -2)); }
  if (w.endsWith("ly")) cands.push(w.slice(0, -2));
  if (w.endsWith("d")) cands.push(w.slice(0, -1));
  return cands.some((c) => c.length >= 1 && set.has(c));
}

// target-vocab set (lowercased headwords) for the controlled check
const targets = Array.isArray(lesson.target_vocabulary) ? lesson.target_vocabulary : [];
const targetSet = new Set(targets.map((t) => t && String(t.word || "").toLowerCase()).filter(Boolean));

// count an inflection-aware occurrence of a headword across tokens
function countOccurrences(headword) {
  const hw = String(headword).toLowerCase();
  const single = new Set([hw]);
  let n = 0;
  for (const tok of tokens) if (inSet(tok, single)) n++;
  return n;
}

if (level || lesson.cefr_level == null) {
  // 2. sentence-length cap ----------------------------------------------------
  const offenders = [];
  for (const s of sentences) {
    const wc = (s.match(WORD_RE) || []).length;
    if (wc > maxSentenceWords) offenders.push({ wc, s });
  }
  if (offenders.length) {
    offenders.sort((a, b) => b.wc - a.wc);
    const worst = offenders.slice(0, 3).map((o) => `${o.wc}w: "${o.s.slice(0, 60)}${o.s.length > 60 ? "…" : ""}"`);
    reasons.push(
      `${offenders.length} sentence(s) over the ${lesson.cefr_level || "?"} cap of ${maxSentenceWords} words/sentence — worst: ${worst.join(" | ")}`
    );
  }

  // 3. story word-count band --------------------------------------------------
  const totalWords = tokens.length;
  if (totalWords < minWords || totalWords > maxWords) {
    reasons.push(`story is ${totalWords} words — outside the ${lesson.cefr_level || "?"} band ${minWords}–${maxWords}`);
  }

  // 4. target-vocab coverage / repetition ------------------------------------
  for (const t of targets) {
    const word = t && t.word;
    if (!word) continue;
    const n = countOccurrences(word);
    if (n < minReps) {
      reasons.push(`target word "${word}" appears ${n}x (< ${minReps}) — repeat it so the learner actually meets it`);
    }
  }

  // 5. undeclared beyond-core budget -----------------------------------------
  // Proper-noun heuristic: a surface form seen Capitalized in a NON-sentence-initial slot anywhere
  // is treated as a name everywhere (so names at the start of a sentence aren't flagged as hard words).
  const properNouns = new Set();
  for (const s of sentences) {
    const m = s.match(WORD_RE) || [];
    for (let j = 1; j < m.length; j++) {
      if (/^[A-Z]/.test(m[j])) properNouns.add(m[j]);
    }
  }
  const uncontrolled = [];
  for (const tok of tokens) {
    if (properNouns.has(tok)) continue; // a known name anywhere in the text
    if (inSet(tok, CORE) || inSet(tok, targetSet) || inSet(tok, allowedExtra)) continue;
    uncontrolled.push(tok.toLowerCase());
  }
  const total = tokens.length || 1;
  const ratio = uncontrolled.length / total;
  if (ratio > maxUncontrolled) {
    const uniq = [...new Set(uncontrolled)];
    const sample = uniq.slice(0, 12).join(", ");
    reasons.push(
      `undeclared beyond-core words are ${(ratio * 100).toFixed(1)}% (> ${(maxUncontrolled * 100).toFixed(0)}% ${lesson.cefr_level || "?"} budget) — ` +
      `${uniq.length} distinct: ${sample}${uniq.length > 12 ? ", …" : ""} (gloss them as target_vocabulary, add to allowed_extra, or simplify)`
    );
  }
}

if (reasons.length) {
  console.error("✖ graded-reader gate FAILED:");
  for (const r of reasons) console.error("  - " + r);
  process.exit(1);
}

console.log(
  `✔ graded-reader gate passed: ${basename(lessonPath)} ` +
  `(${lesson.cefr_level}, ${tokens.length} words, ${sentences.length} sentences, ${targets.length} target words)`
);
process.exit(0);
