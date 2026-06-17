#!/usr/bin/env node
/**
 * test-script — fixture self-test for the youtube-script gate. Zero dependencies.
 * Run with: node scripts/test-script.mjs
 * Exit 0 = all cases behaved as expected, exit 1 = a check regressed.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GATE = resolve(dirname(fileURLToPath(import.meta.url)), "check-script.mjs");
const tmp = mkdtempSync(join(tmpdir(), "script-test-"));
let passed = 0, failed = 0;

function exitCode(args) {
  try { execFileSync("node", [GATE, ...args], { stdio: "pipe" }); return 0; }
  catch (e) { return typeof e.status === "number" ? e.status : 1; }
}
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✖ ${name} — ${detail}`); }
}
function writeScript(name, obj) { const p = join(tmp, name); writeFileSync(p, JSON.stringify(obj, null, 2)); return p; }
// n words of filler narration
const words = (n) => Array.from({ length: n }, () => "word").join(" ");

// target 60s @ 150 wpm => 150 words. Build a valid ~150-word script: hook 20 + body 110 + cta 20.
const validScript = {
  script_id: "demo", title: "Demo", language: "en", target_seconds: 60,
  sections: [
    { role: "hook", title: "Hook", narration: words(20) },
    { role: "intro", title: "Intro", narration: words(30) },
    { role: "segment", title: "Point 1", narration: words(50) },
    { role: "segment", title: "Point 2", narration: words(30) },
    { role: "cta", title: "CTA", narration: words(20) },
  ],
};
const clone = (o) => JSON.parse(JSON.stringify(o));

console.log("script gate:");
check("valid script (~150 words ≈ 60s) -> pass", exitCode([writeScript("ok.script.json", validScript)]) === 0, "expected pass");

const noHookFirst = clone(validScript); noHookFirst.sections[0].role = "intro";
check("hook not first -> fail", exitCode([writeScript("hook1.script.json", noHookFirst)]) !== 0, "expected fail");

const noCta = clone(validScript); noCta.sections[4].role = "outro";
check("no CTA -> fail", exitCode([writeScript("cta.script.json", noCta)]) !== 0, "expected fail");

const tooShort = clone(validScript); tooShort.sections[2].narration = words(5); // ~75 words << 150
check("too short for target -> fail", exitCode([writeScript("short.script.json", tooShort)]) !== 0, "expected fail");

const tooLong = clone(validScript); tooLong.sections[2].narration = words(300); // ~400 words >> 150
check("too long for target -> fail", exitCode([writeScript("long.script.json", tooLong)]) !== 0, "expected fail");

const longHook = clone(validScript); longHook.sections[0].narration = words(60); // ~24s hook > 15s
check("hook too long -> fail", exitCode([writeScript("hooklen.script.json", longHook)]) !== 0, "expected fail");

const badSchema = clone(validScript); delete badSchema.sections[1].narration;
check("schema violation (missing narration) -> fail", exitCode([writeScript("schema.script.json", badSchema)]) !== 0, "expected fail");

// override wpm: slow delivery (75 wpm) makes ~145 words ≈ 116s, valid for a 120s target.
// (Hook shortened to 15 words so it stays under the 15s cap at the slower rate: 15/75*60 = 12s.)
const slow = clone(validScript); slow.words_per_minute = 75; slow.target_seconds = 120;
slow.sections[0].narration = words(15);
check("wpm override re-targets runtime -> pass", exitCode([writeScript("slow.script.json", slow)]) === 0, "expected pass");

// CJK timing: a Chinese script is timed at cpm (default 240), not the English wpm. 240 chars ≈ 60s;
// under the OLD char-as-word-at-150-wpm logic this same script estimated ~96s and was wrongly blocked.
const cjk = (n) => "中".repeat(n);
const zhScript = {
  script_id: "zh", title: "中文脚本", language: "zh", target_seconds: 60,
  sections: [
    { role: "hook", title: "钩子", narration: cjk(40) },   // 40/240*60 = 10s < 15s cap
    { role: "intro", title: "引入", narration: cjk(60) },
    { role: "segment", title: "要点", narration: cjk(80) },
    { role: "cta", title: "行动", narration: cjk(60) },
  ],
};
check("CJK script timed at cpm (~60s) -> pass", exitCode([writeScript("zh.script.json", zhScript)]) === 0, "expected pass");

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
