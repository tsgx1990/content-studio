#!/usr/bin/env node
/**
 * SessionStart hook — inject DYNAMIC project status into the session context.
 * Zero dependencies. The static rules already live in AGENTS.md / CLAUDE.md; this adds only the
 * things that change session to session: where each article is in the pipeline, the publish
 * target's state, and the most recent PROGRESS entry — so the agent starts grounded in reality.
 *
 * Protocol: Claude Code reads stdout (or hookSpecificOutput.additionalContext) from a SessionStart
 * hook and adds it to the context. Fails open (prints nothing, exit 0) on any error.
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function safe(fn, fallback) {
  try { return fn(); } catch { return fallback; }
}

/** Recursively list files under dir. */
function walk(dir) {
  const out = [];
  for (const name of safe(() => readdirSync(dir), [])) {
    const p = resolve(dir, name);
    if (safe(() => statSync(p).isDirectory(), false)) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function buildContext() {
  const lines = [];
  const projectsDir = resolve(ROOT, "projects");
  const projects = safe(() => readdirSync(projectsDir), [])
    .filter((n) => existsSync(resolve(projectsDir, n, "project.yaml")));

  // published content_ids (from each project's publish-log.jsonl)
  const published = new Set();
  for (const p of projects) {
    const log = resolve(projectsDir, p, "publish-log.jsonl");
    for (const line of safe(() => readFileSync(log, "utf8").trim().split("\n"), [])) {
      const id = safe(() => JSON.parse(line).content_id, null);
      if (id) published.add(id);
    }
  }

  // group seo files by lang/basename → pipeline stage
  const articleLines = [];
  for (const p of projects) {
    const files = walk(resolve(projectsDir, p, "seo"));
    const arts = new Map();
    for (const f of files) {
      const m = f.match(/\/seo\/([a-z]{2})\/(.+?)(\.research\.json|\.review\.json|\.md)$/);
      if (!m) continue;
      const key = `${m[1]}/${m[2]}`;
      const a = arts.get(key) || { lang: m[1], base: m[2] };
      if (m[3] === ".research.json") a.research = safe(() => JSON.parse(readFileSync(f, "utf8")).decision, "?");
      if (m[3] === ".md") a.drafted = true;
      if (m[3] === ".review.json") a.publishable = safe(() => JSON.parse(readFileSync(f, "utf8")).publishable, null);
      arts.set(key, a);
    }
    for (const a of arts.values()) {
      const stage = [
        a.research ? `research:${a.research}` : "no-research",
        a.drafted ? "drafted" : null,
        a.publishable === true ? "review:ok" : a.publishable === false ? "review:blocked" : null,
        published.has(basename(a.base)) ? "published" : null,
      ].filter(Boolean).join(" · ");
      articleLines.push(`  - ${p} [${a.lang}] ${a.base} — ${stage}`);
    }
  }

  lines.push("AI Content Studio — live status (the product is the TOOLKIT; the blog is a proving ground).");
  lines.push("Pipeline: keyword-research → seo-article → content-review → publish-content (gate).");
  if (articleLines.length) {
    lines.push("Articles:");
    lines.push(...articleLines);
  } else {
    lines.push("Articles: none yet.");
  }

  // publish target state
  const cfg = safe(() => JSON.parse(readFileSync(resolve(ROOT, "config/publish.json"), "utf8")), null);
  const postsDir = cfg && safe(() => cfg.targets[cfg.defaultTarget].postsDir, null);
  if (postsDir) {
    lines.push(`Publish target: ${postsDir}${postsDir.includes("EDIT_ME") ? " (NOT SET — replace EDIT_ME before publishing)" : ""}`);
  }

  // most recent PROGRESS headline
  const progress = safe(() => readFileSync(resolve(ROOT, "PROGRESS.md"), "utf8"), "");
  const lastEntry = progress.split("\n").find((l) => /^## /.test(l));
  if (lastEntry) lines.push(`Last progress: ${lastEntry.replace(/^##\s*/, "")}`);

  lines.push("Reminders: never draft without a `pursue` research sidecar; never publish without a passing review + `node scripts/check-prepublish.mjs`; end repo-changing tasks with a PROGRESS.md entry. Out of scope (v1): src/ engine, model routing, acs CLI, Web UI.");

  return lines.join("\n");
}

const context = safe(buildContext, "");
if (context) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context },
  }));
}
process.exit(0);
