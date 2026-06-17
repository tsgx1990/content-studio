#!/usr/bin/env node
/**
 * test-chapter-context — fixture self-test for build-chapter-context.mjs. Zero dependencies.
 * Run with: node scripts/test-chapter-context.mjs
 * Exit 0 = all cases behaved as expected, exit 1 = a check regressed.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL = resolve(dirname(fileURLToPath(import.meta.url)), "build-chapter-context.mjs");
const tmp = mkdtempSync(join(tmpdir(), "ctx-test-"));
let passed = 0, failed = 0;

function run(args) {
  try { return { code: 0, out: execFileSync("node", [TOOL, ...args], { stdio: ["pipe", "pipe", "pipe"] }).toString() }; }
  catch (e) { return { code: typeof e.status === "number" ? e.status : 1, out: (e.stdout || "").toString() }; }
}
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✖ ${name} — ${detail}`); }
}
function writeJSON(name, obj) { const p = join(tmp, name); writeFileSync(p, JSON.stringify(obj, null, 2)); return p; }

const state = {
  story_id: "fix",
  updated_at: "2026-06-07T00:00:00.000Z",
  premise: "A linker chases a dimming beacon across fog-bound islands.",
  arcs: [
    { id: "arc1", title: "Home Island", start_chapter: 1, end_chapter: 2, goal: "find the missing mentor" },
    { id: "arc2", title: "Trade Island", start_chapter: 3, end_chapter: null, goal: "expose the Dimming" },
  ],
  characters: [
    { id: "wren", name: "Wren", status: "alive", appearance: "soot-freckled", goal: "find Hale",
      relationships: [{ with: "hale", type: "mentor", state: "missing" }, { with: "mab", type: "family", state: "left behind" }] },
    { id: "hale", name: "Hale", status: "unknown", appearance: "grey braid" },
    { id: "mab", name: "Mab", status: "alive", appearance: "young" },
    { id: "dossan", name: "Dossan", status: "alive", appearance: "burn-scarred hands" },
    { id: "tassk", name: "Tassk", status: "dead", died_chapter: 4, appearance: "tall" },
  ],
  world_rules: [
    { id: "W1", rule: "Beacons must be lit by dusk or the channel closes." },
    { id: "W2", rule: "The trade island's tide-locks only open at slack water.", arcs: ["arc2"] },
    { id: "W3", rule: "Home-island law forbids leaving a tower dark.", arcs: ["arc1"] },
  ],
  foreshadowing: [
    { id: "open-early", setup_chapter: 1, description: "A beacon dims with no storm.", status: "open" },
    { id: "later", setup_chapter: 5, description: "A sealed crate in the hold.", status: "open" },
    { id: "done", setup_chapter: 1, description: "Hale's last message.", status: "resolved", resolved_chapter: 2 },
  ],
  chapters: [
    { number: 1, title: "Dusk", status: "drafted", pov: "wren", cast: ["wren", "hale"], summary: "Wren lights the home beacon; Hale vanishes." },
    { number: 2, title: "Empty Tower", status: "drafted", pov: "wren", cast: ["wren", "mab"], summary: "Wren searches the tower." },
    { number: 3, title: "Crossing", status: "drafted", pov: "wren", cast: ["wren", "dossan"], summary: "Wren reaches the trade island." },
    { number: 4, title: "The Engineer", status: "planned", pov: "wren", cast: ["wren", "dossan", "tassk"], summary: "Dossan shows the rigged relay." },
  ],
};
const sp = writeJSON("state.json", state);

console.log("build-chapter-context:");

// bad usage / missing args
check("no chapter arg -> exit 2", run([sp]).code === 2, "expected usage error");
check("chapter not in ledger -> exit 1", run([sp, "99"]).code === 1, "expected not-found");

// markdown pack for ch3
const md = run([sp, "3"]);
check("valid chapter -> exit 0", md.code === 0, "expected pass");
check("includes on-stage cast (Dossan)", /Dossan/.test(md.out), "Dossan missing");
check("marks POV", /· POV/.test(md.out), "POV not marked");
check("shows containing arc (Trade Island)", /Trade Island/.test(md.out), "arc missing");
check("bounded footer present", /Bounded: injected/.test(md.out), "no bounding footer");

// JSON pack for ch1
const j = run([sp, "1", "--json"]);
check("json -> exit 0", j.code === 0, "expected pass");
let pack;
try { pack = JSON.parse(j.out); } catch { pack = null; }
check("json parses", !!pack, "bad json");
check("cast is exactly ch1 cast", pack && pack.cast.map((c) => c.id).sort().join(",") === "hale,wren", "wrong cast");
check("offstage link captured (Mab via Wren)", pack && pack.offstage_links.some((o) => o.id === "mab"), "offstage link missing");

// foreshadowing relevance at ch3: open-early planted (ch1) shown; later (ch5) not yet; done excluded
const j3 = JSON.parse(run([sp, "3", "--json"]).out);
const threadIds = j3.live_foreshadowing.map((f) => f.id);
check("live thread planted before N is included", threadIds.includes("open-early"), "open-early missing");
check("not-yet-planted thread excluded", !threadIds.includes("later"), "future thread leaked");
check("resolved thread excluded", !threadIds.includes("done"), "resolved thread leaked");
check("on-stage cast for ch3 is exactly wren+dossan", j3.cast.map((c) => c.id).sort().join(",") === "dossan,wren", "wrong on-stage cast");
check("off-arc relative kept only as off-stage link (Mab)", j3.offstage_links.some((o) => o.id === "mab") && !j3.cast.some((c) => c.id === "mab"), "Mab handling wrong");

// arc-scoped world rules: ch3 is arc2 -> W1 (global) + W2 (arc2), NOT W3 (arc1)
const ruleIds3 = j3.world_rules.map((r) => r.id).sort().join(",");
check("arc2 chapter gets global + arc2 rules only", ruleIds3 === "W1,W2", `got ${ruleIds3}`);
check("off-arc world rule reported as excluded", j3.excluded.off_arc_world_rules === 1, `got ${j3.excluded.off_arc_world_rules}`);
const j1rules = JSON.parse(run([sp, "1", "--json"]).out).world_rules.map((r) => r.id).sort().join(",");
check("arc1 chapter gets global + arc1 rules only", j1rules === "W1,W3", `got ${j1rules}`);

// dormant-thread flagging: open-early set up ch1, untouched; at ch3 it is 2 chapters dormant
const jDormDefault = JSON.parse(run([sp, "3", "--json"]).out).live_foreshadowing.find((f) => f.id === "open-early");
check("not flagged dormant under default threshold (6)", jDormDefault && jDormDefault.dormant === false, "wrongly dormant");
const jDorm2 = JSON.parse(run([sp, "3", "--dormant-after", "2", "--json"]).out).live_foreshadowing.find((f) => f.id === "open-early");
check("flagged dormant once past --dormant-after", jDorm2 && jDorm2.dormant === true && jDorm2.dormant_for === 2, "not flagged");
check("dormant marker rendered in markdown", /long-dormant/.test(run([sp, "3", "--dormant-after", "2"]).out), "no dormant marker");

// recent window respected
const j4 = JSON.parse(run([sp, "4", "--last", "2", "--json"]).out);
check("--last N limits recent chapters", j4.recent_chapters.length === 2, `got ${j4.recent_chapters.length}`);
check("recent are the 2 immediately prior (2,3)", j4.recent_chapters.map((c) => c.number).join(",") === "2,3", "wrong window");

// bounding: at ch3, excluded character count > 0
check("reports excluded characters (bounding)", j3.excluded.characters > 0, "nothing excluded");

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
