#!/usr/bin/env node
/**
 * test-game-story — fixture self-test for the stateful-choice-game winnability gate. Zero deps.
 * Run with: node scripts/test-game-story.mjs
 * Exit 0 = all cases behaved as expected, exit 1 = a check regressed.
 *
 * The point is to prove the gate has TEETH the graph gate lacks: it must block an unwinnable
 * game, a softlock (a reachable non-terminal scene with no available move), an unobtainable
 * requirement, and a circular item dependency that only (scene x state) BFS can see.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GATE = resolve(dirname(fileURLToPath(import.meta.url)), "check-game-story.mjs");
const tmp = mkdtempSync(join(tmpdir(), "game-test-"));
let passed = 0, failed = 0;

function exitCode(args) {
  try { execFileSync("node", [GATE, ...args], { stdio: "pipe" }); return 0; }
  catch (e) { return typeof e.status === "number" ? e.status : 1; }
}
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✖ ${name} — ${detail}`); }
}
function writeGame(name, obj) { const p = join(tmp, name); writeFileSync(p, JSON.stringify(obj, null, 2)); return p; }
const clone = (o) => JSON.parse(JSON.stringify(o));

// A winnable puzzle: read the diary (knows_combo) -> open the drawer (brass_key) -> unlock the
// door (win). Every non-terminal scene keeps an always-available "step back", so no softlock.
const valid = {
  game_id: "locked-study", title: "The Locked Study", language: "en", start: "study",
  flags: [{ id: "knows_combo", initial: false, label: "knows the safe combination" }],
  items: [{ id: "brass_key", label: "a small brass key" }],
  scenes: [
    { id: "study", text: "You wake locked in a dusty study. A bookshelf, a desk, a heavy door, a high window.",
      choices: [
        { label: "Examine the bookshelf", target: "bookshelf" },
        { label: "Examine the desk", target: "desk" },
        { label: "Try the heavy door", target: "door" },
        { label: "Climb out the high window", target: "window" },
      ] },
    { id: "bookshelf", text: "A diary lies open. Pencilled inside the cover: a four-digit number.",
      choices: [
        { label: "Memorize the number", target: "study", set_flags: [{ id: "knows_combo", value: true }] },
        { label: "Step back", target: "study" },
      ] },
    { id: "desk", text: "The desk drawer has a small combination lock.",
      choices: [
        { label: "Enter the combination and open the drawer", target: "desk_open",
          requires_flags: [{ id: "knows_combo", value: true }], add_items: ["brass_key"] },
        { label: "Step back", target: "study" },
      ] },
    { id: "desk_open", text: "The drawer slides open. A small brass key sits inside. You take it.",
      choices: [{ label: "Return to the room", target: "study" }] },
    { id: "door", text: "The heavy door is locked from the inside, with a small brass keyhole.",
      choices: [
        { label: "Unlock the door with the brass key and leave", target: "escape", requires_items: ["brass_key"] },
        { label: "Step back", target: "study" },
      ] },
    { id: "escape", text: "The key turns. The door swings open and you walk free.", outcome: "win" },
    { id: "window", text: "You squeeze through — three storeys up. The fall is the last thing you feel.", outcome: "lose" },
  ],
};

console.log("game-story gate:");
check("valid winnable game -> pass", exitCode([writeGame("ok.game.json", valid)]) === 0, "expected pass");

const dup = clone(valid); dup.scenes.push({ id: "study", text: "dup", outcome: "neutral" });
check("duplicate scene id -> fail", exitCode([writeGame("dup.game.json", dup)]) !== 0, "expected fail");

const badStart = clone(valid); badStart.start = "nowhere";
check("start scene missing -> fail", exitCode([writeGame("start.game.json", badStart)]) !== 0, "expected fail");

const badTarget = clone(valid); badTarget.scenes[0].choices[0].target = "ghost";
check("choice to unknown scene -> fail", exitCode([writeGame("target.game.json", badTarget)]) !== 0, "expected fail");

const badFlag = clone(valid); badFlag.scenes[2].choices[0].requires_flags = [{ id: "ghost_flag", value: true }];
check("requires undeclared flag -> fail", exitCode([writeGame("flag.game.json", badFlag)]) !== 0, "expected fail");

const badItem = clone(valid); badItem.scenes[4].choices[0].requires_items = ["ghost_item"];
check("requires undeclared item -> fail", exitCode([writeGame("item.game.json", badItem)]) !== 0, "expected fail");

const terminalWithChoices = clone(valid);
terminalWithChoices.scenes.find((s) => s.id === "escape").choices = [{ label: "linger", target: "study" }];
check("terminal scene with choices -> fail", exitCode([writeGame("termch.game.json", terminalWithChoices)]) !== 0, "expected fail");

const deadEnd = clone(valid);
deadEnd.scenes.push({ id: "void", text: "An empty alcove." }); // no choices, no outcome -> silent dead-end
deadEnd.scenes[0].choices.push({ label: "Step into the alcove", target: "void" });
check("silent dead-end (no choices, not terminal) -> fail", exitCode([writeGame("dead.game.json", deadEnd)]) !== 0, "expected fail");

const noWinScene = clone(valid);
noWinScene.scenes.find((s) => s.id === "escape").outcome = "neutral"; // no win anywhere
check("no winning ending exists -> fail", exitCode([writeGame("nowin.game.json", noWinScene)]) !== 0, "expected fail");

// circular item dependency: opening the drawer (which GRANTS the key) now also REQUIRES the key.
// Static check passes (the key IS grantable somewhere); only (scene x state) BFS sees it is
// unwinnable — you can never obtain the key, so the win is unreachable.
const circular = clone(valid);
circular.scenes.find((s) => s.id === "desk").choices[0].requires_items = ["brass_key"];
check("circular item dependency -> unwinnable (BFS-only) -> fail", exitCode([writeGame("circ.game.json", circular)]) !== 0, "expected fail");

const unobtainable = clone(valid);
unobtainable.items.push({ id: "magic_wand" });
unobtainable.scenes.find((s) => s.id === "door").choices[0].requires_items = ["magic_wand"]; // never granted
check("requires item no choice grants -> fail", exitCode([writeGame("unobt.game.json", unobtainable)]) !== 0, "expected fail");

const orphan = clone(valid);
orphan.scenes.push({ id: "attic", text: "A sealed attic no door reaches.", outcome: "neutral" });
check("orphan scene (unreachable) -> fail", exitCode([writeGame("orphan.game.json", orphan)]) !== 0, "expected fail");

const badSchema = clone(valid); delete badSchema.scenes[0].text;
check("schema violation (scene missing text) -> fail", exitCode([writeGame("schema.game.json", badSchema)]) !== 0, "expected fail");

// Dedicated softlock: a pit you can fall into without the rope needed to climb out. The rope IS
// declarable+grantable (so the static unobtainable check passes), but a player can reach the pit
// in a state without it -> a reachable non-terminal scene with NO available choice.
const softlock = {
  game_id: "pit", start: "ledge",
  flags: [], items: [{ id: "rope" }],
  scenes: [
    { id: "ledge", text: "A ledge above a pit. A coil of rope lies nearby.",
      choices: [
        { label: "Grab the rope", target: "ledge2", add_items: ["rope"] },
        { label: "Jump down into the pit", target: "pit" },
      ] },
    { id: "ledge2", text: "Rope in hand.",
      choices: [{ label: "Jump down into the pit", target: "pit" }] },
    { id: "pit", text: "The pit floor. Sheer walls all around.",
      choices: [{ label: "Climb out with the rope", target: "out", requires_items: ["rope"] }] },
    { id: "out", text: "You climb free.", outcome: "win" },
  ],
};
check("softlock (reach pit without the rope) -> fail", exitCode([writeGame("softlock.game.json", softlock)]) !== 0, "expected fail");

// The same world, but the pit also offers an always-available way back up -> no softlock, winnable.
const softlockFixed = clone(softlock);
softlockFixed.scenes.find((s) => s.id === "pit").choices.push({ label: "Yell for help and wait", target: "ledge" });
check("softlock fixed (escape hatch added) -> pass", exitCode([writeGame("softfix.game.json", softlockFixed)]) === 0, "expected pass");

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
