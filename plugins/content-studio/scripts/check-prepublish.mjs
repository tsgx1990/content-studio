#!/usr/bin/env node
/**
 * Deterministic publish gate. Zero dependencies — run with: node scripts/check-prepublish.mjs <file.md>
 *
 * It does NOT judge quality (no LLM, no float-score threshold). It only enforces hard,
 * reproducible conditions before a file may be written to a publish target:
 *
 *   1. a sibling <basename>.review.json sidecar exists and is valid JSON
 *   2. the review sidecar conforms to schemas/review.schema.json (the contract)
 *   3. review.publishable === true
 *   4. review.copyright_risk !== "high"
 *   5. every config frontMatter.required field is present in review.metadata
 *   6. no obvious secret leaked in the content file
 *   7. affiliate content (review.monetization === "affiliate") carries an FTC disclosure
 *   8. SEO content carries a sibling *.research.json with decision === "pursue" (never publish on guesses)
 *
 * Exit 0 = OK to publish. Exit 1 = blocked (reasons printed to stderr). Exit 2 = bad usage.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./lib/json-schema-mini.mjs";
import { scanForSecrets } from "./lib/secret-patterns.mjs";
import { contentConfig } from "./lib/roots.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function fail(reasons) {
  console.error("✖ prepublish gate FAILED:");
  for (const r of reasons) console.error("  - " + r);
  process.exit(1);
}

const target = process.argv[2];
if (!target) {
  console.error("usage: node scripts/check-prepublish.mjs <path-to-content.md>");
  process.exit(2);
}

const contentPath = resolve(process.cwd(), target);
if (!existsSync(contentPath)) {
  console.error(`content file not found: ${contentPath}`);
  process.exit(2);
}

const reasons = [];

// --- load publish config (required field list) -----------------------------
let requiredFields = ["title", "description", "tags"];
try {
  const cfg = JSON.parse(readFileSync(contentConfig("publish.json"), "utf8"));
  const tgt = cfg.targets?.[cfg.defaultTarget];
  if (tgt?.frontMatter?.required) requiredFields = tgt.frontMatter.required;
  if (typeof tgt?.postsDir === "string" && tgt.postsDir.includes("EDIT_ME")) {
    reasons.push("config/publish.json postsDir still contains EDIT_ME — set your real Hexo path.");
  }
} catch (e) {
  reasons.push(`could not read config/publish.json: ${e.message}`);
}

// --- 1. review sidecar exists ----------------------------------------------
const reviewPath = contentPath.replace(/\.md$/i, ".review.json");
let review = null;
if (!existsSync(reviewPath)) {
  reasons.push(`missing review sidecar: ${basename(reviewPath)} (run content-review first)`);
} else {
  try {
    review = JSON.parse(readFileSync(reviewPath, "utf8"));
  } catch (e) {
    reasons.push(`review sidecar is not valid JSON: ${e.message}`);
  }
}

// --- 2. review sidecar conforms to the schema contract ----------------------
if (review) {
  try {
    const schema = JSON.parse(readFileSync(resolve(REPO_ROOT, "schemas/review.schema.json"), "utf8"));
    for (const err of validate(review, schema, "review")) {
      reasons.push(`review.json schema: ${err}`);
    }
  } catch (e) {
    reasons.push(`could not load schemas/review.schema.json: ${e.message}`);
  }
}

// --- 3/4/5. review gates ----------------------------------------------------
if (review) {
  if (review.publishable !== true) {
    reasons.push("review.publishable is not true — revise the content first.");
  }
  if (review.copyright_risk === "high") {
    reasons.push("review.copyright_risk is 'high' — resolve copyright issues before publishing.");
  }
  const meta = review.metadata || {};
  for (const field of requiredFields) {
    const v = meta[field];
    const empty = v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
    if (empty) reasons.push(`review.metadata.${field} is missing or empty (required to publish).`);
  }
}

// --- 5. secret scan on the content -----------------------------------------
const content = readFileSync(contentPath, "utf8");
for (const label of scanForSecrets(content)) {
  reasons.push(`possible secret in content: ${label}`);
}

// --- 6. affiliate disclosure (only when the review marks this as affiliate content) ---
if (review && review.monetization === "affiliate") {
  const hasDisclosure = /affiliate/i.test(content) && /(disclos|commission|earn)/i.test(content);
  if (!hasDisclosure) {
    reasons.push("review.monetization is 'affiliate' but no affiliate disclosure found in content (FTC requires a disclosure mentioning 'affiliate' + commission/earnings).");
  }
}

// --- 7. SEO content must be grounded in a `pursue` research sidecar ----------
// The most-repeated rule ("never draft on guesses") gets a code gate here, scoped to SEO content
// (by path or content_type) so non-SEO types — which have no research sidecar — are unaffected.
const isSeo = /[\\/]seo[\\/]/.test(contentPath) || (review && review.content_type === "seo-article");
if (isSeo) {
  const researchPath = contentPath.replace(/\.md$/i, ".research.json");
  if (!existsSync(researchPath)) {
    reasons.push(`SEO content has no research sidecar: ${basename(researchPath)} — run keyword-research first (never publish SEO drafted on guesses).`);
  } else {
    try {
      const research = JSON.parse(readFileSync(researchPath, "utf8"));
      if (research.decision !== "pursue") {
        reasons.push(`research decision is "${research.decision}" (not "pursue") — do not publish SEO content the research said to skip/defer.`);
      }
    } catch (e) {
      reasons.push(`research sidecar is not valid JSON: ${e.message}`);
    }
  }
}

if (reasons.length) fail(reasons);

console.log(`✔ prepublish gate passed: ${basename(contentPath)}`);
process.exit(0);
