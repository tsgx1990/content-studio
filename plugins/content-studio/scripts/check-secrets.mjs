#!/usr/bin/env node
/**
 * check-secrets — scan files/dirs for accidentally-committed secrets. Zero dependencies.
 *   node scripts/check-secrets.mjs <path|dir ...>
 *
 * Reuses scripts/lib/secret-patterns.mjs — the SINGLE source of truth already shared by the publish
 * gate (check-prepublish.mjs) and the Write/Edit hook (guard-secrets.mjs). check.mjs runs this over
 * the content root (projects/ + config/) so a secret pasted into ANY file — not just a drafted
 * article — fails repo health, not only the publish gate.
 *
 * Reports `file:line — <label>` and **REDACTS the value** (a secret is never printed to the terminal
 * or logs). Exit 0 = clean. Exit 1 = secret(s) found. Exit 2 = usage.
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { walk, isText } from "./lib/fs.mjs";
import { scanForSecrets } from "./lib/secret-patterns.mjs";

const args = process.argv.slice(2);
if (!args.length) { console.error("usage: node scripts/check-secrets.mjs <path|dir ...>"); process.exit(2); }

const files = args.flatMap(walk).filter(isText);
let found = 0;
for (const f of files) {
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const label of scanForSecrets(line)) {
      found++; console.error(`✖ ${relative(process.cwd(), f)}:${i + 1} — ${label} (redacted)`);
    }
  });
}

if (found) {
  console.error(`\n${found} secret(s) found — remove them; use an env var or a gitignored .env, never commit a key.`);
  process.exit(1);
}
console.log(`✔ no secrets in ${files.length} file(s)`);
process.exit(0);
