#!/usr/bin/env node
/**
 * Deterministic "AI-tell" scanner for prose. Zero dependencies.
 *   node scripts/check-ai-tells.mjs <path-to-content.md> [--strict] [--json] [--compliance[=industries]]
 *
 * --compliance (opt-in): also run the shared 中文 marketing-compliance scan (lib/compliance-cn.mjs)
 * over the ZH prose, as a BLOCK-tier check. It catches 极限词 (《广告法》绝对化用语: 最好/最佳/100%/
 * 国家级…) and, with `--compliance=education,medical,finance`, that industry's promise-words
 * (保录取 / 根治 / 保收益 …). It is opt-in because narrative/general prose legitimately uses these
 * words (「最好的朋友」), and ZH-scoped because the term lists are Chinese-law-specific. 导流/手机号
 * are deliberately NOT scanned here — they are platform-dependent (a 公众号 article may carry a
 * 客服微信) and remain the structured JSON gates' job (check-xhsnote). Findings honor the same
 * `allow` list, so a genuine name like 「国家级一流专业」can be whitelisted per file. The sidecar
 * `compliance_industries: [...]` enables it without the flag.
 *
 * "Is this good writing?" is content-review's job. THIS script catches the reproducible
 * surface tells that make a draft read as machine-written — the things an editor spots at a
 * glance — so they get fixed BEFORE review, not shipped. It is intentionally low-false-positive:
 * it scans the AUTHOR'S prose only (front matter, the <!-- meta --> / <!-- data --> blocks, fenced
 * code, and `>` example-prompt blockquotes are stripped first, since those are functional, not voice).
 *
 * BILINGUAL: it auto-detects Chinese vs English content (CJK density) and applies the matching
 * tell-set. Chinese AI prose has its own glaring tells the English lists miss — 套话 like
 * 「在当今数字化时代」「总而言之」「值得一提的是」, AI-favoured 成语 (息息相关 / 应运而生 …),
 * the 不是X而是Y / 不仅…而且 antithesis, and 破折号「——」overuse. ZH density is measured per
 * 1000 CJK chars (Chinese has no word spaces), EN per 1000 words.
 *
 * It checks:
 *   1. em-dash density — AI overuses "—" / 破折号「——」. Per 1000 words (EN) or CJK chars (ZH).
 *   2. block-tier clichés — phrases that almost never appear in good human prose
 *      (delve, tapestry, "in today's digital age" … ; 在当今数字化时代, 总而言之, 值得一提的是 …).
 *   3. warn-tier crutch words — overused but sometimes legitimate (seamless, robust … ;
 *      至关重要, 息息相关, 应运而生 …).
 *   4. antithesis cliché — "it's not X, it's Y" / "not just X but Y" ; 不是X而是Y / 不仅…而且.
 *   5. heading uniformity — every H2/H3 cut from the same "Noun: verb phrase" mould.
 *   6. quote style — ZH prose should use 中文引号「“ ”」, EN prose ASCII straight quotes ["].
 *      DOUBLE quotes only (single quotes/apostrophes are skipped to avoid false positives).
 *      Advisory (warn) tier; surfaces in content-review as a should_fix.
 *
 * Exit 0 = clean (warnings allowed); 1 = a BLOCK-tier tell (or, with --strict, any tell);
 * 2 = bad usage. The block tier is safe to gate on; the warn tier is advisory by default.
 * Every threshold + wordlist is overridable via a sibling `<basename>.aitells.json`
 * ({ "em_dash_warn_per_1k": n, "em_dash_block_per_1k": n, "block_terms": [...],
 *    "warn_terms": [...], "allow": [...] }).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, basename, dirname, join } from "node:path";
import { findComplianceIssues } from "./lib/compliance-cn.mjs";

const DEFAULTS = {
  em_dash_warn_per_1k: 5,
  em_dash_block_per_1k: 10,
  zh_em_dash_warn_per_1k: 6,   // per 1000 CJK chars (Chinese 破折号「——」is more legit than EN em-dash)
  zh_em_dash_block_per_1k: 12,
  heading_colon_ratio: 0.7, // ≥70% of headings carrying a colon => uniformity warn
};

// Block tier — strong tells with essentially no legitimate use in this kind of prose.
const BLOCK_TERMS = [
  "delve", "delving", "tapestry", "a myriad of", "the realm of", "in the realm of",
  "testament to", "a testament to", "embark on a journey", "embark on your",
  "unleash the power", "unlock the power", "harness the power", "game-changer",
  "in today's digital age", "in today's fast-paced", "in today's world",
  "in the ever-evolving", "ever-evolving landscape", "ever-changing landscape",
  "look no further", "rest assured", "needless to say", "navigating the complexities",
  "when it comes to navigating", "the world of", "in the world of",
];

// Warn tier — overused crutches; sometimes fine, but density signals AI drafting.
const WARN_TERMS = [
  "dive in", "let's dive", "deep dive", "elevate your", "boost your", "supercharge",
  "seamless", "seamlessly", "robust", "leverage", "moreover", "furthermore",
  "it's important to note", "it's worth noting", "in conclusion", "in summary",
  "at the end of the day", "that being said", "foster", "whether you're",
  "when it comes to", "first and foremost", "crucial", "vital", "pivotal",
];

// Chinese block tier — 套话 that almost never appears in good human prose.
const ZH_BLOCK_TERMS = [
  "在当今数字化时代", "在当今时代", "在这个数字化时代", "在当今社会",
  "随着科技的不断发展", "随着时代的发展", "随着社会的发展",
  "总而言之", "综上所述", "值得一提的是", "值得注意的是",
  "众所周知", "不可否认", "毋庸置疑", "让我们一起",
  "在这个快节奏的时代", "保驾护航", "起着至关重要的作用",
  "扮演着重要的角色", "扮演着至关重要的角色",
];

// Chinese warn tier — AI-favoured connectives / 成语; sometimes fine, density signals AI.
const ZH_WARN_TERMS = [
  "至关重要", "息息相关", "应运而生", "层出不穷", "琳琅满目",
  "丰富多彩", "不言而喻", "显而易见", "总的来说", "在一定程度上",
  "首当其冲", "归根结底",
];

// Antithesis cliché — the parallel-construction AI reaches for constantly (EN + ZH).
const ANTITHESIS = [
  /\bit'?s not (?:just )?[^.?!,;]{2,40},\s*it'?s\b/gi,
  /\bnot just\b[^.?!;]{2,45}\bbut (?:also )?\b/gi,
  /\bisn'?t (?:just )?(?:about )?[^.?!,;]{2,40},\s*it'?s\b/gi,
  /不是[^。！？\n]{1,30}而是/g,                       // 不是X，而是Y (comma is normal here)
  /不仅[^。！？\n]{1,30}(?:而且|还|更是|更|也)/g,       // 不仅X，而且Y
];

function parseArgs(argv) {
  const out = { file: null, strict: false, json: false, compliance: null };
  for (const a of argv) {
    if (a === "--strict") out.strict = true;
    else if (a === "--json") out.json = true;
    else if (a === "--compliance") out.compliance = [];
    else if (a.startsWith("--compliance=")) {
      out.compliance = a.slice("--compliance=".length).split(",").map((s) => s.trim()).filter(Boolean);
    } else if (!out.file) out.file = a;
  }
  return out;
}

const { file, strict, json, compliance } = parseArgs(process.argv.slice(2));
if (!file) {
  console.error("usage: node scripts/check-ai-tells.mjs <content.md> [--strict] [--json] [--compliance[=industries]]");
  process.exit(2);
}
const path = resolve(process.cwd(), file);
if (!existsSync(path)) {
  console.error(`content file not found: ${path}`);
  process.exit(2);
}

let raw = readFileSync(path, "utf8");

// Default term lists carry BOTH languages; an EN phrase never matches ZH prose and vice
// versa, so the only thing that must switch by language is the density denominator + em-dash
// threshold (handled below). A sidecar `block_terms`/`warn_terms` replaces the default entirely.
const ALL_BLOCK_TERMS = [...BLOCK_TERMS, ...ZH_BLOCK_TERMS];
const ALL_WARN_TERMS = [...WARN_TERMS, ...ZH_WARN_TERMS];

// Per-file overrides (optional sidecar).
let cfg = { ...DEFAULTS, block_terms: ALL_BLOCK_TERMS, warn_terms: ALL_WARN_TERMS, allow: [] };
const sidecar = join(dirname(path), basename(path).replace(/\.md$/, "") + ".aitells.json");
if (existsSync(sidecar)) {
  try {
    const o = JSON.parse(readFileSync(sidecar, "utf8"));
    cfg = {
      ...cfg, ...o,
      block_terms: o.block_terms || ALL_BLOCK_TERMS,
      warn_terms: o.warn_terms || ALL_WARN_TERMS,
      allow: o.allow || [],
    };
  } catch (e) {
    console.error(`✖ ${basename(sidecar)} is not valid JSON: ${e.message}`);
    process.exit(2);
  }
}

// --- strip non-voice regions: front matter, meta block, fenced code, blockquotes ---
let prose = raw
  .replace(/^---\n[\s\S]*?\n---\n/, "")          // YAML front matter (if any)
  .replace(/<!--\s*(?:meta|data)[\s\S]*?-->/gi, "") // the <!-- meta --> / <!-- data --> blocks
  .replace(/```[\s\S]*?```/g, "")                // fenced code
  .replace(/^>.*$/gm, "");                        // blockquoted example prompts

// Headings are part of voice for the uniformity check, captured before we flatten.
const headings = (prose.match(/^#{2,3}\s+.*$/gm) || []).map((h) => h.replace(/^#{2,3}\s+/, "").trim());
// Drop heading markers from the prose body scan.
const body = prose.replace(/^#{1,6}\s+/gm, "");

const words = (body.match(/\b[\w']+\b/g) || []).length || 1;
// Language detection: predominantly-Chinese prose measures density per 1000 CJK chars
// (Chinese has no word spaces, so a word count would be meaningless), EN per 1000 words.
const cjkChars = (body.match(/[\u4e00-\u9fff]/g) || []).length;
const isZh = cjkChars >= 50 && cjkChars > words;
const units = isZh ? cjkChars : words;
const unitLabel = isZh ? "1k chars" : "1k words";
const per1k = (n) => +((n / units) * 1000).toFixed(1);

const block = [];
const warn = [];
const allow = new Set(cfg.allow.map((s) => String(s).toLowerCase()));

// 1. em-dash density — EN "—"/"–"; ZH 破折号「——」counts as one unit -----------------
const emDashes = (body.match(/—{1,2}|–/g) || []).length;
const emRate = per1k(emDashes);
const emWarnT = isZh ? cfg.zh_em_dash_warn_per_1k : cfg.em_dash_warn_per_1k;
const emBlockT = isZh ? cfg.zh_em_dash_block_per_1k : cfg.em_dash_block_per_1k;
if (emRate >= emBlockT) {
  block.push(`em-dash density ${emRate}/${unitLabel} (${emDashes} in ${units}) ≥ block ${emBlockT} — a top AI tell; rewrite most as periods, commas, or parens.`);
} else if (emRate >= emWarnT) {
  warn.push(`em-dash density ${emRate}/${unitLabel} (${emDashes} in ${units}) ≥ warn ${emWarnT} — thin them out.`);
}

const lowBody = body.toLowerCase();
const countTerm = (term) => {
  const t = String(term).toLowerCase();
  if (allow.has(t)) return 0;
  // word-ish boundary so "foster" doesn't match "fostered"-only contexts unexpectedly; use includes
  // but guard short tokens with boundaries.
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(/^[a-z']+$/.test(t) ? `\\b${esc}\\b` : esc, "g");
  return (lowBody.match(re) || []).length;
};

// 2. block-tier clichés ------------------------------------------------------------
for (const term of cfg.block_terms) {
  const n = countTerm(term);
  if (n > 0) block.push(`cliché "${term}" ×${n} — a hallmark AI phrase; cut it.`);
}

// 3. warn-tier crutch words --------------------------------------------------------
for (const term of cfg.warn_terms) {
  const n = countTerm(term);
  if (n > 0) warn.push(`crutch word "${term}" ×${n} — overused by AI; prefer a plainer wording.`);
}

// 4. antithesis cliché -------------------------------------------------------------
let antiHits = 0;
for (const re of ANTITHESIS) {
  const m = body.match(re);
  if (m) antiHits += m.length;
}
if (antiHits >= 2) {
  block.push(`antithesis cliché ("it's not X, it's Y" / "not just … but") ×${antiHits} — the parallel AI overuses; vary the sentence shapes.`);
} else if (antiHits === 1) {
  warn.push(`antithesis cliché ("it's not X, it's Y" / "not just … but") ×1 — fine once, watch the pattern.`);
}

// 5. heading uniformity ------------------------------------------------------------
if (headings.length >= 3) {
  const withColon = headings.filter((h) => h.includes(":") || h.includes("：")).length;
  const ratio = withColon / headings.length;
  if (ratio >= cfg.heading_colon_ratio) {
    warn.push(`${withColon}/${headings.length} headings use the same "Noun: phrase" colon mould (${Math.round(ratio * 100)}%) — vary the heading shapes.`);
  }
}

// 6. quote style — ZH prose uses 中文引号「“ ”」; EN prose uses ASCII straight quotes. We check
// DOUBLE quotes only (single quotes are skipped — apostrophes like don't / 5'9" would false-
// positive). Inline code and URLs are stripped first: their ASCII quotes are functional, not voice.
const quoteText = body.replace(/`[^`]*`/g, "").replace(/https?:\/\/\S+/g, "");
if (isZh) {
  const n = (quoteText.match(/"/g) || []).length;
  if (n > 0) warn.push(`中文正文出现 ${n} 处英文双引号 (") — 中文应使用中文引号 “ ”（成对替换）。`);
} else {
  const n = (quoteText.match(/[“”]/g) || []).length;
  if (n > 0) warn.push(`English prose uses ${n} curly double-quote(s) (“ ”) — use straight ASCII quotes (").`);
}

// 7. compliance (opt-in) — 极限词 + opt-in industry promise-words, ZH prose only --------
// Enabled by --compliance[=industries] or a sidecar `compliance_industries`. 极限词 (《广告法》
// 绝对化用语) is BLOCK-tier; 导流/手机号 are intentionally NOT scanned here (platform-dependent).
const sidecarIndustries = Array.isArray(cfg.compliance_industries) ? cfg.compliance_industries : [];
const complianceEnabled = compliance !== null || sidecarIndustries.length > 0;
const industries = [...new Set([...(compliance || []), ...sidecarIndustries])];
if (complianceEnabled && isZh) {
  const issues = findComplianceIssues(body, { diversion: [], industries, scanPhone: false });
  const counted = new Set();
  for (const it of issues) {
    const termLow = String(it.term).toLowerCase();
    if (allow.has(termLow) || counted.has(it.term)) continue;
    counted.add(it.term);
    const n = body.split(it.term).length - 1;
    block.push(`极限词/合规 "${it.term}" ×${n} — 《广告法》绝对化用语或行业承诺词；改写该表述（确属正规名称如「国家级一流专业」可在 .aitells.json 的 allow 中豁免）。`);
  }
}

const result = {
  file: basename(path), lang: isZh ? "zh" : "en", words, cjk_chars: cjkChars, units,
  em_dashes: emDashes, em_per_1k: emRate, compliance: complianceEnabled,
  block, warn, blocked: block.length > 0, strict,
};

if (json) {
  console.log(JSON.stringify(result, null, 2));
}

const fail = block.length > 0 || (strict && warn.length > 0);

if (!json) {
  if (block.length) {
    console.error("✖ AI-tell gate: BLOCK-tier tells found:");
    for (const r of block) console.error("  ✖ " + r);
  }
  if (warn.length) {
    if (!block.length) console.error((strict ? "✖" : "⚠") + " AI-tell gate: warnings:");
    for (const r of warn) console.error("  ⚠ " + r);
  }
  if (!fail) {
    console.log(
      `✔ AI-tell gate passed: ${basename(path)} [${isZh ? "zh" : "en"}] ` +
      `(${units} ${isZh ? "chars" : "words"}, ${emDashes} em-dashes = ${emRate}/${unitLabel}, ${warn.length} warning(s))`
    );
  }
}

process.exit(fail ? 1 : 0);
