#!/usr/bin/env node
/**
 * test-readability — fixture self-test for the children-story readability gate. Zero dependencies.
 * Run with: node scripts/test-readability.mjs
 * Exit 0 = all cases behaved as expected, exit 1 = a check regressed.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GATE = resolve(dirname(fileURLToPath(import.meta.url)), "check-readability.mjs");
const tmp = mkdtempSync(join(tmpdir(), "read-test-"));
let passed = 0, failed = 0;

function exitCode(args) {
  try { execFileSync("node", [GATE, ...args], { stdio: "pipe" }); return 0; }
  catch (e) { return typeof e.status === "number" ? e.status : 1; }
}
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✖ ${name} — ${detail}`); }
}
// Writes a story .md and its sibling .spec.json, returns the .md path.
function story(name, prose, spec) {
  const md = join(tmp, name + ".md");
  writeFileSync(md, prose);
  writeFileSync(join(tmp, name + ".spec.json"), JSON.stringify(spec, null, 2));
  return md;
}

const baseSpec = {
  story_id: "demo", age_band: "6-8", language: "en",
  educational_point: "Sharing makes more fun, not less.",
  safety: { avoid: ["blood", "gun", "kill"] },
};
const clone = (o) => JSON.parse(JSON.stringify(o));
// ~60 short words, short sentences — comfortably inside the 6-8 band (250 min? no — make it pass: pad).
const sentence = "The small fox shared her berries with a friend. ";
const okProse = "# A Story\n\n" + sentence.repeat(40); // 40 * 9 words = 360 words, 40 sentences of 9 words

console.log("readability gate:");

check("valid story -> pass", exitCode([story("ok", okProse, baseSpec)]) === 0, "expected pass");

// too short: a couple of sentences only, well under 250
check("too short for band -> fail",
  exitCode([story("short", "# T\n\n" + sentence.repeat(3), baseSpec)]) !== 0, "expected fail");

// too long: 6-8 max is 900; 120 * 9 = 1080 words
check("too long for band -> fail",
  exitCode([story("long", "# T\n\n" + sentence.repeat(120), baseSpec)]) !== 0, "expected fail");

// one monster sentence (no terminator) -> exceeds max single-sentence cap (22 for 6-8)
const longSentence = "and then the fox and the badger and the owl and the mouse and the hare and the deer and the wren all walked together slowly through the dark and tangled wood without stopping " ;
check("over-long single sentence -> fail",
  exitCode([story("monster", "# T\n\n" + sentence.repeat(30) + longSentence + ".", baseSpec)]) !== 0, "expected fail");

// banned safety term present
const unsafeSpec = clone(baseSpec);
check("forbidden safety term -> fail",
  exitCode([story("unsafe", "# T\n\n" + sentence.repeat(35) + "There was blood everywhere. ", unsafeSpec)]) !== 0, "expected fail");

// missing spec file
const lonely = join(tmp, "lonely.md");
writeFileSync(lonely, okProse);
check("missing spec sidecar -> fail", exitCode([lonely]) !== 0, "expected fail");

// schema violation: bad age_band
const badBand = clone(baseSpec); badBand.age_band = "teen";
check("invalid age_band -> fail", exitCode([story("band", okProse, badBand)]) !== 0, "expected fail");

// schema violation: missing educational_point
const noPoint = clone(baseSpec); delete noPoint.educational_point;
check("missing educational_point -> fail", exitCode([story("nopoint", okProse, noPoint)]) !== 0, "expected fail");

// word-boundary safety: "war" must NOT fire inside "warm" (regression for substring false-positive)
const warmSpec = clone(baseSpec); warmSpec.safety = { avoid: ["war", "kill"] };
check("banned 'war' does not match 'warm' -> pass",
  exitCode([story("warm", "# T\n\n" + "The fox felt warm and safe by the fire. ".repeat(45), warmSpec)]) === 0, "expected pass");

// spec override widens the cap so a longer story passes
const wide = clone(baseSpec); wide.readability = { word_count: { min: 10, max: 5000 } };
check("spec override (wider word_count) -> pass",
  exitCode([story("wide", "# T\n\n" + sentence.repeat(120), wide)]) === 0, "expected pass");

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
