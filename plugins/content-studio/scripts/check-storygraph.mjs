#!/usr/bin/env node
/**
 * Deterministic story-graph gate for interactive fiction. Zero dependencies.
 *   node scripts/check-storygraph.mjs <path-to-story.if.json>
 *
 * The semantic question "is this branching story good?" is content-review's job. THIS script
 * enforces what is reproducibly checkable about the graph — a broken branch (a choice that leads
 * nowhere, an unreachable scene, a dead-end that isn't an ending) is a hard defect, not a matter
 * of taste. It is the interactive-fiction analogue of check-continuity.mjs's referential integrity:
 *
 *   1. the .if.json conforms to schemas/interactive-fiction.schema.json
 *   2. node ids are unique
 *   3. `start` references a real node
 *   4. every choice.target references a real node
 *   5. every node is reachable from `start` (no orphans)
 *   6. every node is an ending OR has >= 1 choice (no silent dead-ends)
 *   7. at least one ending is reachable from `start` (the reader can finish)
 *   8. from EVERY reachable node an ending stays reachable (no trap region — a one-way loop you can
 *      enter and never finish; the IF analogue of game-story's softlock check)
 *
 * An ending = node.ending === true OR a node with no choices.
 *
 * Exit 0 = OK. Exit 1 = blocked (reasons on stderr). Exit 2 = bad usage.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./lib/json-schema-mini.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const arg = process.argv[2];
if (!arg) {
  console.error("usage: node scripts/check-storygraph.mjs <story.if.json>");
  process.exit(2);
}
const graphPath = resolve(process.cwd(), arg);
if (!existsSync(graphPath)) {
  console.error(`story graph not found: ${graphPath}`);
  process.exit(2);
}

const reasons = [];
let graph;
try {
  graph = JSON.parse(readFileSync(graphPath, "utf8"));
} catch (e) {
  console.error(`✖ ${basename(graphPath)} is not valid JSON: ${e.message}`);
  process.exit(1);
}

// 1. schema ------------------------------------------------------------------
try {
  const schema = JSON.parse(readFileSync(resolve(REPO_ROOT, "schemas/interactive-fiction.schema.json"), "utf8"));
  for (const err of validate(graph, schema, "graph")) reasons.push(`schema: ${err}`);
} catch (e) {
  reasons.push(`could not load interactive-fiction schema: ${e.message}`);
}

const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
const byId = new Map();

// 2. unique ids --------------------------------------------------------------
for (const n of nodes) {
  if (!n || n.id == null) continue;
  if (byId.has(n.id)) reasons.push(`duplicate node id "${n.id}"`);
  else byId.set(n.id, n);
}

const isEnding = (n) => n.ending === true || !Array.isArray(n.choices) || n.choices.length === 0;

// 3. start exists ------------------------------------------------------------
if (graph.start != null && !byId.has(graph.start)) {
  reasons.push(`start node "${graph.start}" does not exist in nodes`);
}

// 4. choice targets resolve + 6. no silent dead-ends -------------------------
for (const n of byId.values()) {
  const choices = Array.isArray(n.choices) ? n.choices : [];
  for (const c of choices) {
    if (c && c.target != null && !byId.has(c.target)) {
      reasons.push(`node "${n.id}" has a choice ("${c.label}") to unknown node "${c.target}"`);
    }
  }
  if (choices.length === 0 && n.ending !== true) {
    reasons.push(`node "${n.id}" has no choices and is not marked ending:true (silent dead-end) — mark it ending or give it a choice`);
  }
}

// 5 & 7. reachability + a reachable ending -----------------------------------
if (graph.start != null && byId.has(graph.start)) {
  const seen = new Set([graph.start]);
  const queue = [graph.start];
  let reachableEnding = false;
  while (queue.length) {
    const node = byId.get(queue.shift());
    if (isEnding(node)) reachableEnding = true;
    for (const c of node.choices || []) {
      if (c && byId.has(c.target) && !seen.has(c.target)) {
        seen.add(c.target);
        queue.push(c.target);
      }
    }
  }
  for (const id of byId.keys()) {
    if (!seen.has(id)) reasons.push(`node "${id}" is unreachable from start "${graph.start}"`);
  }
  if (!reachableEnding) reasons.push(`no ending is reachable from start "${graph.start}" (the reader can never finish)`);

  // 8. no trap region: from every reachable node an ending must stay reachable.
  // Fixpoint over reverse edges — a node "can finish" if it is an ending or any choice leads to a
  // node that can finish. Any reachable node NOT in that set is a one-way trap.
  const canFinish = new Set();
  for (const n of byId.values()) if (isEnding(n)) canFinish.add(n.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of byId.values()) {
      if (canFinish.has(n.id)) continue;
      for (const c of n.choices || []) {
        if (c && canFinish.has(c.target)) { canFinish.add(n.id); changed = true; break; }
      }
    }
  }
  for (const id of seen) {
    if (!canFinish.has(id)) {
      reasons.push(`node "${id}" is reachable from start but no ending is reachable FROM it (trap region — the reader gets stuck in a loop with no way to finish); give it a path to an ending or mark a reachable ending`);
    }
  }
}

if (reasons.length) {
  console.error("✖ story-graph gate FAILED:");
  for (const r of reasons) console.error("  - " + r);
  process.exit(1);
}
const endings = [...byId.values()].filter(isEnding).length;
console.log(`✔ story-graph gate passed: ${basename(graphPath)} (${byId.size} nodes, ${endings} ending(s))`);
process.exit(0);
