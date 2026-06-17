/**
 * roots — single source of truth for "where does the user's CONTENT live". Zero dependencies.
 *
 * Two roots exist and must not be confused. The toolkit's OWN files (scripts/ + schemas/) are found
 * script-relative by each gate locally — they travel together, so that's stable whether run in-repo
 * or installed as a plugin. The USER's content (projects/, config/) is a DIFFERENT root: the current
 * working directory, so that an installed plugin reads the user's workspace, not the plugin's own dir.
 *
 * That second root was being re-decided in five places (four raw `process.cwd()`, one env-aware in
 * check.mjs) and check-freshness even read its config from the WRONG (script-relative) root — so a
 * plugin user's config/data-freshness.json was silently never found. This module owns the decision
 * once, so every gate agrees and all honour CONTENT_STUDIO_ROOT identically.
 *
 *   CONTENT_ROOT        — env CONTENT_STUDIO_ROOT, else the cwd.
 *   contentPath(...p)   — a path under the content root.
 *   contentConfig(name) — a file under <content root>/config (publish.json, data-freshness.json, …).
 */
import { resolve } from "node:path";

export const CONTENT_ROOT = process.env.CONTENT_STUDIO_ROOT || process.cwd();
export const contentPath = (...p) => resolve(CONTENT_ROOT, ...p);
export const contentConfig = (name) => resolve(CONTENT_ROOT, "config", name);
