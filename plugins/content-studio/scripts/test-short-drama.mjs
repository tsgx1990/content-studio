#!/usr/bin/env node
/**
 * test-short-drama — fixture self-test for the short-drama (微短剧) gate. Zero dependencies.
 * Run with: node scripts/test-short-drama.mjs
 * Exit 0 = all cases behaved as expected, exit 1 = a check regressed.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GATE = resolve(dirname(fileURLToPath(import.meta.url)), "check-short-drama.mjs");
const tmp = mkdtempSync(join(tmpdir(), "drama-test-"));
let passed = 0, failed = 0;

function exitCode(args) {
  try { execFileSync("node", [GATE, ...args], { stdio: "pipe" }); return 0; }
  catch (e) { return typeof e.status === "number" ? e.status : 1; }
}
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✖ ${name} — ${detail}`); }
}
function writeDrama(name, obj) { const p = join(tmp, name); writeFileSync(p, JSON.stringify(obj, null, 2)); return p; }
const clone = (o) => JSON.parse(JSON.stringify(o));
// n CJK chars of filler spoken lines (countChars counts each CJK char individually)
const cjk = (n) => "字".repeat(n);

// target 90s @ 240 cpm, tolerance 0.5 => band 45–135s => 180–540 spoken chars.
// 300 chars => 75s, comfortably in band.
const ep = (number, firstRole, lines) => ({
  number,
  title: `第${number}集`,
  beats: [
    { role: firstRole, summary: "开场", lines: cjk(Math.ceil(lines / 2)) },
    { role: "escalation", summary: "升级", lines: cjk(Math.floor(lines / 2)) },
  ],
  cliffhanger: "结尾留下强悬念，逼观众点下一集。",
});

const validDrama = {
  drama_id: "demo", title: "逆袭千金", language: "zh", genre: "逆袭",
  synopsis: cjk(140),
  target_seconds_per_episode: 90,
  paywall_episode: 2,
  episodes: [ep(1, "hook", 300), ep(2, "setup", 300), ep(3, "twist", 300)],
};

console.log("short-drama gate:");
check("valid drama -> pass", exitCode([writeDrama("ok.drama.json", validDrama)]) === 0, "expected pass");

const ep1NoHook = clone(validDrama); ep1NoHook.episodes[0].beats[0].role = "setup";
check("episode 1 not opening on a hook -> fail", exitCode([writeDrama("hook.drama.json", ep1NoHook)]) !== 0, "expected fail");

const noCliff = clone(validDrama); noCliff.episodes[1].cliffhanger = "   ";
check("an episode with an empty cliffhanger -> fail", exitCode([writeDrama("cliff.drama.json", noCliff)]) !== 0, "expected fail");

const noBeats = clone(validDrama); noBeats.episodes[2].beats = [];
check("an episode with no beats -> fail", exitCode([writeDrama("beats.drama.json", noBeats)]) !== 0, "expected fail");

const nonContig = clone(validDrama); nonContig.episodes[2].number = 4;
check("non-contiguous episode numbering -> fail", exitCode([writeDrama("contig.drama.json", nonContig)]) !== 0, "expected fail");

const tooShort = clone(validDrama); tooShort.episodes[1].beats = [{ role: "setup", summary: "x", lines: cjk(40) }];
check("an episode's dialogue too short -> fail", exitCode([writeDrama("short.drama.json", tooShort)]) !== 0, "expected fail");

const tooLong = clone(validDrama); tooLong.episodes[1].beats = [{ role: "setup", summary: "x", lines: cjk(900) }];
check("an episode's dialogue too long -> fail", exitCode([writeDrama("long.drama.json", tooLong)]) !== 0, "expected fail");

const paywallLast = clone(validDrama); paywallLast.paywall_episode = 3;
check("paywall on the last episode -> fail", exitCode([writeDrama("pwlast.drama.json", paywallLast)]) !== 0, "expected fail");

const paywallOOR = clone(validDrama); paywallOOR.paywall_episode = 9;
check("paywall episode out of range -> fail", exitCode([writeDrama("pwoor.drama.json", paywallOOR)]) !== 0, "expected fail");

const shortSynopsis = clone(validDrama); shortSynopsis.synopsis = cjk(20);
check("synopsis too short -> fail", exitCode([writeDrama("syn.drama.json", shortSynopsis)]) !== 0, "expected fail");

const oneEp = clone(validDrama); oneEp.episodes = [ep(1, "hook", 300)]; delete oneEp.paywall_episode;
check("only one episode (< min_episodes) -> fail", exitCode([writeDrama("one.drama.json", oneEp)]) !== 0, "expected fail");

const badSchema = clone(validDrama); delete badSchema.episodes[0].beats[0].role;
check("schema violation (beat missing role) -> fail", exitCode([writeDrama("schema.drama.json", badSchema)]) !== 0, "expected fail");

// override: at default 240 cpm, 600-char episodes (150s) would be too long; spoken_cpm 480 re-targets to 75s.
const fastTalk = clone(validDrama);
fastTalk.spoken_cpm = 480;
fastTalk.episodes = [ep(1, "hook", 600), ep(2, "setup", 600), ep(3, "twist", 600)];
check("spoken_cpm override re-targets runtime -> pass", exitCode([writeDrama("fast.drama.json", fastTalk)]) === 0, "expected pass");

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
