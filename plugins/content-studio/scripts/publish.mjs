#!/usr/bin/env node
/**
 * Deterministic publisher. Zero dependencies — run with:
 *   node scripts/publish.mjs <path-to-content.md> [--target hexo]
 *
 * Front-matter generation is code, not model. This script:
 *   1. runs the publish gate (scripts/check-prepublish.mjs) and aborts if it fails;
 *   2. builds Hexo front matter from config/publish.json + the *.review.json sidecar;
 *   3. strips the draft's <!-- meta --> block and writes the post to the target (write-only);
 *   4. appends a line to the project's publish-log.jsonl.
 *
 * Exit 0 = published. Exit 1 = blocked/failed. Exit 2 = bad usage.
 */

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { CONTENT_ROOT, contentConfig } from "./lib/roots.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const file = process.argv[2];
const targetFlagIdx = process.argv.indexOf("--target");
const targetName = targetFlagIdx > -1 ? process.argv[targetFlagIdx + 1] : null;

if (!file) {
  console.error("usage: node scripts/publish.mjs <path-to-content.md> [--target hexo]");
  process.exit(2);
}
const contentPath = resolve(process.cwd(), file);

// --- 1. gate (single source of truth lives in check-prepublish.mjs) ---------
try {
  execFileSync("node", [resolve(REPO_ROOT, "scripts/check-prepublish.mjs"), contentPath], {
    stdio: "inherit",
  });
} catch {
  console.error("✖ publish aborted: prepublish gate failed.");
  process.exit(1);
}

// --- config + review --------------------------------------------------------
const cfg = JSON.parse(readFileSync(contentConfig("publish.json"), "utf8"));
const tgt = cfg.targets[targetName || cfg.defaultTarget];
const review = JSON.parse(readFileSync(contentPath.replace(/\.md$/i, ".review.json"), "utf8"));
const m = review.metadata || {};

// --- 2. front matter --------------------------------------------------------
function fmtDate(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
const qq = (s) => `"${String(s).replace(/"/g, '\\"')}"`; // quote scalars (titles contain ':')
const flow = (a) => `[${(a || []).join(", ")}]`;

// language for bilingual support: inferred from the .../seo/<lang>/ path, else review.language
const langMatch = contentPath.match(/\/seo\/([a-z]{2})\//);
const lang = langMatch ? langMatch[1] : review.language || "en";

const values = {
  title: () => qq(m.title),
  // optional metadata.date ("YYYY-MM-DD HH:mm:ss") lets serial chapters control their order; else now
  date: () => (m.date ? m.date : fmtDate(new Date())),
  tags: () => flow(m.tags),
  categories: () => flow(m.categories && m.categories.length ? m.categories : ["seo"]),
  description: () => qq(m.description),
  lang: () => lang,
};
const fields = [...(tgt.frontMatter?.fields || ["title", "date", "tags", "categories", "description"]), "lang"];
const fm = ["---", ...fields.filter((f) => values[f]).map((f) => `${f}: ${values[f]()}`), "---", ""].join("\n");

// zh posts live under /zh/ for clean bilingual URLs; en stays at root
const langPrefix = lang !== "en" ? lang : "";

// --- 3. strip meta block, write to target -----------------------------------
const body = readFileSync(contentPath, "utf8").replace(/\n*<!--\s*meta[\s\S]*?-->\s*$/i, "\n");

let outDir = tgt.postsDir.startsWith("/") ? tgt.postsDir : resolve(CONTENT_ROOT, tgt.postsDir);
if (langPrefix) outDir = resolve(outDir, langPrefix);
if (tgt.subdirByContentType) outDir = resolve(outDir, (review.content_type || "seo").replace("-article", ""));
mkdirSync(outDir, { recursive: true });
// output filename: optional metadata.slug (meaningful, collision-free URLs for serials) else the source basename
const outName = (m.slug ? String(m.slug) : basename(contentPath).replace(/\.md$/i, "")) + ".md";
const outPath = resolve(outDir, outName);
writeFileSync(outPath, fm + body);

// --- 4. publish log (find project root by walking up to project.yaml) -------
let dir = dirname(contentPath);
while (dir !== CONTENT_ROOT && dir !== "/" && !existsSync(resolve(dir, "project.yaml"))) dir = dirname(dir);
if (existsSync(resolve(dir, "project.yaml"))) {
  appendFileSync(
    resolve(dir, "publish-log.jsonl"),
    JSON.stringify({
      content_id: review.content_id,
      target: targetName || cfg.defaultTarget,
      path: outPath,
      published_at: new Date().toISOString(),
    }) + "\n"
  );
}

console.log(`✔ published → ${outPath}`);
if (tgt.writeOnly) console.log("  (write-only: run your Hexo build/deploy to go live)");
