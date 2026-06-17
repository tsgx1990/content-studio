#!/usr/bin/env node
/**
 * PreToolUse hook (matcher: Bash) — block a small set of clearly-catastrophic commands that
 * should never originate from the agent. Deterministic backstop for the AGENTS.md safety rules.
 * Zero dependencies.
 *
 * Deliberately NARROW to avoid false positives: it only blocks forced/recursive deletion under
 * projects/ (or the blog posts dir), force-pushes, and commands that print secrets. Ordinary
 * `git rm <file>` and normal deletes are NOT blocked. A blocked command isn't forbidden forever —
 * the user can run it themselves outside the agent if they truly intend it.
 *
 * Protocol: reads hook JSON from stdin. Exit 0 = allow; exit 2 = block (stderr shown to agent).
 * Unexpected errors fail open (exit 0) so the hook can never wedge the session.
 */

const RULES = [
  [/\brm\b[^|;&\n]*\s-[A-Za-z]*[rf][A-Za-z]*\b[^|;&\n]*\b(projects|_posts)\b/, "recursive/forced delete under projects/ or the blog _posts — deletion under projects/ needs explicit user confirmation (run it yourself if intended)."],
  [/\brm\b\s+-[A-Za-z]*[rf][A-Za-z]*\s+(\/|~|\.|\*)(\s|$)/, "recursive/forced delete of /, ~, ., or * — refusing a catastrophic wipe."],
  [/\brm\b[^|;&\n]*\s\.env\b/, "deleting .env — refusing (secrets/config)."],
  [/\bgit\s+push\b[^|;&\n]*(--force\b|--force-with-lease\b|\s-f\b)/, "git force-push — refusing; push normally, or force-push yourself if you really mean to."],
  [/\bgit\s+clean\b[^|;&\n]*-[A-Za-z]*f[A-Za-z]*d/, "git clean -fd — refusing; it deletes untracked files irreversibly."],
  [/\b(cat|less|more|head|tail|bat)\b[^|;&\n]*\.env(\.|\b)/, "printing .env — refusing to expose secrets."],
  [/\b(echo|printf)\b[^|;&\n]*\$\{?(ANTHROPIC|OPENAI|API|SECRET|ACCESS|PRIVATE|GITHUB|AWS)[A-Z_]*(KEY|TOKEN|SECRET)/i, "printing a secret env var — refusing."],
  [/\b(env|printenv)\b[^|;&\n]*(grep|rg)[^|;&\n]*(key|token|secret|password)/i, "dumping secret env vars — refusing."],
];

function block(reason) {
  console.error(`✖ blocked by guard-bash: ${reason}`);
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
  const cmd = input.tool_input?.command;
  if (typeof cmd !== "string" || !cmd) process.exit(0);

  for (const [re, reason] of RULES) {
    if (re.test(cmd)) block(reason);
  }
  process.exit(0);
});
