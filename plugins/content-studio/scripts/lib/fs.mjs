/**
 * Shared zero-dep fs helpers — one home for "list the files under a path" and "is this a text file
 * worth line-scanning". The recursive `walk` backs the repo health check (check.mjs), the batch
 * triage (check-batch.mjs), the secret gate (check-secrets.mjs), the render self-test
 * (test-render.mjs) and the plugin exporter (tools/export-plugin.mjs); `isText` is used by the two
 * line-scanners. Keeping the walk + the text-extension set here stops these consumers drifting (a
 * secret pasted into a .csv must be scanned the same way everywhere). Locked by test-fs.mjs.
 * NOTE: this `walk` throws on an unreadable path — callers that must never fail (the SessionStart
 * hook) keep their own fail-open variant on purpose; don't fold those in here. Zero dependencies.
 */
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

// text formats only — binaries can't be line-scanned meaningfully and aren't where secrets/PII land
export const TEXT_EXT = new Set([
  ".md", ".mjs", ".js", ".cjs", ".json", ".jsonl", ".txt", ".yaml", ".yml", ".csv", ".html", ".svg", ".env",
]);
export const isText = (p) => TEXT_EXT.has(extname(p).toLowerCase());

/** Recursively list files under a path. File → [p]; dir → every file within; missing → []. */
export function walk(p) {
  if (!existsSync(p)) return [];
  if (statSync(p).isDirectory()) return readdirSync(p).flatMap((n) => walk(join(p, n)));
  return [p];
}
