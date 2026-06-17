#!/usr/bin/env node
/**
 * Deterministic continuity gate for long-form. Zero dependencies.
 *   node scripts/check-continuity.mjs <path-to-state.json> [<path-to-chapter.continuity.json>]
 *
 * The semantic question "does this prose contradict the bible?" is the continuity-editor
 * subagent's job (it writes the .continuity.json report). THIS script enforces what is
 * reproducibly checkable from the structured state — the enforcement layer that turns the
 * story bible from "a dictionary nobody consults" into a gate:
 *
 *   1. state.json conforms to schemas/story-state.schema.json
 *   2. referential integrity: unique character ids + chapter numbers; relationships / pov / cast
 *      reference real character ids; timeline chapters exist in the chapter ledger
 *   3. timeline chapter numbers are non-decreasing in order
 *   4. foreshadowing: resolved => resolved_chapter >= setup_chapter; open => no resolved_chapter
 *   5. no resurrection: a dead character (with died_chapter) is not in any later chapter's cast
 *   6. arcs (if present): unique ids, strictly-increasing non-overlapping ranges, every chapter in
 *      exactly one arc — keeps book/arc structure honest so context-injection can scope to an arc
 *   7. if a continuity report is given: it conforms to its schema and has NO high-severity conflict
 *
 * Exit 0 = OK. Exit 1 = blocked (reasons on stderr). Exit 2 = bad usage.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./lib/json-schema-mini.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const statePath = process.argv[2];
if (!statePath) {
  console.error("usage: node scripts/check-continuity.mjs <state.json> [<chapter.continuity.json>]");
  process.exit(2);
}
const resolvedState = resolve(process.cwd(), statePath);
if (!existsSync(resolvedState)) {
  console.error(`state file not found: ${resolvedState}`);
  process.exit(2);
}

const reasons = [];
const load = (p) => JSON.parse(readFileSync(p, "utf8"));

let state;
try {
  state = load(resolvedState);
} catch (e) {
  console.error(`state.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

// 1. schema ------------------------------------------------------------------
try {
  const schema = load(resolve(REPO_ROOT, "schemas/story-state.schema.json"));
  for (const err of validate(state, schema, "state")) reasons.push(`schema: ${err}`);
} catch (e) {
  reasons.push(`could not load story-state schema: ${e.message}`);
}

// only run invariants if the basic shape is there
const characters = Array.isArray(state.characters) ? state.characters : [];
const chapters = Array.isArray(state.chapters) ? state.chapters : [];
const charIds = new Set();
const chapterNums = new Set();

// 2. referential integrity ---------------------------------------------------
for (const c of characters) {
  if (c && c.id != null) {
    if (charIds.has(c.id)) reasons.push(`duplicate character id "${c.id}"`);
    charIds.add(c.id);
  }
}
for (const ch of chapters) {
  if (ch && ch.number != null) {
    if (chapterNums.has(ch.number)) reasons.push(`duplicate chapter number ${ch.number}`);
    chapterNums.add(ch.number);
  }
}
const refCharErr = (id, where) => { if (id != null && !charIds.has(id)) reasons.push(`${where} references unknown character id "${id}"`); };
for (const c of characters) for (const r of c.relationships || []) refCharErr(r.with, `relationship of "${c.id}"`);
for (const ch of chapters) {
  refCharErr(ch.pov, `chapter ${ch.number} pov`);
  for (const id of ch.cast || []) refCharErr(id, `chapter ${ch.number} cast`);
}
for (const t of state.timeline || []) {
  if (t && t.chapter != null && !chapterNums.has(t.chapter)) {
    reasons.push(`timeline event "${t.event}" references chapter ${t.chapter} not in the chapter ledger`);
  }
}

// 3. timeline non-decreasing -------------------------------------------------
let prev = -Infinity;
for (const t of state.timeline || []) {
  if (t && typeof t.chapter === "number") {
    if (t.chapter < prev) reasons.push(`timeline out of order: chapter ${t.chapter} listed after ${prev}`);
    prev = t.chapter;
  }
}

// 4. foreshadowing ordering --------------------------------------------------
for (const f of state.foreshadowing || []) {
  if (!f) continue;
  if (f.status === "resolved") {
    if (f.resolved_chapter == null) reasons.push(`foreshadowing "${f.id}" is resolved but has no resolved_chapter`);
    else if (f.resolved_chapter < f.setup_chapter) reasons.push(`foreshadowing "${f.id}" resolved (ch ${f.resolved_chapter}) before it was set up (ch ${f.setup_chapter})`);
  } else if (f.status === "open" && f.resolved_chapter != null) {
    reasons.push(`foreshadowing "${f.id}" is open but has a resolved_chapter`);
  }
}

// 5. no resurrection ---------------------------------------------------------
for (const c of characters) {
  if (c && c.status === "dead" && typeof c.died_chapter === "number") {
    for (const ch of chapters) {
      if (typeof ch.number === "number" && ch.number > c.died_chapter && (ch.cast || []).includes(c.id)) {
        reasons.push(`character "${c.id}" died in chapter ${c.died_chapter} but appears in chapter ${ch.number}'s cast`);
      }
    }
  }
}

// 6. arcs (optional book/arc structure) --------------------------------------
const arcs = Array.isArray(state.arcs) ? state.arcs : [];
if (arcs.length) {
  const arcIds = new Set();
  for (const a of arcs) {
    if (a && a.id != null) {
      if (arcIds.has(a.id)) reasons.push(`duplicate arc id "${a.id}"`);
      arcIds.add(a.id);
    }
  }
  // strictly-increasing start; non-overlapping; only the last arc may be open (end_chapter null)
  let prevEnd = -Infinity;
  let prevStart = -Infinity;
  arcs.forEach((a, i) => {
    if (!a || typeof a.start_chapter !== "number") return;
    if (a.start_chapter <= prevStart) reasons.push(`arc "${a.id}" start_chapter ${a.start_chapter} is not after the previous arc's start (${prevStart})`);
    if (a.start_chapter <= prevEnd) reasons.push(`arc "${a.id}" (start ${a.start_chapter}) overlaps the previous arc (which ended at ${prevEnd})`);
    if (a.end_chapter != null && a.end_chapter < a.start_chapter) reasons.push(`arc "${a.id}" end_chapter ${a.end_chapter} is before its start_chapter ${a.start_chapter}`);
    if (a.end_chapter == null && i !== arcs.length - 1) reasons.push(`arc "${a.id}" has a null end_chapter but is not the last arc (only the final arc may stay open)`);
    prevStart = a.start_chapter;
    prevEnd = a.end_chapter == null ? Infinity : a.end_chapter;
  });
  // every ledger chapter falls inside exactly one arc
  const inArc = (n) => arcs.filter((a) => a && typeof a.start_chapter === "number" && n >= a.start_chapter && (a.end_chapter == null || n <= a.end_chapter));
  for (const ch of chapters) {
    if (typeof ch.number !== "number") continue;
    const hits = inArc(ch.number);
    if (hits.length === 0) reasons.push(`chapter ${ch.number} falls outside every declared arc range`);
    else if (hits.length > 1) reasons.push(`chapter ${ch.number} falls inside ${hits.length} arcs (${hits.map((a) => a.id).join(", ")}) — arcs must not overlap`);
  }
}

// 7. continuity report (optional) --------------------------------------------
const reportPath = process.argv[3];
if (reportPath) {
  const resolvedReport = resolve(process.cwd(), reportPath);
  if (!existsSync(resolvedReport)) {
    reasons.push(`continuity report not found: ${resolvedReport}`);
  } else {
    try {
      const report = load(resolvedReport);
      const schema = load(resolve(REPO_ROOT, "schemas/continuity-report.schema.json"));
      for (const err of validate(report, schema, "continuity")) reasons.push(`report schema: ${err}`);
      const highs = (report.conflicts || []).filter((c) => c && c.severity === "high");
      for (const h of highs) reasons.push(`high-severity continuity conflict (${h.type}): ${h.description}`);
    } catch (e) {
      reasons.push(`continuity report is not valid JSON: ${e.message}`);
    }
  }
}

if (reasons.length) {
  console.error("✖ continuity gate FAILED:");
  for (const r of reasons) console.error("  - " + r);
  process.exit(1);
}
console.log(`✔ continuity gate passed: ${basename(resolvedState)}`);
process.exit(0);
