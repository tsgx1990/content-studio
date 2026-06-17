#!/usr/bin/env node
/**
 * test-gate — fixture self-test for the deterministic gates. Zero dependencies.
 * Run with: node scripts/test-gate.mjs
 *
 * It writes throwaway fixtures to a temp dir and asserts that check-prepublish.mjs and
 * validate-sidecar.mjs accept the valid cases and reject each failure mode. This protects the
 * gates from regressions without adding a build/test toolchain.
 *
 * Exit 0 = all cases behaved as expected. Exit 1 = at least one case regressed.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(SCRIPTS, "check-prepublish.mjs");
const VALIDATE = resolve(SCRIPTS, "validate-sidecar.mjs");
const tmp = mkdtempSync(join(tmpdir(), "gate-test-"));

let passed = 0;
let failed = 0;

/** Run a node script with one arg; return its exit code (0 if it exits cleanly). */
function exitCode(script, arg) {
  try {
    execFileSync("node", [script, arg], { stdio: "pipe" });
    return 0;
  } catch (e) {
    return typeof e.status === "number" ? e.status : 1;
  }
}

/** Assert the gate produces `wantPass` for a content file + its review sidecar. */
function gateCase(name, { content = "# Post\n\nBody text.\n", review, research }, wantPass) {
  const base = join(tmp, name.replace(/\W+/g, "-"));
  const md = base + ".md";
  writeFileSync(md, content);
  if (review !== undefined) writeFileSync(base + ".review.json", JSON.stringify(review, null, 2));
  if (research !== undefined) writeFileSync(base + ".research.json", JSON.stringify(research, null, 2));
  const code = exitCode(GATE, md);
  check(name, wantPass ? code === 0 : code !== 0, `gate exit=${code}, wanted ${wantPass ? "pass" : "fail"}`);
}

/** Assert validate-sidecar produces `wantPass` for a sidecar object. */
function sidecarCase(name, suffix, obj, wantPass) {
  const file = join(tmp, name.replace(/\W+/g, "-") + suffix);
  writeFileSync(file, JSON.stringify(obj, null, 2));
  const code = exitCode(VALIDATE, file);
  check(name, wantPass ? code === 0 : code !== 0, `validate exit=${code}, wanted ${wantPass ? "pass" : "fail"}`);
}

function check(name, ok, detail) {
  if (ok) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.error(`  ✖ ${name} — ${detail}`);
  }
}

// ---- fixtures ---------------------------------------------------------------
const validReview = {
  content_id: "x",
  reviewed_at: "2026-06-05T00:00:00.000Z",
  publishable: true,
  copyright_risk: "low",
  metadata: { title: "T", description: "D", tags: ["a"] },
};
const validResearch = {
  primary_keyword: "k",
  source: "web-search",
  data_quality: "estimated",
  search_intent: "commercial",
  decision: "pursue",
  researched_at: "2026-06-05T00:00:00.000Z",
  search_volume: null,
};
const clone = (o) => JSON.parse(JSON.stringify(o));

console.log("publish gate:");
gateCase("valid -> pass", { review: validReview }, true);
gateCase("missing review sidecar -> fail", { review: undefined }, false);
gateCase("publishable=false -> fail", { review: { ...clone(validReview), publishable: false } }, false);
gateCase("copyright_risk=high -> fail", { review: { ...clone(validReview), copyright_risk: "high" } }, false);
gateCase("missing required metadata -> fail", (() => { const r = clone(validReview); delete r.metadata.description; return { review: r }; })(), false);
gateCase("secret in content -> fail", { content: "# Post\n\nsk-ant-api03ABCDEFGHIJKLMNOPQRSTUVWXYZ012345\n", review: validReview }, false); // pii-gate-allow: fake sk-ant fixture
gateCase("affiliate without disclosure -> fail", { review: { ...clone(validReview), monetization: "affiliate" } }, false);
gateCase("schema violation (bad enum) -> fail", { review: { ...clone(validReview), copyright_risk: "extreme" } }, false);
// SEO content must be grounded in a `pursue` research sidecar (the "never publish on guesses" gate).
gateCase("seo content without research -> fail", { review: { ...clone(validReview), content_type: "seo-article" } }, false);
gateCase("seo content with pursue research -> pass", { review: { ...clone(validReview), content_type: "seo-article" }, research: validResearch }, true);
gateCase("seo content with skip research -> fail", { review: { ...clone(validReview), content_type: "seo-article" }, research: { ...clone(validResearch), decision: "skip" } }, false);
gateCase("non-seo content needs no research -> pass", { review: validReview }, true);

console.log("sidecar validator:");
sidecarCase("valid review", ".review.json", validReview, true);
sidecarCase("valid research", ".research.json", validResearch, true);
sidecarCase("research bad source pattern -> fail", ".research.json", { ...clone(validResearch), source: "telepathy" }, false);
sidecarCase("research missing required -> fail", ".research.json", (() => { const r = clone(validResearch); delete r.decision; return r; })(), false);

// ---- summary ----------------------------------------------------------------
rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
