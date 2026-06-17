#!/usr/bin/env node
/**
 * check — one repo-wide health check. Zero dependencies. Run with: node scripts/check.mjs
 *
 * Answers "is the repo healthy?" in one command (the PRD's `acs check`):
 *   1. every *.research/.review/.spec/.if.json under projects/ conforms to its schema
 *   2. every drafted article (a .md with a sibling .review.json) passes the publish gate
 *   2b. every story (a .md with a sibling .spec.json) passes the readability gate
 *   2c. every interactive-fiction graph (*.if.json) passes the story-graph gate
 *   2d. every youtube script (*.script.json) passes the script gate
 *   2e. every xiaohongshu note (*.note.json) passes the note gate
 *   2f. every short drama (*.drama.json) passes the short-drama gate
 *   2g. every english-learning story (*.lesson.json) passes the graded-reader gate
 *   2h. every game story (*.game.json) passes the game-story winnability gate
 *   2j. every audio story (*.audio.json) passes the audio-story (TTS-safety) gate
 *   3. the gate + hook fixture self-tests pass
 *
 * Exit 0 = healthy. Exit 1 = something failed (details printed). Intended for local use and CI.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./lib/json-schema-mini.mjs";
import { SCHEMA_BY_SUFFIX, GATE_BY_SUFFIX } from "./lib/gates.mjs";
import { CONTENT_ROOT } from "./lib/roots.mjs";

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
// ROOT = where this toolkit's own files live (scripts/ + schemas/). Stays script-relative so it
// resolves correctly whether run in-repo or installed as a plugin (schemas travel WITH the scripts).
const ROOT = resolve(SCRIPTS, "..");
// CONTENT_ROOT (where the user's projects/ + config/ live) comes from lib/roots.mjs — the single
// source so every gate agrees on it (and honours CONTENT_STUDIO_ROOT identically). In-repo it's the
// cwd (the repo root when run as `node scripts/check.mjs`), so behaviour is unchanged.
const rel = (p) => relative(CONTENT_ROOT, p);

function walk(dir) {
  const out = [];
  for (const name of (existsSync(dir) ? readdirSync(dir) : [])) {
    const p = resolve(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

let failures = 0;
const ok = (m) => console.log(`  ✔ ${m}`);
const bad = (m) => { failures++; console.error(`  ✖ ${m}`); };

const files = walk(resolve(CONTENT_ROOT, "projects"));

// 1. sidecars conform to their schema -----------------------------------------
console.log("sidecars:");
const sidecars = files.filter((f) => /\.(review|research|spec|if|script|note|drama|lesson|game|audio|feedback|data)\.json$/i.test(f));
if (!sidecars.length) console.log("  (none)");
for (const f of sidecars) {
  const schemaPath = SCHEMA_BY_SUFFIX.find(([re]) => re.test(f))[1];
  let errs;
  try {
    const data = JSON.parse(readFileSync(f, "utf8"));
    const schema = JSON.parse(readFileSync(resolve(ROOT, schemaPath), "utf8"));
    errs = validate(data, schema, rel(f));
  } catch (e) {
    errs = [`could not parse: ${e.message}`];
  }
  if (errs.length) bad(`${rel(f)} — ${errs.join("; ")}`);
  else ok(rel(f));
}

// 2. drafted articles pass the publish gate -----------------------------------
console.log("articles (publish gate):");
const articles = files.filter((f) => /\.md$/i.test(f) && existsSync(f.replace(/\.md$/i, ".review.json")));
if (!articles.length) console.log("  (none with a review sidecar)");
for (const a of articles) {
  try {
    execFileSync("node", [resolve(SCRIPTS, "check-prepublish.mjs"), a], { stdio: "pipe" });
    ok(rel(a));
  } catch (e) {
    bad(`${rel(a)} — gate failed:\n${(e.stderr || "").toString().trim().split("\n").map((l) => "      " + l).join("\n")}`);
  }
}

// 2a. articles get an advisory AI-tell scan (non-fatal — voice is fuzzier than the
//     hard gates; surface the tells without failing repo health). Enforce per-draft in
//     the seo-article / content-review workflow with `check-ai-tells.mjs [--strict]`.
if (articles.length) {
  console.log("articles (AI-tell scan, advisory):");
  for (const a of articles) {
    try {
      execFileSync("node", [resolve(SCRIPTS, "check-ai-tells.mjs"), a], { stdio: "pipe" });
      ok(`${rel(a)} — no AI tells`);
    } catch (e) {
      const out = (e.stderr || "").toString().trim().split("\n").map((l) => "      " + l).join("\n");
      console.log(`  ⚠ ${rel(a)} — AI tells (advisory):\n${out}`);
    }
  }
}

// 2a2. year-stamped data freshness (opt-in via a <!-- data --> / data_freshness declaration).
//      Stale year => advisory ⚠ (doesn't fail health). A cited 位次 that has drifted off its
//      *.data.json source => real failure. Undeclared files are silent (not gated).
{
  const declared = [];
  for (const f of files.filter((f) => /\.md$/i.test(f))) {
    let out;
    try { out = execFileSync("node", [resolve(SCRIPTS, "check-freshness.mjs"), f, "--json"], { stdio: "pipe" }).toString(); }
    catch (e) { out = (e.stdout || "").toString(); }
    let r; try { r = JSON.parse(out); } catch { continue; }
    if (r.declared) declared.push({ f, r });
  }
  if (declared.length) {
    console.log("year-stamped data (freshness gate):");
    for (const { f, r } of declared) {
      if (r.blocked) bad(`${rel(f)} — ${r.reasons.join("; ")}`);
      else if (r.stale) console.log(`  ⚠ ${rel(f)} — ${r.reasons.join("; ")}`);
      else ok(`${rel(f)} — data_year ${r.data_year}`);
    }
  }
}

// 2b. long-form state passes the continuity gate ------------------------------
const states = files.filter((f) => /\/novel\/state\.json$/i.test(f));
if (states.length) {
  console.log("story state (continuity gate):");
  for (const s of states) {
    try {
      execFileSync("node", [resolve(SCRIPTS, "check-continuity.mjs"), s], { stdio: "pipe" });
      ok(rel(s));
    } catch (e) {
      bad(`${rel(s)} — continuity failed:\n${(e.stderr || "").toString().trim().split("\n").map((l) => "      " + l).join("\n")}`);
    }
  }
}

// 2c. children's stories pass the readability gate ----------------------------
const stories = files.filter((f) => /\.md$/i.test(f) && existsSync(f.replace(/\.md$/i, ".spec.json")));
if (stories.length) {
  console.log("children's stories (readability gate):");
  for (const s of stories) {
    try {
      execFileSync("node", [resolve(SCRIPTS, "check-readability.mjs"), s], { stdio: "pipe" });
      ok(rel(s));
    } catch (e) {
      bad(`${rel(s)} — readability failed:\n${(e.stderr || "").toString().trim().split("\n").map((l) => "      " + l).join("\n")}`);
    }
  }
}

// 2d–2j. per-type source gates — one loop over the shared GATE_BY_SUFFIX registry (if/script/
//        note/drama/lesson/game/audio). The gate takes the .json source and exits non-zero on
//        failure. (children-story readability + long-form continuity above are special-shaped.)
for (const { suffix, script, section } of GATE_BY_SUFFIX) {
  const matched = files.filter((f) => suffix.test(f));
  if (!matched.length) continue;
  console.log(`${section}:`);
  for (const m of matched) {
    try {
      execFileSync("node", [resolve(SCRIPTS, script), m], { stdio: "pipe" });
      ok(rel(m));
    } catch (e) {
      bad(`${rel(m)} — ${script} failed:\n${(e.stderr || "").toString().trim().split("\n").map((l) => "      " + l).join("\n")}`);
    }
  }
}

// 2k. no committed secrets under the content root (projects/ + config/) ---------
//     A secret pasted into ANY file (a sidecar, project.yaml, a research note, a CSV) should fail
//     repo health — not only the publish gate on a drafted article. Reuses the shared secret lexicon.
{
  const targets = [resolve(CONTENT_ROOT, "projects"), resolve(CONTENT_ROOT, "config")].filter(existsSync);
  if (targets.length) {
    console.log("secrets:");
    try {
      execFileSync("node", [resolve(SCRIPTS, "check-secrets.mjs"), ...targets], { stdio: "pipe" });
      ok("no secrets in content");
    } catch (e) {
      bad(`secret(s) found:\n${(e.stderr || e.stdout || "").toString().trim().split("\n").map((l) => "      " + l).join("\n")}`);
    }
  }
}

// 3. fixture self-tests --------------------------------------------------------
console.log("self-tests:");
for (const t of ["test-gate.mjs", "test-hooks.mjs", "test-continuity.mjs", "test-chapter-context.mjs", "test-readability.mjs", "test-storygraph.mjs", "test-script.mjs", "test-xhsnote.mjs", "test-short-drama.mjs", "test-graded-reader.mjs", "test-game-story.mjs", "test-audio-story.mjs", "test-topic-feedback.mjs", "test-ai-tells.mjs", "test-compliance.mjs", "test-render.mjs", "test-freshness.mjs", "test-batch.mjs", "test-secrets.mjs", "test-roots.mjs"]) {
  try {
    execFileSync("node", [resolve(SCRIPTS, t)], { stdio: "pipe" });
    ok(t);
  } catch {
    bad(`${t} — see: node scripts/${t}`);
  }
}

// 3b. export tooling self-test — runs only in the source repo (the published plugin ships no tools/).
{
  const t = resolve(SCRIPTS, "../tools/test-export-safety.mjs");
  if (existsSync(t)) {
    try { execFileSync("node", [t], { stdio: "pipe" }); ok("test-export-safety.mjs"); }
    catch { bad("test-export-safety.mjs — see: node tools/test-export-safety.mjs"); }
  }
}

console.log(`\n${failures ? `✖ ${failures} problem(s)` : "✔ repo healthy"}`);
process.exit(failures ? 1 : 0);
