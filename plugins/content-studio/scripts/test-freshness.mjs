#!/usr/bin/env node
/**
 * test-freshness — fixture self-test for the year-stamped data freshness gate (TC-006).
 * Zero dependencies. Run with: node scripts/test-freshness.mjs
 * Exit 0 = all cases behaved as expected, exit 1 = a check regressed.
 *
 * `current_data_year` is always injected via --current-year= so the test is hermetic (never the
 * repo config or the wall clock). The mismatch case (3) FAILS without check-freshness.mjs — that
 * is the core proof the gate catches the real 580≈7.0万-vs-7.1万 drift.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GATE = resolve(dirname(fileURLToPath(import.meta.url)), "check-freshness.mjs");
const tmp = mkdtempSync(join(tmpdir(), "freshness-test-"));
let passed = 0, failed = 0;

function run(args) {
  // returns { code, json } — gate prints JSON to stdout (even on exit 1) with --json
  try {
    const out = execFileSync("node", [GATE, ...args, "--json"], { stdio: "pipe" }).toString();
    return { code: 0, json: JSON.parse(out) };
  } catch (e) {
    const code = typeof e.status === "number" ? e.status : 1;
    let j = null;
    try { j = JSON.parse((e.stdout || "").toString()); } catch { /* usage error (exit 2) prints to stderr */ }
    return { code, json: j };
  }
}
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✖ ${name} — ${detail}`); }
}
const w = (name, body) => { const p = join(tmp, name); writeFileSync(p, body); return p; };

console.log("freshness gate:");

// a dataset fixture: 580 -> 7.1万 (the real value)
w("ranks.data.json", JSON.stringify({
  dataset_id: "t", data_year: 2025, source: { name: "t" },
  anchors: [{ score: 600, rank: 45887, rank_wan: 4.6 }, { score: 580, rank: 71205, rank_wan: 7.1 }],
}));

const decl = (year, ds = "ranks.data.json") => `<!-- data: {"data_year":${year},"dataset":"${ds}"} -->\n`;
const prose = (n) => `物理类：600 分≈4.6 万名，580≈${n} 万名，本科批要填 48 个院校专业组。`;

// 1. stale year warns but does NOT fail (exit 0, stale flag set). Declaration-only (no dataset
//    pointer) so this isolates freshness from the consistency check.
{
  const r = run([w("stale.md", `<!-- data: {"data_year":2024} -->\n物理类 600 分≈4.6 万名。`), "--current-year=2025"]);
  check("stale data_year -> warn, exit 0", r.code === 0 && r.json && r.json.stale === true && r.json.blocked === false, JSON.stringify(r));
}
// 2. current year is clean
{
  const r = run([w("current.md", decl(2025) + prose("7.1")), "--current-year=2025"]);
  check("current data_year -> clean, exit 0", r.code === 0 && r.json && r.json.stale === false && r.json.blocked === false, JSON.stringify(r));
}
// 3. value mismatch BLOCKS (the real 7.0-vs-7.1 bug) — FAILS without the gate
{
  const r = run([w("mismatch.md", decl(2025) + prose("7.0")), "--current-year=2025"]);
  const namesScore = r.json && r.json.mismatches.some((m) => m.score === 580 && m.expected === 7.1 && m.found === 7.0);
  check("value mismatch -> block (exit 1) naming 580", r.code === 1 && namesScore, JSON.stringify(r));
}
// 4. value match passes
{
  const r = run([w("match.md", decl(2025) + prose("7.1")), "--current-year=2025"]);
  check("value match -> pass (exit 0)", r.code === 0 && r.json.blocked === false, JSON.stringify(r));
}
// 5. low false-positive: undeclared file with an innocent "7.0 万" + a 2025 mention -> not gated
{
  const r = run([w("innocent.md", "2025 年高考报名，预计 7.0 万人参加，排在七万名左右。"), "--current-year=2025"]);
  check("undeclared file -> not gated (exit 0)", r.code === 0 && r.json && r.json.declared === false, JSON.stringify(r));
}
// 6. malformed declaration (missing data_year) blocks
{
  const r = run([w("malformed.md", `<!-- data: {"dataset":"ranks.data.json"} -->\n` + prose("7.1")), "--current-year=2025"]);
  check("malformed declaration -> block (exit 1)", r.code === 1 && r.json && r.json.blocked === true, JSON.stringify(r));
}
// 7. declaration vs dataset year disagreement blocks
{
  const r = run([w("yearmismatch.md", decl(2024) + prose("7.1")), "--current-year=2024"]);
  // data_year 2024 == current 2024 (not stale), but dataset says 2025 -> block on the disagreement
  check("declaration≠dataset year -> block (exit 1)", r.code === 1 && r.json && r.json.blocked === true, JSON.stringify(r));
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failed ? `✖ ${failed} failed` : `✔ ${passed} passed`}`);
process.exit(failed ? 1 : 0);
