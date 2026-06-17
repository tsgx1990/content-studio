#!/usr/bin/env node
/**
 * build-topic-feedback — turn a project's REAL analytics export into a next-topic evidence sidecar.
 * Zero dependencies. Run with:
 *   node scripts/build-topic-feedback.mjs <project-slug-or-dir> [--out <file>] [options]
 *
 * Why this exists (the data-feedback loop, roadmap M5): the toolkit could plan → draft → review →
 * publish, but nothing fed real traffic back into "what to make next". This closes the loop WITHOUT
 * violating the v1 ethos: zero-dep, file-based, and it NEVER fabricates a metric (the same honesty
 * contract as keyword-research — real numbers from an export, `null` when the export is silent).
 *
 * Input (you provide, honest tier): one or more CSVs the user EXPORTS from Google Search Console
 * (or GA4) into `projects/<slug>/analytics/`. Two shapes are understood, by header sniffing:
 *   - a PAGES export   (a page/URL column + Clicks/Impressions/CTR/Position) — joined to published articles
 *   - a QUERIES export (a query column + the same metrics)                    — mined for opportunities
 * GSC's UI "Export" gives exactly these columns; CTR like "5.2%" and counts like "1,234" are handled.
 *
 * What it does:
 *   1. reads publish-log.jsonl → the set of published articles (content_id + slug from the file path);
 *   2. parses each analytics CSV;
 *   3. JOINS page rows to published articles by slug/id substring in the URL, classifying each:
 *        winner        — clicks >= --winner-clicks                       (proven demand → double-down)
 *        underperformer — impressions >= --min-impressions AND ctr < --low-ctr (seen, not clicked → revise title/intent)
 *        low-data      — impressions < --min-impressions (incl. not in the export → metrics null)
 *        neutral       — otherwise;
 *   4. mines query rows the site is NOT winning (impressions >= --opp-impressions AND (ctr < --low-ctr
 *      OR position > --weak-position)) and that no published article targets → new-topic opportunities;
 *   5. emits a *.feedback.json sidecar (schemas/topic-feedback.schema.json) with deterministic,
 *      evidence-backed suggestions — every one marked `status: "unvalidated"` (keyword-research decides).
 *
 * The thresholds are POLICY, not data — they only classify the real numbers, never invent them; they
 * are recorded in `thresholds` so the verdicts are reproducible.
 *
 * Exit 0 = sidecar written. Exit 1 = no analytics export found (loop refuses to guess). Exit 2 = bad usage.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, basename, relative } from "node:path";

// ---- args -------------------------------------------------------------------
const args = process.argv.slice(2);
const projectArg = args[0];
if (!projectArg || projectArg.startsWith("--")) {
  console.error("usage: node scripts/build-topic-feedback.mjs <project-slug-or-dir> [--out <file>] [--winner-clicks N] [--min-impressions N] [--low-ctr F] [--opp-impressions N] [--weak-position N] [--window TEXT]");
  process.exit(2);
}
function opt(name, dflt, parse = (x) => x) {
  const i = args.indexOf(name);
  return i > -1 && args[i + 1] != null ? parse(args[i + 1]) : dflt;
}
const WINNER_CLICKS = opt("--winner-clicks", 10, (x) => Math.max(0, parseInt(x, 10) || 0));
const MIN_IMPRESSIONS = opt("--min-impressions", 100, (x) => Math.max(0, parseInt(x, 10) || 0));
const LOW_CTR = opt("--low-ctr", 0.01, (x) => Math.max(0, parseFloat(x) || 0));
const OPP_IMPRESSIONS = opt("--opp-impressions", 50, (x) => Math.max(0, parseInt(x, 10) || 0));
const WEAK_POSITION = opt("--weak-position", 10, (x) => Math.max(1, parseFloat(x) || 0));
const WINDOW = opt("--window", null);
const MAX_OPPORTUNITIES = 10;

// ---- locate the project -----------------------------------------------------
const projectDir = existsSync(resolve(process.cwd(), projectArg))
  ? resolve(process.cwd(), projectArg)
  : resolve(process.cwd(), "projects", projectArg);
if (!existsSync(projectDir) || !statSync(projectDir).isDirectory()) {
  console.error(`project not found: ${projectDir}`);
  process.exit(2);
}
const slug = basename(projectDir);

// ---- gather analytics CSVs --------------------------------------------------
const analyticsDir = resolve(projectDir, "analytics");
const csvFiles = (existsSync(analyticsDir) ? readdirSync(analyticsDir) : [])
  .filter((f) => /\.csv$/i.test(f))
  .map((f) => resolve(analyticsDir, f))
  .sort();
if (!csvFiles.length) {
  console.error(`no analytics export found in ${relative(process.cwd(), analyticsDir)}/`);
  console.error("  This loop never fabricates traffic. Export a Pages and/or Queries CSV from");
  console.error("  Google Search Console (or GA4) into that folder, then re-run.");
  process.exit(1);
}

// ---- zero-dep CSV parser ----------------------------------------------------
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  text = text.replace(/^﻿/, ""); // strip BOM
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.length > 1 || row[0] !== "") rows.push(row); }
  return rows;
}
// numbers: "1,234" -> 1234 ; counts as int, position as float
function num(s) {
  if (s == null) return null;
  const t = String(s).replace(/[",\s]/g, "");
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}
// CTR: "5.2%" -> 0.052 ; "0.052" -> 0.052 ; a bare 5.2 (no %) is read as a percentage-point value
function ctr(s) {
  if (s == null) return null;
  const raw = String(s).trim();
  if (raw === "") return null;
  const hasPct = raw.includes("%");
  const v = num(raw.replace("%", ""));
  if (v == null) return null;
  if (hasPct) return v / 100;
  return v > 1 ? v / 100 : v; // tolerate exports that give CTR as a percent number without the sign
}

// ---- header sniffing --------------------------------------------------------
const find = (header, re) => header.findIndex((h) => re.test(h));
function classifyTable(header) {
  const pageCol = find(header, /\b(pages?|urls?|address|landing)\b/i);
  const queryCol = find(header, /\b(quer|keyword|search\s*term)/i);
  const cols = {
    clicks: find(header, /click/i),
    impressions: find(header, /impress/i),
    ctr: find(header, /ctr|click.?through/i),
    position: find(header, /position|avg.*pos|ranking/i),
  };
  if (queryCol > -1 && (pageCol === -1 || queryCol < pageCol)) return { kind: "queries", key: queryCol, cols };
  if (pageCol > -1) return { kind: "pages", key: pageCol, cols };
  return { kind: "unknown", cols };
}

// ---- read publish-log -> published articles ---------------------------------
const published = []; // { content_id, slug, url:null }
const logPath = resolve(projectDir, "publish-log.jsonl");
if (existsSync(logPath)) {
  const seen = new Set();
  for (const line of readFileSync(logPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t) continue;
    let rec;
    try { rec = JSON.parse(t); } catch { continue; }
    if (!rec.content_id || seen.has(rec.content_id)) continue;
    seen.add(rec.content_id);
    const fileSlug = rec.path ? basename(String(rec.path)).replace(/\.md$/i, "") : rec.content_id;
    published.push({ content_id: rec.content_id, slug: fileSlug, url: null, agg: null });
  }
}

// ---- ingest the CSVs --------------------------------------------------------
const pageRows = []; // { url, clicks, impressions, ctr, position }
const queryRows = []; // { query, ... }
const inputs = [];
let sawData = false;
for (const file of csvFiles) {
  inputs.push(relative(projectDir, file));
  const rows = parseCSV(readFileSync(file, "utf8"));
  if (rows.length < 2) continue;
  const header = rows[0].map((h) => h.trim());
  const t = classifyTable(header);
  if (t.kind === "unknown") continue;
  for (const r of rows.slice(1)) {
    const rec = {
      clicks: t.cols.clicks > -1 ? num(r[t.cols.clicks]) : null,
      impressions: t.cols.impressions > -1 ? num(r[t.cols.impressions]) : null,
      ctr: t.cols.ctr > -1 ? ctr(r[t.cols.ctr]) : null,
      position: t.cols.position > -1 ? num(r[t.cols.position]) : null,
    };
    if (rec.clicks != null) rec.clicks = Math.round(rec.clicks);
    if (rec.impressions != null) rec.impressions = Math.round(rec.impressions);
    if (t.kind === "pages") { rec.url = (r[t.key] || "").trim(); if (rec.url) { pageRows.push(rec); sawData = true; } }
    else { rec.query = (r[t.key] || "").trim(); if (rec.query) { queryRows.push(rec); sawData = true; } }
  }
}
if (!sawData) {
  console.error(`analytics CSV(s) found but no recognizable Pages/Queries columns: ${inputs.join(", ")}`);
  console.error("  Expected a page/URL or query column plus Clicks/Impressions/CTR/Position (GSC export shape).");
  process.exit(1);
}

// ---- join page rows to published articles -----------------------------------
function matchRowToArticle(url) {
  const u = url.toLowerCase();
  return published.find((p) => u.includes(p.slug.toLowerCase()) || u.includes(p.content_id.toLowerCase()));
}
for (const row of pageRows) {
  const art = matchRowToArticle(row.url);
  if (!art) continue;
  if (!art.agg) art.agg = { clicks: 0, impressions: 0, posWeighted: 0, url: row.url };
  art.agg.clicks += row.clicks || 0;
  art.agg.impressions += row.impressions || 0;
  if (row.position != null && row.impressions) art.agg.posWeighted += row.position * row.impressions;
  art.url = art.url || row.url;
}

function verdictFor(clicks, impressions, ctrVal) {
  if (clicks != null && clicks >= WINNER_CLICKS) return "winner";
  if (impressions != null && impressions < MIN_IMPRESSIONS) return "low-data";
  if (impressions != null && impressions >= MIN_IMPRESSIONS && ctrVal != null && ctrVal < LOW_CTR) return "underperformer";
  return "neutral";
}

const published_performance = published.map((p) => {
  if (!p.agg) {
    return { content_id: p.content_id, url: p.url, clicks: null, impressions: null, ctr: null, position: null, verdict: "low-data" };
  }
  const impressions = p.agg.impressions;
  const clicks = p.agg.clicks;
  const ctrVal = impressions > 0 ? clicks / impressions : null;
  const position = impressions > 0 ? Math.round((p.agg.posWeighted / impressions) * 10) / 10 : null;
  return { content_id: p.content_id, url: p.agg.url, clicks, impressions, ctr: ctrVal == null ? null : Math.round(ctrVal * 10000) / 10000, position, verdict: verdictFor(clicks, impressions, ctrVal) };
});

// ---- mine opportunity queries -----------------------------------------------
// a query we already own (a published winner ranks for it) is NOT an opportunity.
const ownedTerms = published_performance.filter((p) => p.verdict === "winner").map((p) => p.content_id.toLowerCase().replace(/-/g, " "));
function alreadyOwned(query) {
  const q = query.toLowerCase();
  return ownedTerms.some((t) => t && (q.includes(t) || t.includes(q)));
}
const opportunities = queryRows
  .filter((r) => r.impressions != null && r.impressions >= OPP_IMPRESSIONS)
  .filter((r) => (r.ctr != null && r.ctr < LOW_CTR) || (r.position != null && r.position > WEAK_POSITION))
  .filter((r) => !alreadyOwned(r.query))
  .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
  .slice(0, MAX_OPPORTUNITIES)
  .map((r) => ({
    query: r.query,
    impressions: r.impressions,
    clicks: r.clicks,
    ctr: r.ctr == null ? null : Math.round(r.ctr * 10000) / 10000,
    position: r.position,
    note: `${r.impressions} impressions but ${r.position != null && r.position > WEAK_POSITION ? `ranks ~#${Math.round(r.position)}` : `CTR ${((r.ctr || 0) * 100).toFixed(1)}%`} — site is seen for this but does not own it.`,
  }));

// ---- deterministic, evidence-backed suggestions -----------------------------
const suggestions = [];
for (const p of published_performance.filter((x) => x.verdict === "winner").sort((a, b) => (b.clicks || 0) - (a.clicks || 0))) {
  suggestions.push({ type: "double-down", target: p.content_id, rationale: `Proven: ${p.clicks} clicks (CTR ${((p.ctr || 0) * 100).toFixed(1)}%). Plan more in this cluster.`, evidence: { clicks: p.clicks, impressions: p.impressions, ctr: p.ctr }, status: "unvalidated" });
}
for (const p of published_performance.filter((x) => x.verdict === "underperformer").sort((a, b) => (b.impressions || 0) - (a.impressions || 0))) {
  suggestions.push({ type: "revise", target: p.content_id, rationale: `${p.impressions} impressions but CTR ${((p.ctr || 0) * 100).toFixed(1)}% (< ${(LOW_CTR * 100).toFixed(1)}%). Rewrite title/description to match intent.`, evidence: { impressions: p.impressions, ctr: p.ctr, position: p.position }, status: "unvalidated" });
}
for (const o of opportunities) {
  suggestions.push({ type: "new-topic", target: o.query, rationale: `${o.note} Candidate new article — validate with keyword-research first.`, evidence: { impressions: o.impressions, ctr: o.ctr, position: o.position }, status: "unvalidated" });
}

// ---- emit -------------------------------------------------------------------
const out = {
  project: slug,
  source: "gsc-export",
  data_quality: "measured",
  generated_at: new Date().toISOString(),
  window: WINDOW,
  inputs,
  thresholds: { winner_clicks: WINNER_CLICKS, min_impressions: MIN_IMPRESSIONS, low_ctr: LOW_CTR, opp_impressions: OPP_IMPRESSIONS, weak_position: WEAK_POSITION },
  published_performance,
  opportunities,
  suggestions,
  notes: "Evidence for content-strategy's next series plan. Every suggestion is a PROPOSAL — keyword-research must confirm real demand before drafting. Metrics are from the export; null = not seen, never 0.",
};

const outPath = opt("--out", resolve(projectDir, `${slug}.feedback.json`), (x) => resolve(process.cwd(), x));
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");

const w = published_performance.filter((p) => p.verdict === "winner").length;
const u = published_performance.filter((p) => p.verdict === "underperformer").length;
console.log(`✔ topic feedback → ${relative(process.cwd(), outPath)}`);
console.log(`  ${published_performance.length} published article(s): ${w} winner(s), ${u} to revise; ${opportunities.length} opportunity quer(ies); ${suggestions.length} suggestion(s).`);
console.log("  Suggestions are unvalidated candidates — run keyword-research before drafting.");
process.exit(0);
