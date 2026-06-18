#!/usr/bin/env node
/**
 * test-fs — lock the shared fs helpers in lib/fs.mjs (TC-019). Zero dependencies.
 * Run with: node scripts/test-fs.mjs   (exit 0 = all behaved as expected)
 *
 * `walk` + `isText` back five consumers (check.mjs, check-batch.mjs, check-secrets.mjs,
 * test-render.mjs and the plugin exporter). A silent regression there — a dropped recursion, a
 * text extension that stops being scanned — would weaken the secret/PII scan everywhere at once,
 * so the contract gets a direct test of its own, not just incidental coverage through callers.
 */

import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { walk, isText, TEXT_EXT } from "./lib/fs.mjs";

let passed = 0, failed = 0;
const t = (name, ok, detail) => ok
  ? (passed++, console.log(`  ✔ ${name}`))
  : (failed++, console.error(`  ✖ ${name} — ${detail || ""}`));

// build a small tree:  root/a.txt  root/sub/b.md  root/sub/deep/c.json
const root = mkdtempSync(join(tmpdir(), "fs-test-"));
const aTxt = join(root, "a.txt");
const bMd = join(root, "sub", "b.md");
const cJson = join(root, "sub", "deep", "c.json");
mkdirSync(join(root, "sub", "deep"), { recursive: true });
writeFileSync(aTxt, "a");
writeFileSync(bMd, "b");
writeFileSync(cJson, "c");

console.log("walk:");
const all = walk(root);
t("recurses every nested file", all.length === 3, `got ${all.length}: ${all.join(", ")}`);
t("includes the deepest file", all.includes(cJson), "missing root/sub/deep/c.json");
t("a single file -> [that file]", JSON.stringify(walk(aTxt)) === JSON.stringify([aTxt]), "file input should return [p]");
t("a missing path -> [] (no throw)", JSON.stringify(walk(join(root, "nope"))) === "[]", "missing path should be empty");
{
  const empty = join(root, "empty");
  mkdirSync(empty);
  t("an empty dir -> []", JSON.stringify(walk(empty)) === "[]", "empty dir should be empty");
}

console.log("isText:");
t(".md is text", isText("/x/y.md") === true);
t(".csv is text (secrets land in CSVs too)", isText("a/b/data.csv") === true);
t(".env is text", isText("deploy/prod.env") === true);
t("extension match is case-insensitive", isText("/X/Y.MD") === true, "uppercase .MD should match");
t(".png is not text", isText("img/logo.png") === false);
t("a no-extension file is not text", isText("Makefile") === false);
t("TEXT_EXT is a non-empty Set", TEXT_EXT instanceof Set && TEXT_EXT.size > 0);

rmSync(root, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
