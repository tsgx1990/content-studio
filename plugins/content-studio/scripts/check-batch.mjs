#!/usr/bin/env node
/**
 * check-batch — scoped, per-file review/publish readiness triage (TC-005). Zero dependencies.
 *   node scripts/check-batch.mjs <path|dir ...> [--json]
 *
 * `check.mjs` answers "is the WHOLE repo healthy?"; this answers "are THESE N pieces ready?" —
 * the thing you want when reviewing/publishing a batch of new files without re-running everything.
 * It fans the EXISTING gates out over the given files (no gate logic is copied — it shells out to
 * the same scripts and reuses lib/gates.mjs + the schema validator) and rolls up one line per file:
 *
 *   per .md            : publish gate (if a sibling *.review.json exists) = hard ·
 *                        AI-tell scan = advisory (warn) · freshness (if declared) = block→fail/stale→warn
 *   per *.json source  : schema validate = hard · its per-type gate (GATE_BY_SUFFIX) = hard
 *
 * A file is ✖ fail if any HARD check fails, ⚠ warn if only advisory checks flag, else ✔ ready.
 * Exit 1 if any file fails (so it's CI/pre-publish usable); 0 otherwise. AI-tell BLOCK-tier is
 * treated as advisory here (same stance as check.mjs's repo scan) — enforce voice per-piece with
 * check-ai-tells.mjs --strict in the content-review workflow. Use this to TRIAGE a batch, then
 * dispatch the parallel content-review subagents only at the pieces that clear mechanics.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./lib/json-schema-mini.mjs";
import { schemaFor, gateFor } from "./lib/gates.mjs";

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPTS, "..");
const rel = (p) => relative(ROOT, p);

const args = process.argv.slice(2);
const json = args.includes("--json");
const inputs = args.filter((a) => a !== "--json");
if (!inputs.length) {
  console.error("usage: node scripts/check-batch.mjs <path|dir ...> [--json]");
  process.exit(2);
}

function walk(p) {
  if (!existsSync(p)) return [];
  if (statSync(p).isDirectory()) return readdirSync(p).flatMap((n) => walk(resolve(p, n)));
  return [p];
}
const isContent = (f) => /\.md$/i.test(f) || schemaFor(f) !== null || gateFor(f) !== null;
const files = [...new Set(inputs.flatMap((i) => walk(resolve(process.cwd(), i))))].filter(isContent).sort();

if (!files.length) {
  console.error("no content files found in the given paths (looked for .md and *.json sources)");
  process.exit(2);
}

// run a gate script; return true on exit 0
function gateOk(script, file) {
  try { execFileSync("node", [resolve(SCRIPTS, script), file], { stdio: "pipe" }); return true; }
  catch { return false; }
}

function checkOne(file) {
  const checks = []; // { name, status: 'pass'|'warn'|'fail' }
  if (/\.md$/i.test(file)) {
    if (existsSync(file.replace(/\.md$/i, ".review.json"))) {
      checks.push({ name: "publish", status: gateOk("check-prepublish.mjs", file) ? "pass" : "fail" });
    }
    checks.push({ name: "ai-tells", status: gateOk("check-ai-tells.mjs", file) ? "pass" : "warn" });
    // freshness: only report if the file actually declares year-stamped data
    let fr = null;
    try { fr = JSON.parse(execFileSync("node", [resolve(SCRIPTS, "check-freshness.mjs"), file, "--json"], { stdio: "pipe" }).toString()); }
    catch (e) { try { fr = JSON.parse((e.stdout || "").toString()); } catch { fr = null; } }
    if (fr && fr.declared) checks.push({ name: "freshness", status: fr.blocked ? "fail" : (fr.stale ? "warn" : "pass") });
  } else {
    const schema = schemaFor(file);
    if (schema) {
      let errs;
      try { errs = validate(JSON.parse(readFileSync(file, "utf8")), JSON.parse(readFileSync(resolve(ROOT, schema), "utf8")), rel(file)); }
      catch (e) { errs = [`could not parse: ${e.message}`]; }
      checks.push({ name: "schema", status: errs.length ? "fail" : "pass" });
    }
    const gate = gateFor(file);
    if (gate) checks.push({ name: gate.label, status: gateOk(gate.script, file) ? "pass" : "fail" });
  }
  const status = checks.some((c) => c.status === "fail") ? "fail"
    : checks.some((c) => c.status === "warn") ? "warn" : "pass";
  return { file: rel(file), status, checks };
}

const results = files.map(checkOne);
const mark = { pass: "✔", warn: "⚠", fail: "✖" };
const counts = { pass: 0, warn: 0, fail: 0 };
for (const r of results) counts[r.status]++;

if (json) {
  console.log(JSON.stringify({ results, summary: counts }, null, 2));
} else {
  console.log(`batch readiness (${results.length} file${results.length === 1 ? "" : "s"}):`);
  for (const r of results) {
    const detail = r.checks.map((c) => `${c.name} ${mark[c.status]}`).join(" · ");
    console.log(`  ${mark[r.status]} ${r.file}${detail ? `  [${detail}]` : ""}`);
  }
  console.log(`summary: ${counts.pass} ready · ${counts.warn} warn · ${counts.fail} fail`);
}

process.exit(counts.fail ? 1 : 0);
