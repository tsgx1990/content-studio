/**
 * Shared secret patterns — single source of truth for "is there a leaked secret in this text".
 * Used by both the publish gate (scripts/check-prepublish.mjs) and the Write/Edit hook
 * (scripts/hooks/guard-secrets.mjs) so the two enforcement points never drift apart.
 * Zero dependencies.
 */

export const SECRET_PATTERNS = [
  [/sk-ant-[A-Za-z0-9-]{20,}/, "Anthropic API key (sk-ant-...)"],
  [/sk-[A-Za-z0-9]{20,}/, "OpenAI-style API key (sk-...)"],
  [/(OPENAI|ANTHROPIC|API|SECRET|ACCESS|PRIVATE)_?(KEY|TOKEN|SECRET)\s*[:=]\s*['"]?[A-Za-z0-9/_+.-]{12,}/i, "inline secret assignment"],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "private key block"],
  [/ghp_[A-Za-z0-9]{30,}/, "GitHub personal access token"],
  [/gho_[A-Za-z0-9]{30,}/, "GitHub OAuth token"],
  [/xox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/AKIA[0-9A-Z]{16}/, "AWS access key id"],
];

/** Return the list of matched secret labels in `text` (empty array = clean). */
export function scanForSecrets(text) {
  const hits = [];
  for (const [re, label] of SECRET_PATTERNS) {
    if (re.test(text)) hits.push(label);
  }
  return hits;
}
