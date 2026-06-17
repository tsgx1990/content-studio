/**
 * Shared zero-dep fs helpers — one home for "list the files under a path" and "is this a text file
 * worth line-scanning". Both the secret gate (check-secrets.mjs) and the plugin exporter
 * (tools/export-plugin.mjs) need the same TWO things; keeping the recursive walk and the
 * text-extension set here stops them drifting (a secret pasted into a .csv must be scanned by both).
 * Zero dependencies.
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
