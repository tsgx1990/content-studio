#!/usr/bin/env node
/**
 * test-continuity — fixture self-test for the continuity gate. Zero dependencies.
 * Run with: node scripts/test-continuity.mjs
 * Exit 0 = all cases behaved as expected, exit 1 = a check regressed.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GATE = resolve(dirname(fileURLToPath(import.meta.url)), "check-continuity.mjs");
const tmp = mkdtempSync(join(tmpdir(), "cont-test-"));
let passed = 0, failed = 0;

function exitCode(args) {
  try { execFileSync("node", [GATE, ...args], { stdio: "pipe" }); return 0; }
  catch (e) { return typeof e.status === "number" ? e.status : 1; }
}
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✖ ${name} — ${detail}`); }
}
function writeJSON(name, obj) { const p = join(tmp, name); writeFileSync(p, JSON.stringify(obj, null, 2)); return p; }

const validState = {
  story_id: "demo",
  updated_at: "2026-06-05T00:00:00.000Z",
  premise: "A courier discovers the letters she carries are rewriting the past.",
  characters: [
    { id: "mara", name: "Mara", status: "alive", appearance: "green eyes", relationships: [{ with: "doran", type: "rival", state: "tense" }] },
    { id: "doran", name: "Doran", status: "dead", died_chapter: 2 },
  ],
  chapters: [
    { number: 1, title: "The Ninth Letter", status: "drafted", pov: "mara", cast: ["mara", "doran"] },
    { number: 2, title: "Ash", status: "drafted", pov: "mara", cast: ["mara", "doran"] },
  ],
  timeline: [ { chapter: 1, event: "Mara takes the route" }, { chapter: 2, event: "Doran dies" } ],
  foreshadowing: [ { id: "letters", setup_chapter: 1, description: "The wax seal glows", status: "resolved", resolved_chapter: 2 } ],
};
const clone = (o) => JSON.parse(JSON.stringify(o));

console.log("continuity gate:");
check("valid state -> pass", exitCode([writeJSON("ok.json", validState)]) === 0, "expected pass");

const dupId = clone(validState); dupId.characters.push({ id: "mara", name: "Mara2", status: "alive" });
check("duplicate character id -> fail", exitCode([writeJSON("dup.json", dupId)]) !== 0, "expected fail");

const badRel = clone(validState); badRel.characters[0].relationships[0].with = "ghost";
check("relationship to unknown character -> fail", exitCode([writeJSON("rel.json", badRel)]) !== 0, "expected fail");

const resurrection = clone(validState); resurrection.chapters.push({ number: 3, title: "Return", status: "planned", cast: ["doran"] });
check("dead character reappears -> fail", exitCode([writeJSON("res.json", resurrection)]) !== 0, "expected fail");

const badForeshadow = clone(validState); badForeshadow.foreshadowing[0].resolved_chapter = 0;
check("foreshadowing resolved before setup -> fail", exitCode([writeJSON("fore.json", badForeshadow)]) !== 0, "expected fail");

const badTimeline = clone(validState); badTimeline.timeline = [{ chapter: 2, event: "b" }, { chapter: 1, event: "a" }];
check("timeline out of order -> fail", exitCode([writeJSON("time.json", badTimeline)]) !== 0, "expected fail");

const badSchema = clone(validState); delete badSchema.premise;
check("schema violation (missing premise) -> fail", exitCode([writeJSON("schema.json", badSchema)]) !== 0, "expected fail");

// arcs (optional book/arc structure) ----------------------------------------
const arcState = clone(validState);
arcState.arcs = [
  { id: "a1", title: "Setup", start_chapter: 1, end_chapter: 1 },
  { id: "a2", title: "Fallout", start_chapter: 2, end_chapter: null },
];
check("valid arcs -> pass", exitCode([writeJSON("arc-ok.json", arcState)]) === 0, "expected pass");

const arcDup = clone(arcState); arcDup.arcs[1].id = "a1";
check("duplicate arc id -> fail", exitCode([writeJSON("arc-dup.json", arcDup)]) !== 0, "expected fail");

const arcOverlap = clone(arcState); arcOverlap.arcs = [
  { id: "a1", title: "Setup", start_chapter: 1, end_chapter: 2 },
  { id: "a2", title: "Fallout", start_chapter: 2, end_chapter: null },
];
check("overlapping arcs -> fail", exitCode([writeJSON("arc-overlap.json", arcOverlap)]) !== 0, "expected fail");

const arcGap = clone(validState); arcGap.arcs = [ { id: "a1", title: "Only", start_chapter: 1, end_chapter: 1 } ];
check("chapter outside every arc -> fail", exitCode([writeJSON("arc-gap.json", arcGap)]) !== 0, "expected fail (ch2 uncovered)");

const arcMidOpen = clone(arcState); arcMidOpen.arcs[0].end_chapter = null;
check("non-final arc left open -> fail", exitCode([writeJSON("arc-midopen.json", arcMidOpen)]) !== 0, "expected fail");

// continuity report arg
const okState = writeJSON("ok2.json", validState);
const goodReport = writeJSON("good.continuity.json", { content_id: "ch1", checked_at: "2026-06-05T00:00:00.000Z", conflicts: [{ type: "character", severity: "low", description: "minor" }] });
check("low-severity report -> pass", exitCode([okState, goodReport]) === 0, "expected pass");
const highReport = writeJSON("high.continuity.json", { content_id: "ch1", checked_at: "2026-06-05T00:00:00.000Z", conflicts: [{ type: "timeline", severity: "high", description: "Doran alive after death" }] });
check("high-severity report -> fail", exitCode([okState, highReport]) !== 0, "expected fail");

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
