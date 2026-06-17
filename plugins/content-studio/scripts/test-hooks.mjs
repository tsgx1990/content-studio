#!/usr/bin/env node
/**
 * test-hooks — fixture self-test for the PreToolUse guards. Zero dependencies.
 * Run with: node scripts/test-hooks.mjs
 *
 * Pipes Claude-Code-style hook JSON to each guard and asserts exit 0 (allow) / exit 2 (block).
 * Exit 0 = all cases behaved as expected, exit 1 = a guard regressed.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HOOKS = dirname(fileURLToPath(import.meta.url)) + "/hooks";
const BASH = resolve(HOOKS, "guard-bash.mjs");
const SECRETS = resolve(HOOKS, "guard-secrets.mjs");
const SESSION = resolve(HOOKS, "session-context.mjs");

let passed = 0, failed = 0;

/** Run a hook with a JSON payload on stdin; return { code, stdout }. */
function run(script, payload) {
  try {
    const stdout = execFileSync("node", [script], { input: JSON.stringify(payload), stdio: ["pipe", "pipe", "pipe"] });
    return { code: 0, stdout: stdout.toString() };
  } catch (e) {
    return { code: typeof e.status === "number" ? e.status : 1, stdout: (e.stdout || "").toString() };
  }
}

/** Back-compat helper: just the exit code. */
function runHook(script, payload) {
  return run(script, payload).code;
}

function bashCase(cmd, wantBlock) {
  const code = runHook(BASH, { tool_name: "Bash", tool_input: { command: cmd } });
  check(`bash: ${cmd}`, wantBlock ? code === 2 : code === 0, `exit=${code}, wanted ${wantBlock ? "block" : "allow"}`);
}

function writeCase(name, toolInput, wantBlock) {
  const code = runHook(SECRETS, { tool_name: "Write", tool_input: toolInput });
  check(`write: ${name}`, wantBlock ? code === 2 : code === 0, `exit=${code}, wanted ${wantBlock ? "block" : "allow"}`);
}

function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✖ ${name} — ${detail}`); }
}

const FAKE_KEY = "sk-ant-" + "api03ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";

console.log("guard-bash:");
bashCase("git status", false);
bashCase("npm test", false);
bashCase("git rm projects/ai-writing-blog/seo/en/old.md", false); // single staged removal — allowed
bashCase("rm projects/notes.txt", false);                          // no -r/-f — allowed
bashCase("rm -rf node_modules", false);                            // not under projects/ — allowed
bashCase("rm -rf projects/ai-writing-blog", true);
bashCase("rm -rf /", true);
bashCase("rm .env", true);
bashCase("git push --force origin main", true);
bashCase("git clean -fd", true);
bashCase("cat .env", true);
bashCase("echo $ANTHROPIC_API_KEY", true);

console.log("guard-secrets:");
writeCase("clean content -> allow", { file_path: "projects/x/seo/en/a.md", content: "# Title\n\nNormal body.\n" }, false);
writeCase("secret in content -> block", { file_path: "projects/x/seo/en/a.md", content: `key = "${FAKE_KEY}"\n` }, true);
writeCase("secret in Edit new_string -> block", { file_path: "src/app.ts", new_string: `const k = "${FAKE_KEY}"` }, true);
// the security tooling itself is allow-listed (it contains pattern fixtures):
writeCase("allow-listed test file -> allow", { file_path: "scripts/test-gate.mjs", content: `const t = "${FAKE_KEY}"` }, false);

console.log("session-context:");
{
  const { code, stdout } = run(SESSION, { hook_event_name: "SessionStart", source: "startup" });
  let ctx = null;
  try { ctx = JSON.parse(stdout).hookSpecificOutput?.additionalContext; } catch { /* leave null */ }
  check("exits 0 with non-empty additionalContext", code === 0 && typeof ctx === "string" && ctx.length > 0, `code=${code}, ctx=${ctx ? ctx.length + " chars" : "missing"}`);
  check("mentions the pipeline", typeof ctx === "string" && /keyword-research/.test(ctx), "expected pipeline reminder in context");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
