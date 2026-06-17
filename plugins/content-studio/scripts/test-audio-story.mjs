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

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
