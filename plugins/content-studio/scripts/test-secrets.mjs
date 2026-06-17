#!/usr/bin/env node
/**
 * test-secrets — self-test for check-secrets.mjs. Zero deps, no framework.
 * Run with: node scripts/test-secrets.mjs   (exit 0 = all behaved as expected)
 *
 * Proves: a clean tree passes; a planted secret fails (exit 1) and is reported by LABEL; and the
 * secret value is NEVER printed (redaction — the gate must not leak the thing it's protecting).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, "check-secrets.mjs");
let passed = 0, failed = 0;
const check = (name, ok, detail) => ok
  ? (passed++, console.log(`  ✔ ${name}`))
  : (failed++, console.error(`  ✖ ${name} — ${detail || ""}`));

function run(args) {
  try { return { code: 0, out: execFileSync("node", [GATE, ...args], { stdio: ["ignore", "pipe", "pipe"] }).toString(), err: "" }; }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout || "").toString(), err: (e.stderr || "").toString() }; }
}

const dir = mkdtempSync(join(tmpdir(), "cs-secrets-"));
const w = (name, body) => { const p = join(dir, name); writeFileSync(p, body); return p; };

const clean = w("clean.md", "# notes\nJust ordinary content. No keys here, talk of API design is fine.\n");
const FAKE = "sk-ant-" + "A".repeat(28); // matches the Anthropic key pattern; a planted fake
const dirty = w("dirty.md", "deploy config\ntoken: " + FAKE + "\n");

// 1. clean tree passes
{ const r = run([clean]); check("clean -> exit 0", r.code === 0, JSON.stringify(r)); }

// 2. a planted secret fails, by label
{ const r = run([dirty]);
  check("secret -> exit 1", r.code === 1, JSON.stringify(r));
  check("reports the label", /Anthropic API key/.test(r.err), r.err);
  check("REDACTS the value (never printed)", !r.err.includes(FAKE) && !r.out.includes(FAKE), "the secret value leaked into output"); }

// 3. scanning a dir with a secret in it also fails
{ const r = run([dir]); check("dir with a secret -> exit 1", r.code === 1, JSON.stringify(r)); }

// 4. usage
{ const r = run([]); check("no args -> exit 2", r.code === 2, JSON.stringify(r)); }

console.log(`\n${failed ? `✖ ${failed} failed` : `✔ all ${passed} passed`}`);
process.exit(failed ? 1 : 0);
