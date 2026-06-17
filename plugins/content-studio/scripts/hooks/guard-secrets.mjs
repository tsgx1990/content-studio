#!/usr/bin/env node
/**
 * PreToolUse hook (matcher: Write|Edit|MultiEdit) — block writing a secret into any file.
 * Deterministic enforcement of the AGENTS.md rule "never write API keys into generated files".
 * Zero dependencies.
 *
 * Protocol: reads the Claude Code hook JSON from stdin. Exit 0 = allow; exit 2 = block (stderr
 * is shown to the agent). Any unexpected error exits 0 (fail-open) so the hook can never wedge
 * the session — the publish gate still scans content as a second line of defense.
 */

import { scanForSecrets } from "../lib/secret-patterns.mjs";

// The security tooling legitimately contains secret-shaped regexes/fixtures — don't flag it.
const ALLOWLIST = [
  "scripts/lib/secret-patterns.mjs",
  "scripts/test-gate.mjs",
  "scripts/test-hooks.mjs",
];

function block(msg) {
  console.error(`✖ blocked by guard-secrets: ${msg}`);
  process.exit(2);
}

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    process.exit(0); // can't parse — fail open
  }

  const filePath = input.tool_input?.file_path || "";
  if (ALLOWLIST.some((p) => filePath.replace(/\\/g, "/").endsWith(p))) process.exit(0);

  // Collect every chunk of text this tool would write.
  const ti = input.tool_input || {};
  const chunks = [];
  if (typeof ti.content === "string") chunks.push(ti.content); // Write
  if (typeof ti.new_string === "string") chunks.push(ti.new_string); // Edit
  if (Array.isArray(ti.edits)) for (const e of ti.edits) if (typeof e.new_string === "string") chunks.push(e.new_string); // MultiEdit

  const hits = scanForSecrets(chunks.join("\n"));
  if (hits.length) {
    block(`would write a secret (${hits.join(", ")}) into ${filePath || "a file"}. ` +
      `Remove it / use an env var or .env (never commit secrets).`);
  }
  process.exit(0);
});
