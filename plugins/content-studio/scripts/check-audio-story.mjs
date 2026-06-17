#!/usr/bin/env node
/**
 * Deterministic audio-story gate. Zero dependencies.
 *   node scripts/check-audio-story.mjs <path-to-story.audio.json>
 *
 * The other verticals assume the reader can SEE the text. Audio cannot: it is consumed linearly,
 * by ear, and often voiced by a TTS engine. So the reproducible failures are different — and that
 * is what this gate enforces (grounded in docs/research/2026-06-06-audio-story-tts-safety.md):
 *
 *   1. the .audio.json conforms to schemas/audio-story.schema.json
 *   2. voice ids / sound ids are each unique; there is >= 1 voice and >= 1 spoken cue
 *   3. speaker resolution: every narration/dialogue cue names a DECLARED voice and has non-empty text
 *   4. asset resolution: every sfx/music cue names a DECLARED sound; no voice/sound is left unused
 *   5. ear-only opening: the FIRST cue is not 'dialogue' (orient the listener — narration or a sound)
 *   6. runtime within tolerance of target_seconds (spoken words / wpm + sfx/music seconds)
 *   7. TTS-SAFETY: every TTS-hostile token in spoken text (digit runs, currency, % & # @ ^ ~ _ = + * /,
 *      URLs, emails, ALL-CAPS acronyms) must be covered by a say_as override on that cue
 *
 * Defaults (overridable per file): wpm 155, tolerance 0.15. "Is the prose/voice-acting good?" is
 * content-review's job; THIS gate enforces the mechanical, ear-only correctness facts.
 *
 * Exit 0 = OK. Exit 1 = blocked (reasons on stderr). Exit 2 = bad usage.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./lib/json-schema-mini.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_WPM = 155;
const DEFAULT_TOLERANCE = 0.15;

const arg = process.argv[2];
if (!arg) {
  console.error("usage: node scripts/check-audio-story.mjs <story.audio.json>");
  process.exit(2);
}
const audioPath = resolve(process.cwd(), arg);
if (!existsSync(audioPath)) {
  console.error(`audio file not found: ${audioPath}`);
  process.exit(2);
}

const reasons = [];
let audio;
try {
  audio = JSON.parse(readFileSync(audioPath, "utf8"));
} catch (e) {
  console.error(`✖ ${basename(audioPath)} is not valid JSON: ${e.message}`);
  process.exit(1);
}

// 1. schema ------------------------------------------------------------------
try {
  const schema = JSON.parse(readFileSync(resolve(REPO_ROOT, "schemas/audio-story.schema.json"), "utf8"));
  for (const err of validate(audio, schema, "audio")) reasons.push(`schema: ${err}`);
} catch (e) {
  reasons.push(`could not load audio-story schema: ${e.message}`);
}

const countWords = (str) =>
  (String(str).match(/[A-Za-z0-9][A-Za-z0-9'’‑-]*/g) || []).length +
  (String(str).match(/[一-鿿㐀-䶿]/g) || []).length;

const voices = Array.isArray(audio.voices) ? audio.voices : [];
const sounds = Array.isArray(audio.sounds) ? audio.sounds : [];
const cues = Array.isArray(audio.cues) ? audio.cues : [];
const wpm = typeof audio.words_per_minute === "number" && audio.words_per_minute > 0 ? audio.words_per_minute : DEFAULT_WPM;
const tolerance = typeof audio.tolerance === "number" && audio.tolerance >= 0 ? audio.tolerance : DEFAULT_TOLERANCE;
const isSpoken = (c) => c && (c.type === "narration" || c.type === "dialogue");
const isSound = (c) => c && (c.type === "sfx" || c.type === "music");

// 2. unique ids --------------------------------------------------------------
const voiceIds = new Set();
for (const v of voices) {
  if (!v || v.id == null) continue;
  if (voiceIds.has(v.id)) reasons.push(`duplicate voice id "${v.id}"`);
  else voiceIds.add(v.id);
}
const soundIds = new Set();
for (const s of sounds) {
  if (!s || s.id == null) continue;
  if (soundIds.has(s.id)) reasons.push(`duplicate sound id "${s.id}"`);
  else soundIds.add(s.id);
}
if (!cues.some(isSpoken)) reasons.push("no narration/dialogue cue — an audio story needs at least one spoken cue");

// 3 + 4. speaker / asset resolution; track usage -----------------------------
const usedVoices = new Set();
const usedSounds = new Set();
cues.forEach((c, i) => {
  if (!c) return;
  const where = `cue #${i + 1} (${c.type})`;
  if (isSpoken(c)) {
    if (c.voice == null || c.voice === "") reasons.push(`${where} has no voice — every spoken cue must name a declared voice`);
    else if (!voiceIds.has(c.voice)) reasons.push(`${where} names undeclared voice "${c.voice}"`);
    else usedVoices.add(c.voice);
    if (c.text == null || String(c.text).trim() === "") reasons.push(`${where} has empty text — a spoken cue must have words`);
  } else if (isSound(c)) {
    if (c.sound == null || c.sound === "") reasons.push(`${where} has no sound — every sfx/music cue must name a declared sound`);
    else if (!soundIds.has(c.sound)) reasons.push(`${where} names undeclared sound "${c.sound}"`);
    else usedSounds.add(c.sound);
  }
});
for (const id of voiceIds) if (!usedVoices.has(id)) reasons.push(`voice "${id}" is declared but never used — remove it or give it a cue`);
for (const id of soundIds) if (!usedSounds.has(id)) reasons.push(`sound "${id}" is declared but never used — remove it or cue it`);

