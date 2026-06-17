#!/usr/bin/env node
/**
 * Deterministic winnability gate for stateful choice games. Zero dependencies.
 *   node scripts/check-game-story.mjs <path-to-story.game.json>
 *
 * interactive-fiction's gate proves a *graph* is sound (every link resolves, every node
 * reachable, an ending exists). A GAME adds state — flags + an item inventory + choices that
 * are only AVAILABLE when state allows — so a graph that "looks" connected can still hide an
 * unwinnable / softlocked path (the "walking dead" defect: you can reach a scene from which you
 * can neither win nor move). THIS script makes winnability mechanical by searching (scene x state):
 *
 *   1. the .game.json conforms to schemas/game-story.schema.json
 *   2. scene ids / flag ids / item ids are each unique
 *   3. `start` references a real scene
 *   4. every choice.target references a real scene
 *   5. state referential integrity: every flag/item named by a requires_/set_/add_/remove_ is declared
 *   6. a terminal scene (ending:true OR has an outcome OR no choices) must not also carry choices;
 *      a non-terminal scene must have >= 1 choice (no silent dead-end)
 *   7. no statically-unsatisfiable requirement (an item no choice ever grants; a flag value that is
 *      neither the initial nor ever set) — a fast, sound subset of unwinnability with a crisp message
 *   8. WINNABILITY (BFS over (scene, state) from the start state): a scene with outcome:"win" is reachable
 *   9. NO SOFTLOCK: every reachable non-terminal (scene, state) has >= 1 available choice
 *  10. NO ORPHAN: every authored scene is reachable in some reachable state
 *
 * State is restricted to booleans (flags) + a finite item set, so the reachable space is finite and
 * the search terminates. A safety cap aborts with an explicit "inconclusive" rather than hanging.
 *
 * Exit 0 = OK. Exit 1 = blocked (reasons on stderr). Exit 2 = bad usage.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./lib/json-schema-mini.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATE_CAP = 200000; // guard against pathological state spaces; authored games are tiny

const arg = process.argv[2];
if (!arg) {
  console.error("usage: node scripts/check-game-story.mjs <story.game.json>");
  process.exit(2);
}
const gamePath = resolve(process.cwd(), arg);
if (!existsSync(gamePath)) {
  console.error(`game file not found: ${gamePath}`);
  process.exit(2);
}

const reasons = [];
let game;
try {
  game = JSON.parse(readFileSync(gamePath, "utf8"));
} catch (e) {
  console.error(`✖ ${basename(gamePath)} is not valid JSON: ${e.message}`);
  process.exit(1);
}

// 1. schema ------------------------------------------------------------------
try {
  const schema = JSON.parse(readFileSync(resolve(REPO_ROOT, "schemas/game-story.schema.json"), "utf8"));
  for (const err of validate(game, schema, "game")) reasons.push(`schema: ${err}`);
} catch (e) {
  reasons.push(`could not load game-story schema: ${e.message}`);
}

const scenes = Array.isArray(game.scenes) ? game.scenes : [];
const flagDefs = Array.isArray(game.flags) ? game.flags : [];
const itemDefs = Array.isArray(game.items) ? game.items : [];

// 2. unique ids --------------------------------------------------------------
const byId = new Map();
for (const s of scenes) {
  if (!s || s.id == null) continue;
  if (byId.has(s.id)) reasons.push(`duplicate scene id "${s.id}"`);
  else byId.set(s.id, s);
}
const flagIds = new Set();
for (const f of flagDefs) {
  if (!f || f.id == null) continue;
  if (flagIds.has(f.id)) reasons.push(`duplicate flag id "${f.id}"`);
  else flagIds.add(f.id);
}
const itemIds = new Set();
for (const it of itemDefs) {
  if (!it || it.id == null) continue;
  if (itemIds.has(it.id)) reasons.push(`duplicate item id "${it.id}"`);
  else itemIds.add(it.id);
}

const flagInitial = new Map(); // id -> bool
for (const f of flagDefs) if (f && f.id != null) flagInitial.set(f.id, f.initial === true);

// helpers to read choice shape with defaults
const reqFlags = (c) => (Array.isArray(c.requires_flags) ? c.requires_flags : []);
const reqItems = (c) => (Array.isArray(c.requires_items) ? c.requires_items : []);
const setFlags = (c) => (Array.isArray(c.set_flags) ? c.set_flags : []);
const addItems = (c) => (Array.isArray(c.add_items) ? c.add_items : []);
const remItems = (c) => (Array.isArray(c.remove_items) ? c.remove_items : []);
const fval = (f) => (f.value === undefined ? true : f.value === true);

const explicitlyTerminal = (s) => s.ending === true || s.outcome != null;
const isTerminal = (s) =>
  explicitlyTerminal(s) || !Array.isArray(s.choices) || s.choices.length === 0;

// 3. start exists ------------------------------------------------------------
if (game.start != null && !byId.has(game.start)) {
  reasons.push(`start scene "${game.start}" does not exist in scenes`);
}

// 4 + 5 + 6. structural / referential integrity ------------------------------
for (const s of byId.values()) {
  const choices = Array.isArray(s.choices) ? s.choices : [];
  if (explicitlyTerminal(s) && choices.length > 0) {
    reasons.push(`scene "${s.id}" is terminal (${s.outcome ? `outcome:"${s.outcome}"` : "ending:true"}) but still has ${choices.length} choice(s) — a terminal scene must not have choices`);
  }
  if (!explicitlyTerminal(s) && choices.length === 0) {
    reasons.push(`scene "${s.id}" has no choices and is not marked terminal (no outcome/ending) — silent dead-end`);
  }
  for (const c of choices) {
    if (!c) continue;
    if (c.target != null && !byId.has(c.target)) {
      reasons.push(`scene "${s.id}" has a choice ("${c.label}") to unknown scene "${c.target}"`);
    }
    for (const rf of reqFlags(c)) if (rf && rf.id != null && !flagIds.has(rf.id)) reasons.push(`scene "${s.id}" choice ("${c.label}") requires undeclared flag "${rf.id}"`);
    for (const sf of setFlags(c)) if (sf && sf.id != null && !flagIds.has(sf.id)) reasons.push(`scene "${s.id}" choice ("${c.label}") sets undeclared flag "${sf.id}"`);
    for (const ri of reqItems(c)) if (!itemIds.has(ri)) reasons.push(`scene "${s.id}" choice ("${c.label}") requires undeclared item "${ri}"`);
    for (const ai of addItems(c)) if (!itemIds.has(ai)) reasons.push(`scene "${s.id}" choice ("${c.label}") adds undeclared item "${ai}"`);
    for (const di of remItems(c)) if (!itemIds.has(di)) reasons.push(`scene "${s.id}" choice ("${c.label}") removes undeclared item "${di}"`);
  }
}

// 7. statically-unsatisfiable requirements -----------------------------------
// Build what is producible across ALL choices (a sound over-approximation of "ever obtainable").
const grantableItems = new Set();
const flagCanBeTrue = new Set();
const flagCanBeFalse = new Set();
for (const id of flagIds) {
  if (flagInitial.get(id) === true) flagCanBeTrue.add(id);
  else flagCanBeFalse.add(id);
}
for (const s of byId.values()) {
  for (const c of Array.isArray(s.choices) ? s.choices : []) {
    if (!c) continue;
    for (const ai of addItems(c)) if (itemIds.has(ai)) grantableItems.add(ai);
    for (const sf of setFlags(c)) {
      if (sf && flagIds.has(sf.id)) (fval(sf) ? flagCanBeTrue : flagCanBeFalse).add(sf.id);
    }
  }
}
for (const s of byId.values()) {
  for (const c of Array.isArray(s.choices) ? s.choices : []) {
    if (!c) continue;
    for (const ri of reqItems(c)) {
      if (itemIds.has(ri) && !grantableItems.has(ri)) {
        reasons.push(`scene "${s.id}" choice ("${c.label}") requires item "${ri}" that no choice ever grants — unobtainable (softlock by design)`);
      }
    }
    for (const rf of reqFlags(c)) {
      if (!flagIds.has(rf.id)) continue;
      const need = fval(rf);
      const ok = need ? flagCanBeTrue.has(rf.id) : flagCanBeFalse.has(rf.id);
      if (!ok) {
        reasons.push(`scene "${s.id}" choice ("${c.label}") requires flag "${rf.id}"=${need} that is neither its initial value nor ever set — unsatisfiable`);
      }
    }
  }
}

// Bail before the BFS if the structure is already broken (BFS assumes resolvable targets).
const structurallyBroken = reasons.length > 0;

// 8 + 9 + 10. winnability / softlock / orphan via BFS over (scene, state) ----
let inconclusive = false;
const reachableScenes = new Set();
let reachedWin = false;
const softlocks = []; // {scene}
const hasAnyWinScene = [...byId.values()].some((s) => s.outcome === "win");

if (!structurallyBroken && game.start != null && byId.has(game.start)) {
  // canonical state key: flags as sorted id=val over ALL declared flags + sorted held items
  const allFlagIds = [...flagIds].sort();
  const stateKey = (flags, items) =>
    allFlagIds.map((id) => `${id}=${flags.get(id) ? 1 : 0}`).join(",") + "|" + [...items].sort().join(",");

  const initFlags = new Map();
  for (const id of flagIds) initFlags.set(id, flagInitial.get(id) === true);
  const seen = new Set();
  const seenSoftlock = new Set();
  const start = { scene: game.start, flags: initFlags, items: new Set() };
  const queue = [start];
  seen.add(`${start.scene}::${stateKey(start.flags, start.items)}`);

  while (queue.length) {
    if (seen.size > STATE_CAP) { inconclusive = true; break; }
    const cur = queue.shift();
    const scene = byId.get(cur.scene);
    reachableScenes.add(cur.scene);
    if (scene.outcome === "win") reachedWin = true;
    if (isTerminal(scene)) continue;

    const choices = Array.isArray(scene.choices) ? scene.choices : [];
    let availableHere = 0;
    for (const c of choices) {
      if (!c || !byId.has(c.target)) continue;
      // available? requirements satisfied in current state
      const flagsOk = reqFlags(c).every((rf) => (cur.flags.get(rf.id) === true) === fval(rf));
      const itemsOk = reqItems(c).every((ri) => cur.items.has(ri));
      if (!flagsOk || !itemsOk) continue;
      availableHere++;
      // apply effects
      const nf = new Map(cur.flags);
      for (const sf of setFlags(c)) nf.set(sf.id, fval(sf));
      const ni = new Set(cur.items);
      for (const ai of addItems(c)) ni.add(ai);
      for (const di of remItems(c)) ni.delete(di);
      const key = `${c.target}::${stateKey(nf, ni)}`;
      if (!seen.has(key)) {
        seen.add(key);
        queue.push({ scene: c.target, flags: nf, items: ni });
      }
    }
    if (availableHere === 0 && !seenSoftlock.has(cur.scene)) {
      seenSoftlock.add(cur.scene);
      softlocks.push(cur.scene);
    }
  }

  if (inconclusive) {
    reasons.push(`winnability inconclusive: reachable state space exceeded ${STATE_CAP} configurations (too many independent flags/items) — simplify the game's state`);
  } else {
    if (!hasAnyWinScene) {
      reasons.push(`no scene has outcome:"win" — a game needs at least one winning ending`);
    } else if (!reachedWin) {
      reasons.push(`no winning ending (outcome:"win") is reachable from start "${game.start}" — the game is unwinnable`);
    }
    for (const id of softlocks) {
      reasons.push(`scene "${id}" is reachable in a state with NO available choice and is not terminal (softlock / walking-dead) — guarantee an always-available escape or mark it terminal`);
    }
    for (const id of byId.keys()) {
      if (!reachableScenes.has(id)) reasons.push(`scene "${id}" is unreachable in every reachable state (orphan)`);
    }
  }
}

if (reasons.length) {
  console.error("✖ game-story gate FAILED:");
  for (const r of reasons) console.error("  - " + r);
  process.exit(1);
}

const winCount = [...byId.values()].filter((s) => s.outcome === "win").length;
const loseCount = [...byId.values()].filter((s) => s.outcome === "lose").length;
console.log(`✔ game-story gate passed: ${basename(gamePath)} (${byId.size} scenes, ${flagIds.size} flag(s), ${itemIds.size} item(s), ${winCount} win / ${loseCount} lose ending(s); winnable, no softlock)`);
process.exit(0);
