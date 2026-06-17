#!/usr/bin/env node
/**
 * test-storygraph — fixture self-test for the interactive-fiction graph gate. Zero dependencies.
 * Run with: node scripts/test-storygraph.mjs
 * Exit 0 = all cases behaved as expected, exit 1 = a check regressed.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GATE = resolve(dirname(fileURLToPath(import.meta.url)), "check-storygraph.mjs");
const tmp = mkdtempSync(join(tmpdir(), "graph-test-"));
let passed = 0, failed = 0;

function exitCode(args) {
  try { execFileSync("node", [GATE, ...args], { stdio: "pipe" }); return 0; }
  catch (e) { return typeof e.status === "number" ? e.status : 1; }
}
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✖ ${name} — ${detail}`); }
}
function writeGraph(name, obj) { const p = join(tmp, name); writeFileSync(p, JSON.stringify(obj, null, 2)); return p; }

const validGraph = {
  story_id: "demo", title: "Fork", language: "en", start: "start",
  nodes: [
    { id: "start", text: "A path splits.", choices: [{ label: "Left", target: "left" }, { label: "Right", target: "right" }] },
    { id: "left", text: "You reach a river.", choices: [{ label: "Swim", target: "win" }] },
    { id: "right", text: "You fall in a pit.", ending: true },
    { id: "win", text: "You reach home.", ending: true },
  ],
};
const clone = (o) => JSON.parse(JSON.stringify(o));

console.log("story-graph gate:");
check("valid graph -> pass", exitCode([writeGraph("ok.if.json", validGraph)]) === 0, "expected pass");

const dup = clone(validGraph); dup.nodes.push({ id: "left", text: "dup", ending: true });
check("duplicate node id -> fail", exitCode([writeGraph("dup.if.json", dup)]) !== 0, "expected fail");

const badStart = clone(validGraph); badStart.start = "nowhere";
check("start node missing -> fail", exitCode([writeGraph("start.if.json", badStart)]) !== 0, "expected fail");

const badTarget = clone(validGraph); badTarget.nodes[0].choices[0].target = "ghost";
check("choice to unknown node -> fail", exitCode([writeGraph("target.if.json", badTarget)]) !== 0, "expected fail");

const orphan = clone(validGraph); orphan.nodes.push({ id: "secret", text: "Unreachable.", ending: true });
check("unreachable node -> fail", exitCode([writeGraph("orphan.if.json", orphan)]) !== 0, "expected fail");

const deadEnd = clone(validGraph); deadEnd.nodes.find((n) => n.id === "win").ending = false; // win now has no choices and no ending
check("silent dead-end (no choices, not ending) -> fail", exitCode([writeGraph("dead.if.json", deadEnd)]) !== 0, "expected fail");

const noEnding = {
  story_id: "loop", start: "a",
  nodes: [
    { id: "a", text: "A", choices: [{ label: "go", target: "b" }] },
    { id: "b", text: "B", choices: [{ label: "back", target: "a" }] },
  ],
};
check("no reachable ending (loop) -> fail", exitCode([writeGraph("loop.if.json", noEnding)]) !== 0, "expected fail");

const badSchema = clone(validGraph); delete badSchema.nodes[0].text;
check("schema violation (node missing text) -> fail", exitCode([writeGraph("schema.if.json", badSchema)]) !== 0, "expected fail");

// Trap region: start can reach an ending (via "safe"), but the "risky" branch is a one-way loop
// with no ending reachable from it. The old gate passed this (an ending IS reachable from start);
// the new check must catch the trapped sub-region.
const trap = {
  story_id: "trap", start: "start",
  nodes: [
    { id: "start", text: "Begin.", choices: [{ label: "safe", target: "end" }, { label: "risky", target: "t1" }] },
    { id: "end", text: "Done.", ending: true },
    { id: "t1", text: "Lost.", choices: [{ label: "on", target: "t2" }] },
    { id: "t2", text: "More lost.", choices: [{ label: "back", target: "t1" }] },
  ],
};
check("trap region (reachable but can't finish) -> fail", exitCode([writeGraph("trap.if.json", trap)]) !== 0, "expected fail");

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
