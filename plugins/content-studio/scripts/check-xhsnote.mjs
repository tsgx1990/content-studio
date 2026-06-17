#!/usr/bin/env node
/**
 * Deterministic note gate for Xiaohongshu (小红书) posts. Zero dependencies.
 *   node scripts/check-xhsnote.mjs <path-to-note.note.json>
 *
 * "Will this note go viral?" is content-review's job (hook / cover / topic). THIS script enforces
 * the reproducible XHS platform rules — a note that violates them gets truncated or 限流 regardless
 * of quality (rules grounded in docs/research/2026-06-06-xiaohongshu-note-rules.md):
 *
 *   1. the .note.json conforms to schemas/xhs-post.schema.json
 *   2. title length within [title_min, title_max] (default 5..20 — XHS truncates past 20)
 *   3. body length within [body_min, body_max] (default 100..1000 — 原创下限 / 硬上限)
 *   4. tag count within [1, max_tags] (default 1..10; XHS hard cap 30 — don't 堆砌)
 *   5. no banned 极限词 (absolute-claim words) in title or body — they trigger 限流
 *   6. no 导流 (off-platform contact info: 微信/QQ/二维码/公众号/手机号 …) — the #1 限流/封号 cause
 *
 * Char counting uses code points (Array.from) to approximate XHS's character count (汉字 = 1).
 * All limits + the blocklist are overridable per note. Exit 0 = OK. 1 = blocked. 2 = bad usage.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { validate } from "./lib/json-schema-mini.mjs";
import { EXTREME_TERMS, DIVERSION_TERMS, findComplianceIssues } from "./lib/compliance-cn.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULTS = { title_min: 5, title_max: 20, body_min: 100, body_max: 1000, max_tags: 10 };
// 极限词 / 导流 blocklists now live in scripts/lib/compliance-cn.mjs (shared across ZH verticals).
const DEFAULT_BANNED = EXTREME_TERMS;
const DEFAULT_DIVERSION = DIVERSION_TERMS;

const arg = process.argv[2];
if (!arg) {
  console.error("usage: node scripts/check-xhsnote.mjs <note.note.json>");
  process.exit(2);
}
const notePath = resolve(process.cwd(), arg);
if (!existsSync(notePath)) {
  console.error(`note file not found: ${notePath}`);
  process.exit(2);
}

const reasons = [];
let note;
try {
  note = JSON.parse(readFileSync(notePath, "utf8"));
} catch (e) {
  console.error(`✖ ${basename(notePath)} is not valid JSON: ${e.message}`);
  process.exit(1);
}

// 1. schema ------------------------------------------------------------------
try {
  const schema = JSON.parse(readFileSync(resolve(REPO_ROOT, "schemas/xhs-post.schema.json"), "utf8"));
  for (const err of validate(note, schema, "note")) reasons.push(`schema: ${err}`);
} catch (e) {
  reasons.push(`could not load xhs-post schema: ${e.message}`);
}

const L = { ...DEFAULTS, ...(note.limits || {}) };
const charLen = (s) => Array.from(String(s == null ? "" : s).trim()).length;

// 2. title length ------------------------------------------------------------
if (typeof note.title === "string") {
  const n = charLen(note.title);
  if (n > L.title_max) reasons.push(`title is ${n} chars > max ${L.title_max} (XHS truncates the overflow)`);
  if (n < L.title_min) reasons.push(`title is ${n} chars < min ${L.title_min} (too thin to rank/grab)`);
}

// 3. body length -------------------------------------------------------------
if (typeof note.body === "string") {
  const n = charLen(note.body);
  if (n < L.body_min) reasons.push(`body is ${n} chars < min ${L.body_min} (below XHS 原创 floor)`);
  if (n > L.body_max) reasons.push(`body is ${n} chars > max ${L.body_max} (XHS hard cap)`);
}

// 4. tag count ---------------------------------------------------------------
if (Array.isArray(note.tags)) {
  if (note.tags.length < 1) reasons.push("no topic tags — add at least one #话题 for discovery");
  if (note.tags.length > L.max_tags) {
    reasons.push(`${note.tags.length} tags > max ${L.max_tags} — 堆砌话题 risks 限流 (raise limits.max_tags only if you mean it; XHS hard cap is 30)`);
  }
}

// 5 & 6. 极限词 + 导流 + 手机号 (shared scanner) -------------------------------
const banned = Array.isArray(note.banned_terms) ? note.banned_terms : DEFAULT_BANNED;
const diversion = Array.isArray(note.diversion_terms) ? note.diversion_terms : DEFAULT_DIVERSION;
// optional high-risk-industry promise words (教育/医疗/金融) — opt in via note.compliance.industries
const industries = note.compliance && Array.isArray(note.compliance.industries) ? note.compliance.industries : [];
const haystack = `${note.title || ""}\n${note.body || ""}`;
for (const f of findComplianceIssues(haystack, { extremes: banned, diversion, industries })) {
  if (f.kind === "extreme") {
    reasons.push(`极限词 "${f.term}" appears in title/body — absolute claims trigger 限流 (广告法). Remove or soften it.`);
  } else if (f.kind === "diversion") {
    reasons.push(`导流词 "${f.term}" appears in title/body — off-platform contact info triggers 限流/封号 (站外导流治理). Remove it or route via XHS 私信/官方工具.`);
  } else {
    reasons.push(`a phone number "${f.term}" appears in title/body — contact info triggers 限流/封号. Remove it.`);
  }
}

if (reasons.length) {
  console.error("✖ XHS note gate FAILED:");
  for (const r of reasons) console.error("  - " + r);
  process.exit(1);
}
console.log(
  `✔ XHS note gate passed: ${basename(notePath)} ` +
  `(title ${charLen(note.title)} chars, body ${charLen(note.body)} chars, ${note.tags.length} tags)`
);
process.exit(0);
