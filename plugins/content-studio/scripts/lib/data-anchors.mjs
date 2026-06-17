/**
 * data-anchors — shared helpers for year-stamped reference datasets (TC-006). Zero dependencies.
 *
 * A `*.data.json` sidecar (schemas/data-anchors.schema.json) is the SINGLE source of truth for a
 * year-stamped dataset (e.g. a 一分一段 分数→位次 table). Content cites the anchors in prose via the
 * 「分数≈位次万」form; check-freshness.mjs uses these helpers to (a) resolve the "current data year"
 * deterministically, (b) extract those labeled citations, and (c) verify them against the dataset —
 * so a hand-typed 580≈7.0万 can't silently drift off the real 7.1万. Generators (e.g. the PDF
 * builder) read the dataset directly instead of hardcoding, so the artifact is a projection of it.
 *
 * Deliberately narrow: free prose that does NOT use the 数字≈数字万 shape is not checked, and the
 * dataset's correctness against the official source is a human/keyword-research honesty contract
 * (`source` + URL), not something this lib can verify.
 */
import { readFileSync, existsSync } from "node:fs";

/**
 * Resolve the "current data year" with NO wall-clock (so gates + tests are reproducible):
 *   explicit flag  >  DATA_YEAR env  >  config/data-freshness.json (current_data_year).
 * Throws if none resolves or a provided value is not an integer.
 */
export function loadCurrentDataYear({ flag, env, configPath } = {}) {
  const asInt = (v, label) => {
    const n = Number(v);
    if (!Number.isInteger(n)) throw new Error(`${label} must be an integer, got "${v}"`);
    return n;
  };
  if (flag != null && flag !== "") return asInt(flag, "--current-year");
  if (env != null && env !== "") return asInt(env, "DATA_YEAR");
  if (configPath && existsSync(configPath)) {
    const cfg = JSON.parse(readFileSync(configPath, "utf8"));
    if (Number.isInteger(cfg.current_data_year)) return cfg.current_data_year;
    throw new Error(`${configPath} is missing an integer current_data_year`);
  }
  throw new Error("no current data year (pass --current-year=N, set DATA_YEAR, or add config/data-freshness.json)");
}

// Tight shape => low false positives: a 3-digit score, optional 分, ≈/约, a number, then 万.
const PAIR_RE = /(\d{3})\s*分?\s*[≈约]\s*(\d+(?:\.\d+)?)\s*万/g;

/** Extract labeled 「分数(≈|约)位次万」pairs from prose → [{ score, rank_wan, raw }]. */
export function extractAnchorPairs(text) {
  const out = [];
  for (const m of String(text).matchAll(PAIR_RE)) {
    out.push({ score: Number(m[1]), rank_wan: Number(m[2]), raw: m[0] });
  }
  return out;
}

/**
 * Compare extracted prose pairs against a dataset's anchors, BY SCORE. Only scores the dataset
 * actually lists are checked (a cited number that isn't an anchor is left alone). Returns
 * mismatches: [{ score, expected, found, raw }].
 */
export function compareToDataset(pairs, dataset) {
  const byScore = new Map((dataset.anchors || []).map((a) => [a.score, a.rank_wan]));
  const out = [];
  for (const p of pairs) {
    if (!byScore.has(p.score)) continue;
    const expected = byScore.get(p.score);
    if (Math.abs(expected - p.rank_wan) > 0.001) out.push({ score: p.score, expected, found: p.rank_wan, raw: p.raw });
  }
  return out;
}
