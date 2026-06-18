#!/usr/bin/env node
/**
 * check-print-text — gate the canonical text of a PRINT / export artifact (a lead-magnet PDF, a
 * printable card) that no other gate watches. Zero dependencies.
 *   node scripts/check-print-text.mjs <file.json|.md|.txt> [--industries=education,…] [--allow=term,…]
 *
 * Why this exists (TC-011): a PDF/print artifact is generated outside the content pipeline, so its
 * text bypasses every gate — a 极限词 ("保录取/包过") and font-tofu (a glyph the embedded CJK font
 * can't draw, shipping as □) both reached readers before, caught only by eyeballing the render. This
 * gives that text a deterministic gate. It checks two reproducible things (taste stays with review):
 *
 *   1. GLYPH SAFETY — no glyph that renders as tofu (□) in a built-in CJK PDF font (reportlab
 *      STSong-Light / Adobe-GB1): emoji, dingbat ticks/crosses (✔ ✓ ✗ ✘), and the Latin middle dot
 *      `·` (U+00B7). NOTE: the katakana middle dot `・` (U+30FB), `■`, `√`, ①… DO render and are NOT
 *      flagged — flag only what actually tofus, so the gate doesn't punish working glyphs.
 *   2. 极限词 / 承诺词 — the shared ZH compliance scan (lib/compliance-cn). A print artifact is
 *      marketing, so this is ON by default; an artifact that legitimately NAMES a banned term to warn
 *      against it (a "don't trust 保录取/包过 promises" line) lists it under `compliance.allow`.
 *
 * Source: a `.json` (every string leaf is scanned; reads an optional top-level `compliance`
 * {industries?, allow?} block) or a `.md`/`.txt` (raw text; pass --industries / --allow on the CLI).
 * Exit 0 = OK. 1 = blocked (reasons on stderr). 2 = bad usage.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, basename, extname } from "node:path";
import { EXTREME_TERMS, findComplianceIssues } from "./lib/compliance-cn.mjs";

// Glyphs that render as □ in reportlab's built-in CJK font. Deliberately narrow: the documented
// offenders only — the Latin middle dot ·(U+00B7), the dingbats block (✔✓✗✘ live at U+2700–27BF),
// the emoji variation selector, and emoji proper. NOT ・(U+30FB)/■/√/① which draw fine.
const TOFU_SRC = "[\\u00B7\\u2700-\\u27BF\\uFE0F]|[\\u{1F000}-\\u{1FAFF}]";
const TOFU = new RegExp(TOFU_SRC, "u");
const TOFU_G = new RegExp(TOFU_SRC, "gu");

const args = process.argv.slice(2);
const arg = args.find((a) => !a.startsWith("--"));
const flag = (n) => { const m = args.find((a) => a.startsWith(`--${n}=`)); return m ? m.slice(n.length + 3).split(",").map((s) => s.trim()).filter(Boolean) : []; };
if (!arg) {
  console.error("usage: node scripts/check-print-text.mjs <file.json|.md|.txt> [--industries=…] [--allow=…]");
  process.exit(2);
}
const file = resolve(process.cwd(), arg);
if (!existsSync(file)) { console.error(`file not found: ${file}`); process.exit(2); }

// collect the lines of text to scan + the compliance config (from JSON block or CLI)
let lines = [];
let industries = flag("industries");
let allow = flag("allow");
const raw = readFileSync(file, "utf8");
if (extname(file).toLowerCase() === ".json") {
  let data;
  try { data = JSON.parse(raw); } catch (e) { console.error(`✖ ${basename(file)} is not valid JSON: ${e.message}`); process.exit(1); }
  const c = data && typeof data.compliance === "object" ? data.compliance : {};
  if (Array.isArray(c.industries)) industries = [...industries, ...c.industries];
  if (Array.isArray(c.allow)) allow = [...allow, ...c.allow];
  const strings = [];
  (function walk(v) {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") for (const [k, val] of Object.entries(v)) { if (k !== "compliance") walk(val); }
  })(data);
  lines = strings;
} else {
  lines = raw.split("\n");
}

const reasons = [];

// 1. glyph safety -------------------------------------------------------------
const tofuSeen = new Set();
for (const line of lines) {
  if (!TOFU.test(line)) continue;
  for (const g of (line.match(TOFU_G) || [])) {
    if (tofuSeen.has(g)) continue;
    tofuSeen.add(g);
    const cp = "U+" + g.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
    reasons.push(`tofu glyph "${g}" (${cp}) — renders as □ in the built-in CJK PDF font; replace it (e.g. ✔→√, ·→・, drop emoji).`);
  }
}

// 2. 极限词 / 承诺词 ----------------------------------------------------------
const extremes = EXTREME_TERMS.filter((t) => !allow.includes(t));
const allowSet = new Set(allow);
for (const line of lines) {
  for (const f of findComplianceIssues(line, { extremes, diversion: [], industries, scanPhone: false })) {
    if (allowSet.has(f.term)) continue;
    reasons.push(`极限词/承诺词 "${f.term}" — absolute/guarantee wording carries 广告法 risk. Remove or soften it (or, if you're naming it to warn against it, add it to compliance.allow).`);
  }
}

if (reasons.length) {
  console.error(`✖ print-text gate FAILED (${basename(file)}):`);
  for (const r of [...new Set(reasons)]) console.error("  - " + r);
  process.exit(1);
}
console.log(`✔ print-text gate passed: ${basename(file)} (${lines.length} text node(s), glyph-safe, no 极限词)`);
process.exit(0);