// 5. ear-only opening --------------------------------------------------------
if (cues.length && cues[0] && cues[0].type === "dialogue") {
  reasons.push("the first cue is 'dialogue' — open with narration or a sound to orient the listener (ear-only: no one knows who is speaking yet)");
}

// 6. runtime within tolerance ------------------------------------------------
const spokenWords = cues.filter(isSpoken).reduce((n, c) => n + countWords(c.text || ""), 0);
const soundSeconds = cues.filter(isSound).reduce((n, c) => n + (typeof c.seconds === "number" && c.seconds > 0 ? c.seconds : 0), 0);
const estSeconds = (spokenWords / wpm) * 60 + soundSeconds;
if (typeof audio.target_seconds === "number" && audio.target_seconds > 0) {
  const lo = audio.target_seconds * (1 - tolerance);
  const hi = audio.target_seconds * (1 + tolerance);
  if (estSeconds < lo || estSeconds > hi) {
    reasons.push(
      `estimated runtime ${estSeconds.toFixed(0)}s (${spokenWords} spoken words @ ${wpm} wpm` +
      `${soundSeconds ? ` + ${soundSeconds}s sound` : ""}) is outside ${lo.toFixed(0)}–${hi.toFixed(0)}s ` +
      `(target ${audio.target_seconds}s ±${Math.round(tolerance * 100)}%)`
    );
  }
}

// 7. TTS-safety / pronounceability scan --------------------------------------
// Collect TTS-hostile tokens from a spoken string. Each must be covered by a say_as entry.
function hostileTokens(text) {
  const found = new Map(); // token -> kind (dedup per cue)
  const add = (tok, kind) => { if (tok && !found.has(tok)) found.set(tok, kind); };
  const s = String(text);
  for (const m of s.matchAll(/\b(?:https?:\/\/|www\.)\S+/gi)) add(m[0], "URL");
  for (const m of s.matchAll(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/gi)) add(m[0], "email");
  for (const m of s.matchAll(/[$€£¥]\s?\d[\d.,]*/g)) add(m[0].trim(), "currency");
  for (const m of s.matchAll(/\d[\d.,]*\s?%/g)) add(m[0].trim(), "percent");
  for (const m of s.matchAll(/\d{4,}/g)) add(m[0], "digit-run");           // 4+ digits: year/code/phone — ambiguous
  for (const m of s.matchAll(/\S*[&#@^~_=+*/]\S*/g)) add(m[0], "symbol");   // token carrying a hostile symbol
  for (const m of s.matchAll(/\b[A-Z]{2,}\b/g)) add(m[0], "acronym");      // ALL-CAPS: spell-out vs word is engine-dependent
  return found;
}
// A hostile token is covered only by an EXACT say_as.text match (after trimming surrounding
// punctuation off both sides). The old loose substring match let a say_as for "N" spuriously
// "cover" the token "NW" — a false-negative the TTS-safety scan exists to prevent.
function isCovered(token, sayAs) {
  const norm = (x) => String(x).trim().replace(/^[^\p{L}\p{N}$€£¥]+|[^\p{L}\p{N}%]+$/gu, "");
  const tk = norm(token);
  return sayAs.some((sa) => {
    const t = sa && typeof sa.text === "string" ? sa.text : "";
    return t !== "" && (t === token || norm(t) === tk);
  });
}
cues.forEach((c, i) => {
  if (!isSpoken(c) || c.text == null) return;
  const sayAs = Array.isArray(c.say_as) ? c.say_as : [];
  const tokens = hostileTokens(c.text);
  for (const [tok, kind] of tokens) {
    if (!isCovered(tok, sayAs)) {
      reasons.push(`cue #${i + 1} (${c.type}) has a TTS-hostile ${kind} token "${tok}" with no say_as override — TTS will likely mis-speak it; add a say_as { text, as }`);
    }
  }
});

if (reasons.length) {
  console.error("✖ audio-story gate FAILED:");
  for (const r of reasons) console.error("  - " + r);
  process.exit(1);
}

const spokenCues = cues.filter(isSpoken).length;
const soundCues = cues.filter(isSound).length;
console.log(
  `✔ audio-story gate passed: ${basename(audioPath)} ` +
  `(${cues.length} cues — ${spokenCues} spoken / ${soundCues} sound, ${voiceIds.size} voice(s), ${soundIds.size} sound(s), ` +
  `${spokenWords} words ~${estSeconds.toFixed(0)}s @ ${wpm} wpm; speakers + sounds resolve, TTS-safe)`
);
process.exit(0);
