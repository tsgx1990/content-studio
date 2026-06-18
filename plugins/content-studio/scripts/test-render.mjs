#!/usr/bin/env node
/**
 * test-render — golden self-test for scripts/render.mjs. Zero deps, no framework.
 * Run with: node scripts/test-render.mjs   (exit 0 = all behaved as expected)
 *
 * Asserts the renderer is a faithful, reproducible projection of the JSON source:
 *   - every committed *.note.json / *.script.json under projects/ renders byte-identical to its
 *     sibling .md (golden — proves the .md never drifts from the JSON source of truth);
 *   - an unsupported type (.spec.json) is rejected with exit 2 (renderer stays narrow & honest).
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { walk } from "./lib/fs.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const RENDER = resolve(HERE, "render.mjs");
let passed = 0, failed = 0;
const check = (name, ok, detail) => ok
  ? (passed++, console.log(`  ✔ ${name}`))
  : (failed++, console.error(`  ✖ ${name} — ${detail || ""}`));

const render = (src) => execFileSync("node", [RENDER, src], { encoding: "utf8" });

// 1. golden: render === committed .md ----------------------------------------
console.log("golden (render === committed .md):");
// Scan the content workspace (cwd), not the script dir — so this self-test validates real content
// whether run in-repo or as an installed plugin. With no content present there is nothing to verify.
const sources = walk(resolve(process.cwd(), "projects")).filter((f) => /\.(note|prose|if|game|audio|script|lesson|drama)\.json$/i.test(f));
if (!sources.length) console.log("  (no .note/.prose/.if/.game/.audio/.script.json under projects/ — nothing to render-test)");
for (const src of sources) {
  const md = src.replace(/\.[a-z]+\.json$/i, ".md");
  if (!existsSync(md)) { check(`${src} has a sibling .md`, false, "missing .md"); continue; }
  const got = render(src);
  check(relative(process.cwd(), src), got === readFileSync(md, "utf8"), "rendered output differs from committed .md");
}

// 2. unsupported type rejected with exit 2 -----------------------------------
// .spec.json stays author-by-hand on purpose (the children's-story prose is the authored artifact,
// not a projection of the constraints spec) — the renderer must refuse it.
console.log("guards:");
const tmp = mkdtempSync(join(tmpdir(), "render-test-"));
const bogus = join(tmp, "x.spec.json");
writeFileSync(bogus, JSON.stringify({ spec_id: "x" }));
let code = 0;
try { execFileSync("node", [RENDER, bogus], { stdio: "pipe" }); } catch (e) { code = e.status; }
check("unsupported .spec.json → exit 2", code === 2, `got exit ${code}`);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
