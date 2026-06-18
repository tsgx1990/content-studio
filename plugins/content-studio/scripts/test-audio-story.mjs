#!/usr/bin/env node
/**
 * test-audio-story — fixture self-test for the audio-story gate. Zero dependencies.
 * Run with: node scripts/test-audio-story.mjs
 * Exit 0 = all cases behaved as expected, exit 1 = a check regressed.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GATE = resolve(dirname(fileURLToPath(import.meta.url)), "check-audio-story.mjs");
const tmp = mkdtempSync(join(tmpdir(), "audio-test-"));
let passed = 0, failed = 0;

function exitCode(args) {
  try { execFileSync("node", [GATE, ...args], { stdio: "pipe" }); return 0; }
  catch (e) { return typeof e.status === "number" ? e.status : 1; }
}
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✖ ${name} — ${detail}`); }
}
function write(name, obj) { const p = join(tmp, name); writeFileSync(p, JSON.stringify(obj, null, 2)); return p; }
const words = (n) => Array.from({ length: n }, () => "word").join(" ");
// n CJK characters (cycles a handful of 国风 chars) — used to prove CJK-aware runtime estimation.
const cjk = (n) => { const pool = "夏夜南天苍龙横亘心宿三星大火黄昏正南暑退秋生先民举火祭祀以应天时岁岁年年深红低悬温润叮咛寒暑更替四时有信"; return Array.from({ length: n }, (_, i) => pool[i % pool.length]).join(""); };
const clone = (o) => JSON.parse(JSON.stringify(o));

// target 60s @ 155 wpm => ~155 words. narration 50 + dialogue 50 + narration 50 = 150 words + 2s sfx ≈ 60s.
const valid = {
  audio_id: "demo", title: "Demo", language: "en", target_seconds: 60,
  voices: [
    { id: "narrator", name: "Narrator", kind: "narrator" },
    { id: "mara", name: "Mara", kind: "character" },
  ],
  sounds: [{ id: "wind", description: "low wind" }],
  cues: [
    { type: "narration", voice: "narrator", text: words(50) },
    { type: "sfx", sound: "wind", seconds: 2 },
    { type: "dialogue", voice: "mara", text: words(50) },
    { type: "narration", voice: "narrator", text: words(50) },
  ],
};

console.log("audio-story gate:");
check("valid audio story -> pass", exitCode([write("ok.audio.json", valid)]) === 0, "expected pass");

const dupVoice = clone(valid); dupVoice.voices.push({ id: "narrator", name: "Dup" });
check("duplicate voice id -> fail", exitCode([write("dupv.audio.json", dupVoice)]) !== 0, "expected fail");

const badVoice = clone(valid); badVoice.cues[0].voice = "ghost";
check("spoken cue names undeclared voice -> fail", exitCode([write("badv.audio.json", badVoice)]) !== 0, "expected fail");

const badSound = clone(valid); badSound.cues[1].sound = "thunder";
check("sfx names undeclared sound -> fail", exitCode([write("bads.audio.json", badSound)]) !== 0, "expected fail");

const unusedVoice = clone(valid); unusedVoice.voices.push({ id: "extra", name: "Extra" });
check("declared-but-unused voice -> fail", exitCode([write("uv.audio.json", unusedVoice)]) !== 0, "expected fail");

const unusedSound = clone(valid); unusedSound.sounds.push({ id: "rain", description: "rain" });
check("declared-but-unused sound -> fail", exitCode([write("us.audio.json", unusedSound)]) !== 0, "expected fail");

const dlgFirst = clone(valid); dlgFirst.cues = [dlgFirst.cues[2], dlgFirst.cues[0], dlgFirst.cues[1], dlgFirst.cues[3]];
check("opens on dialogue -> fail", exitCode([write("dlg1.audio.json", dlgFirst)]) !== 0, "expected fail");

const emptyText = clone(valid); emptyText.cues[0].text = "   ";
check("spoken cue with empty text -> fail", exitCode([write("empty.audio.json", emptyText)]) !== 0, "expected fail");

const noSpoken = clone(valid); noSpoken.cues = [{ type: "sfx", sound: "wind", seconds: 2 }]; noSpoken.voices = [{ id: "narrator" }];
check("no spoken cue -> fail", exitCode([write("nospk.audio.json", noSpoken)]) !== 0, "expected fail");

const tooShort = clone(valid); tooShort.cues[0].text = words(5); tooShort.cues[2].text = words(5);
check("too short for target -> fail", exitCode([write("short.audio.json", tooShort)]) !== 0, "expected fail");

const tooLong = clone(valid); tooLong.cues[0].text = words(300);
check("too long for target -> fail", exitCode([write("long.audio.json", tooLong)]) !== 0, "expected fail");

const rawDigits = clone(valid); rawDigits.cues[3].text = words(49) + " 47213";
check("uncovered digit-run -> fail", exitCode([write("digits.audio.json", rawDigits)]) !== 0, "expected fail");

const coveredDigits = clone(valid);
coveredDigits.cues[3].text = words(49) + " 47213";
coveredDigits.cues[3].say_as = [{ text: "47213", as: "digits" }];
check("digit-run covered by say_as -> pass", exitCode([write("covered.audio.json", coveredDigits)]) === 0, "expected pass");

const acronym = clone(valid); acronym.cues[3].text = words(49) + " GPS";
check("uncovered ALL-CAPS acronym -> fail", exitCode([write("acr.audio.json", acronym)]) !== 0, "expected fail");

const currency = clone(valid); currency.cues[3].text = words(49) + " $500";
check("uncovered currency -> fail", exitCode([write("cur.audio.json", currency)]) !== 0, "expected fail");

const symbol = clone(valid); symbol.cues[3].text = words(49) + " R&D";
check("uncovered hostile symbol -> fail", exitCode([write("sym.audio.json", symbol)]) !== 0, "expected fail");

const badSchema = clone(valid); delete badSchema.cues[0].type;
check("schema violation (cue missing type) -> fail", exitCode([write("schema.audio.json", badSchema)]) !== 0, "expected fail");

// A say_as that is a mere SUBSTRING of the hostile token must NOT count as covering it
// (old loose match let "N" cover "NW"); the tightened isCovered should still fail here.
const partialCover = clone(valid);
partialCover.cues[3].text = words(49) + " NW";
partialCover.cues[3].say_as = [{ text: "N", as: "characters" }];
check("substring say_as does NOT cover hostile token -> fail", exitCode([write("partial.audio.json", partialCover)]) !== 0, "expected fail");

// …but an exact say_as.text still covers it.
const exactCover = clone(valid);
exactCover.cues[3].text = words(49) + " NW";
exactCover.cues[3].say_as = [{ text: "NW", as: "characters" }];
check("exact say_as covers hostile token -> pass", exitCode([write("exact.audio.json", exactCover)]) === 0, "expected pass");

// --- CJK-aware runtime (TC-016) ---------------------------------------------
// A Chinese narrator speaks ~240 字/分, not 155 "words"/分. The OLD gate timed every CJK char at
// 155 wpm, so a 240-字 念白 (~60s of real speech) was estimated at ~93s and wrongly judged.
// 240 chars @ 240 cpm = 60s -> inside 51–69s; @ 155 "wpm" = 93s -> would have FAILED. This case
// is the regression lock: it only passes BECAUSE the estimate is CJK-aware.
const cjkOnTarget = {
  audio_id: "zh-demo", title: "心宿", language: "zh", target_seconds: 60,
  voices: [{ id: "narrator", name: "旁白", kind: "narrator" }],
  sounds: [],
  cues: [{ type: "narration", voice: "narrator", text: cjk(240) }],
};
check("CJK narration sized for target (240字@240cpm≈60s) -> pass", exitCode([write("zh-ok.audio.json", cjkOnTarget)]) === 0, "expected pass (CJK-aware ~60s, not ~93s)");

// Same 240 chars but a 30s target — too long even at 240 cpm (60s > 34.5s) -> fail (sanity: the gate
// still catches a genuinely over-length CJK piece; it isn't just always passing CJK).
const cjkTooLong = clone(cjkOnTarget); cjkTooLong.target_seconds = 30;
check("CJK narration far over its target -> fail", exitCode([write("zh-long.audio.json", cjkTooLong)]) !== 0, "expected fail (60s > 30s±15%)");

// A short CJK 念白 (120字@240cpm≈30s) with a generous 60s target was, under the old gate, estimated at
// ~46s and could slip inside tolerance — the user's "short audio wrongly judged adequate" failure.
// CJK-aware it is ~30s, correctly OUTSIDE the 51–69s band -> fail.
const cjkTooShort = clone(cjkOnTarget); cjkTooShort.cues[0].text = cjk(120);
check("short CJK 念白 vs long target (≈30s) -> fail", exitCode([write("zh-short.audio.json", cjkTooShort)]) !== 0, "expected fail (CJK-aware ~30s, not ~46s)");

// TTS-safety still applies to CJK cues: a bare 4-digit year in 中文 text needs a say_as override.
const cjkDigits = clone(cjkOnTarget); cjkDigits.cues[0].text = cjk(236) + " 2025年";
check("CJK cue with uncovered digit-run -> fail", exitCode([write("zh-digit.audio.json", cjkDigits)]) !== 0, "expected fail");
const cjkDigitsCovered = clone(cjkDigits); cjkDigitsCovered.cues[0].say_as = [{ text: "2025", as: "digits" }];
check("CJK cue digit-run covered by say_as -> pass", exitCode([write("zh-digitok.audio.json", cjkDigitsCovered)]) === 0, "expected pass");

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
