#!/usr/bin/env node
/**
 * test-topic-feedback — fixture self-test for build-topic-feedback.mjs. Zero dependencies.
 * Run with: node scripts/test-topic-feedback.mjs
 * Exit 0 = all cases behaved as expected, exit 1 = a check regressed.
 *
 * Proves the data-feedback loop: real-CSV → joined verdicts → opportunities → unvalidated
 * suggestions, plus the honesty contract (no export = refuse, never fabricate; null = not seen).
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./lib/json-schema-mini.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOL = resolve(HERE, "build-topic-feedback.mjs");
const SCHEMA = JSON.parse(readFileSync(resolve(HERE, "../schemas/topic-feedback.schema.json"), "utf8"));
let passed = 0, failed = 0;

function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✖ ${name}${detail ? " — " + detail : ""}`); }
}
function run(projectDir, extra = []) {
  try { return { code: 0, out: execFileSync("node", [TOOL, projectDir, ...extra], { stdio: ["pipe", "pipe", "pipe"] }).toString() }; }
  catch (e) { return { code: typeof e.status === "number" ? e.status : 1, out: (e.stdout || "").toString(), err: (e.stderr || "").toString() }; }
}

// ---- build a fixture project ------------------------------------------------
const root = mkdtempSync(join(tmpdir(), "feedback-test-"));
const proj = join(root, "demo");
mkdirSync(join(proj, "analytics"), { recursive: true });

// three published articles
writeFileSync(join(proj, "publish-log.jsonl"),
  [
    { content_id: "best-ai-novel-tools", target: "hexo", path: "/blog/_posts/seo/best-ai-novel-tools.md", published_at: "2026-05-01T00:00:00Z" },
    { content_id: "sudowrite-vs-novelcrafter", target: "hexo", path: "/blog/_posts/seo/sudowrite-vs-novelcrafter.md", published_at: "2026-05-01T00:00:00Z" },
    { content_id: "never-seen-article", target: "hexo", path: "/blog/_posts/seo/never-seen-article.md", published_at: "2026-05-01T00:00:00Z" },
  ].map((x) => JSON.stringify(x)).join("\n") + "\n");

// a GSC Pages export: a winner, an underperformer, (the third article absent on purpose)
writeFileSync(join(proj, "analytics", "pages.csv"),
  'Top pages,Clicks,Impressions,CTR,Position\n' +
  '"https://site/seo/best-ai-novel-tools/","1,240","20,000","6.2%","4.1"\n' +
  '"https://site/seo/sudowrite-vs-novelcrafter/","3","5,400","0.06%","11.8"\n' +
  '"https://site/seo/some-other-page/","2","30","6.6%","9"\n');

// a GSC Queries export: one real opportunity, plus a low-impression query that must NOT qualify
writeFileSync(join(proj, "analytics", "queries.csv"),
  'Top queries,Clicks,Impressions,CTR,Position\n' +
  '"free ai story generator","2","2,300","0.09%","14.2"\n' +     // opportunity: high impressions, weak pos / low ctr
  '"best ai novel tools","900","15,000","6.0%","4"\n' +          // owned by the winner → excluded
  '"obscure tail query","0","12","0%","30"\n');                 // below --opp-impressions → excluded

// ---- 1. valid run -----------------------------------------------------------
const r = run(proj);
check("exit 0 on a real export", r.code === 0, `code=${r.code} err=${r.err}`);
let data = null;
try { data = JSON.parse(readFileSync(join(proj, "demo.feedback.json"), "utf8")); } catch (e) { /* handled below */ }
check("wrote demo.feedback.json", !!data);

if (data) {
  check("conforms to topic-feedback.schema.json", validate(data, SCHEMA, "feedback").length === 0,
    JSON.stringify(validate(data, SCHEMA, "feedback")));

  const byId = Object.fromEntries(data.published_performance.map((p) => [p.content_id, p]));
  check("winner detected (>= winner-clicks)", byId["best-ai-novel-tools"]?.verdict === "winner", JSON.stringify(byId["best-ai-novel-tools"]));
  check("underperformer detected (impressions high, ctr < 1%)", byId["sudowrite-vs-novelcrafter"]?.verdict === "underperformer", JSON.stringify(byId["sudowrite-vs-novelcrafter"]));
  check("article absent from export → low-data, metrics NULL (not 0)",
    byId["never-seen-article"]?.verdict === "low-data" && byId["never-seen-article"]?.clicks === null && byId["never-seen-article"]?.impressions === null,
    JSON.stringify(byId["never-seen-article"]));

  check("CTR parsed from percent string (6.2% → ~0.062)", Math.abs((byId["best-ai-novel-tools"]?.ctr ?? 0) - 0.062) < 0.005, String(byId["best-ai-novel-tools"]?.ctr));
  check("thousands-separated impressions parsed (20,000)", byId["best-ai-novel-tools"]?.impressions === 20000, String(byId["best-ai-novel-tools"]?.impressions));

  const oppQs = data.opportunities.map((o) => o.query);
  check("opportunity query surfaced", oppQs.includes("free ai story generator"), JSON.stringify(oppQs));
  check("owned query excluded from opportunities", !oppQs.includes("best ai novel tools"), JSON.stringify(oppQs));
  check("low-impression query excluded from opportunities", !oppQs.includes("obscure tail query"), JSON.stringify(oppQs));

  const types = data.suggestions.map((s) => s.type);
  check("suggestion: double-down on the winner", data.suggestions.some((s) => s.type === "double-down" && s.target === "best-ai-novel-tools"), JSON.stringify(types));
  check("suggestion: revise the underperformer", data.suggestions.some((s) => s.type === "revise" && s.target === "sudowrite-vs-novelcrafter"), JSON.stringify(types));
  check("suggestion: new-topic from the opportunity", data.suggestions.some((s) => s.type === "new-topic" && s.target === "free ai story generator"), JSON.stringify(types));
  check("every suggestion is unvalidated (no fabricated demand)", data.suggestions.length > 0 && data.suggestions.every((s) => s.status === "unvalidated"), JSON.stringify(data.suggestions.map((s) => s.status)));
  check("data_quality is measured + thresholds recorded", data.data_quality === "measured" && data.thresholds && data.thresholds.winner_clicks === 10, JSON.stringify(data.thresholds));
}

// ---- 2. honesty: no export → refuse (exit 1), no file written ---------------
const empty = join(root, "empty");
mkdirSync(empty, { recursive: true });
const r2 = run(empty);
check("no analytics export → exit 1 (refuses to guess)", r2.code === 1, `code=${r2.code}`);
check("no analytics export → explains the honest tier", /never fabricate|Export a Pages/i.test(r2.err || ""), r2.err);

// ---- 3. threshold override is respected ------------------------------------
run(proj, ["--winner-clicks", "5000", "--out", join(proj, "strict.feedback.json")]);
let strict = null;
try { strict = JSON.parse(readFileSync(join(proj, "strict.feedback.json"), "utf8")); } catch {}
check("raising --winner-clicks demotes the winner (threshold is policy)",
  !!strict && strict.published_performance.find((p) => p.content_id === "best-ai-novel-tools")?.verdict !== "winner",
  strict ? JSON.stringify(strict.published_performance.find((p) => p.content_id === "best-ai-novel-tools")) : "no file");

rmSync(root, { recursive: true, force: true });
console.log(`\n${failed ? `✖ ${failed} failed` : "✔ all passed"} (${passed} checks)`);
process.exit(failed ? 1 : 0);
