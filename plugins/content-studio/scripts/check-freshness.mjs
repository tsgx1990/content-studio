#!/usr/bin/env node
/**
 * check-freshness — guard year-stamped reference data (TC-006). Zero dependencies.
 *   node scripts/check-freshness.mjs <file.md|sidecar.json> [--current-year=N] [--json]
 *
 * OPT-IN: a file participates only if it carries a freshness DECLARATION —
 *   .md   : <!-- data: {"data_year":2025,"dataset":"<relpath to a *.data.json>"} -->
 *   .json : a top-level "data_freshness": {"data_year":2025,"dataset":"<relpath>"}
 * Undeclared files exit 0 silently — auto-flagging every "2025" in prose would be a
 * false-positive machine, so participation is a deliberate contract.
 *
 * With a declaration it does two things:
 *   A. FRESHNESS (warn): if data_year < the current data year, warn so stale data can't ship
 *      silently next season. Current year resolves --current-year > DATA_YEAR env >
 *      config/data-freshness.json (no wall-clock — reproducible).
 *   B. CONSISTENCY (block): if `dataset` is given, load that *.data.json and verify every
 *      「分数≈位次万」cited in the prose still matches its anchors. A mismatch (the real
 *      580≈7.0万-vs-7.1万 bug) is BLOCK-tier, as is a malformed declaration / unreadable dataset /
 *      a declaration-vs-dataset year disagreement.
 *
 * Exit 0 = clean or stale-warn-only; 1 = a block-tier problem; 2 = bad usage / unresolved year.
 * It does NOT verify the dataset against the official source (that honesty contract is
 * keyword-research's `source`+URL), nor numbers written without the 数字≈数字万 shape.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCurrentDataYear, extractAnchorPairs, compareToDataset } from "./lib/data-anchors.mjs";

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPTS, "..");

function parseArgs(argv) {
  const out = { file: null, currentYear: null, json: false };
  for (const a of argv) {
    if (a === "--json") out.json = true;
    else if (a.startsWith("--current-year=")) out.currentYear = a.slice("--current-year=".length);
    else if (!out.file) out.file = a;
  }
  return out;
}

const { file, currentYear, json } = parseArgs(process.argv.slice(2));
if (!file) {
  console.error("usage: node scripts/check-freshness.mjs <file.md|sidecar.json> [--current-year=N] [--json]");
  process.exit(2);
}
const path = resolve(process.cwd(), file);
if (!existsSync(path)) { console.error(`file not found: ${path}`); process.exit(2); }

const raw = readFileSync(path, "utf8");

const result = {
  file: basename(path), declared: false, data_year: null, current_year: null,
  stale: false, dataset: null, mismatches: [], blocked: false, reasons: [],
};

function emit() {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (!result.declared) {
    console.log(`· ${result.file} — no freshness declaration (not gated)`);
  } else {
    for (const r of result.reasons) (result.blocked ? console.error : console.log)((result.blocked ? "  ✖ " : "  ⚠ ") + r);
    if (!result.blocked && !result.stale) console.log(`✔ freshness ok: ${result.file} (data_year ${result.data_year})`);
  }
  process.exit(result.blocked ? 1 : 0);
}

// --- read the declaration (opt-in) ---
let decl = null;
if (/\.json$/i.test(path)) {
  try { decl = JSON.parse(raw).data_freshness || null; } catch { /* a non-JSON .json is another gate's problem */ }
} else {
  const m = raw.match(/<!--\s*data:\s*(\{[\s\S]*?\})\s*-->/i);
  if (m) {
    try { decl = JSON.parse(m[1]); }
    catch (e) { result.declared = true; result.blocked = true; result.reasons.push(`freshness declaration is not valid JSON: ${e.message}`); emit(); }
  }
}
if (!decl) emit();   // undeclared -> exit 0

result.declared = true;
if (!Number.isInteger(decl.data_year)) {
  result.blocked = true; result.reasons.push("freshness declaration missing integer data_year"); emit();
}
result.data_year = decl.data_year;

// resolve current year (bad usage -> exit 2, distinct from a content block)
let cur;
try { cur = loadCurrentDataYear({ flag: currentYear, env: process.env.DATA_YEAR, configPath: resolve(ROOT, "config/data-freshness.json") }); }
catch (e) { console.error(e.message); process.exit(2); }
result.current_year = cur;

// A. freshness
if (decl.data_year < cur) {
  result.stale = true;
  result.reasons.push(`数据年份 ${decl.data_year} < 当前 ${cur} — 年份戳数据可能已过期，请重新核对/rebind。`);
}

// B. consistency (only if a dataset pointer is declared)
if (decl.dataset) {
  result.dataset = decl.dataset;
  const dsPath = resolve(dirname(path), decl.dataset);
  if (!existsSync(dsPath)) { result.blocked = true; result.reasons.push(`dataset not found: ${decl.dataset}`); emit(); }
  let ds;
  try { ds = JSON.parse(readFileSync(dsPath, "utf8")); }
  catch (e) { result.blocked = true; result.reasons.push(`dataset not valid JSON (${decl.dataset}): ${e.message}`); emit(); }
  if (Number.isInteger(ds.data_year) && ds.data_year !== decl.data_year) {
    result.blocked = true;
    result.reasons.push(`declaration data_year ${decl.data_year} ≠ dataset data_year ${ds.data_year} (${decl.dataset}) — fix the pointer/stamp.`);
  }
  // strip the declaration/meta comments + code so we don't read the pointer's own digits back
  const prose = raw.replace(/<!--\s*(?:meta|data)[\s\S]*?-->/gi, "").replace(/```[\s\S]*?```/g, "");
  for (const x of compareToDataset(extractAnchorPairs(prose), ds)) {
    result.blocked = true;
    result.mismatches.push(x);
    result.reasons.push(`位次不一致：${x.score} 分 文中写 ${x.found} 万，数据源是 ${x.expected} 万（${decl.dataset}）。`);
  }
}

emit();
