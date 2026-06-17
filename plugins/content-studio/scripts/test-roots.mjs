#!/usr/bin/env node
/**
 * test-roots — lock the single content-root resolver (lib/roots.mjs, TC-015). Zero dependencies.
 * Fails if CONTENT_ROOT stops honouring CONTENT_STUDIO_ROOT, or contentConfig drifts off it (which
 * is the bug that left a plugin user's config/data-freshness.json unreadable). roots.mjs reads the
 * env at import time, so each case probes a fresh child process with the env set.
 */
import { execFileSync } from "node:child_process";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOTS = resolve(dirname(fileURLToPath(import.meta.url)), "lib/roots.mjs");
let fail = 0;
const t = (name, cond) => { if (cond) console.log(`  ✔ ${name}`); else { fail++; console.error(`  ✖ ${name}`); } };

const probe = (env) => JSON.parse(execFileSync("node", [
  "--input-type=module", "-e",
  `import { CONTENT_ROOT, contentConfig } from ${JSON.stringify(ROOTS)};` +
  `console.log(JSON.stringify({ CONTENT_ROOT, cfg: contentConfig("publish.json") }));`,
], { env: { ...process.env, ...env }, encoding: "utf8" }).trim());

// 1. env override wins, and config resolves under it
{
  const r = probe({ CONTENT_STUDIO_ROOT: "/tmp/cs-root-test" });
  t("CONTENT_ROOT honours CONTENT_STUDIO_ROOT", r.CONTENT_ROOT === "/tmp/cs-root-test");
  t("contentConfig resolves under the env root", r.cfg === `/tmp/cs-root-test${sep}config${sep}publish.json`);
}
// 2. default = cwd (empty env var is falsy)
{
  const r = probe({ CONTENT_STUDIO_ROOT: "" });
  t("CONTENT_ROOT defaults to cwd", r.CONTENT_ROOT === process.cwd());
}

console.log(fail ? `\n✖ ${fail} failed` : "\n✔ all passed");
process.exit(fail ? 1 : 0);
