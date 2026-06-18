#!/usr/bin/env node
/**
 * test-prose — fixture self-test for the prose-card gate + renderer. Zero dependencies.
 * Run with: node scripts/test-prose.mjs   (exit 0 = all cases behaved as expected)
 *
 * Locks the two things check-prose.mjs blocks on: a CJK-AWARE length band (a 汉字 and a Latin word
 * each count 1, so Chinese and English cards are judged on the same scale) and an OPT-IN 极限词/承诺词
 * scan (only when a `compliance` block is present — so fiction using 第一/最 isn't false-tripped). Also
 * asserts renderProse projects every field, so the .md can't drift from the JSON.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = resolve(HERE, "check-prose.mjs");
const RENDER = resolve(HERE, "render.mjs");
const tmp = mkdtempSync(join(tmpdir(), "prose-test-"));
let passed = 0, failed = 0;

const check = (name, ok, detail) => ok
  ? (passed++, console.log(`  ✔ ${name}`))
  : (failed++, console.error(`  ✖ ${name} — ${detail || ""}`));
function exitCode(p) {
  try { execFileSync("node", [GATE, p], { stdio: "pipe" }); return 0; }
  catch (e) { return typeof e.status === "number" ? e.status : 1; }
}
function write(name, obj) { const p = join(tmp, name); writeFileSync(p, JSON.stringify(obj, null, 2)); return p; }
const han = (n) => "字".repeat(n);                                   // n CJK chars = n units
const words = (n) => Array.from({ length: n }, (_, i) => "w" + i).join(" "); // n Latin words = n units

const base = { prose_id: "demo", language: "en", title: "A Short Card", body: words(120) };
const clone = (o) => JSON.parse(JSON.stringify(o));

console.log("prose gate:");
check("valid English card -> pass", exitCode(write("ok.prose.json", base)) === 0, "expected pass");

// CJK-aware band: a ~250-字 Chinese card is in-band; counting must be per-character, not per-byte/word
const zh = clone(base); zh.language = "zh"; zh.title = han(4); zh.body = han(250);
check("valid 250-字 CJK card -> pass", exitCode(write("zh.prose.json", zh)) === 0, "CJK chars must count as units");

const zhThin = clone(zh); zhThin.body = han(40); // 40 < 60
check("40-字 CJK body -> fail (under band, proves CJK counted)", exitCode(write("zhthin.prose.json", zhThin)) !== 0, "expected fail");

const short = clone(base); short.body = words(40); // 40 < 60
check("body under min -> fail", exitCode(write("short.prose.json", short)) !== 0, "expected fail");

const long = clone(base); long.body = words(900); // 900 > 800
check("body over max -> fail", exitCode(write("long.prose.json", long)) !== 0, "expected fail");

const bigTitle = clone(base); bigTitle.title = words(50); // 50 > 40
check("title over max -> fail", exitCode(write("title.prose.json", bigTitle)) !== 0, "expected fail");

const noTitle = clone(base); delete noTitle.title;
check("missing title -> fail (schema)", exitCode(write("notitle.prose.json", noTitle)) !== 0, "expected fail");

// opt-in compliance: a 极限词 only blocks when a compliance block is present
const banWith = clone(base); banWith.language = "zh"; banWith.body = han(120) + "第一名的秘诀"; banWith.compliance = {};
check("极限词 WITH compliance block -> fail", exitCode(write("banwith.prose.json", banWith)) !== 0, "expected fail");

const banWithout = clone(base); banWithout.language = "zh"; banWithout.body = han(120) + "他考了第一名"; // no compliance block
check("极限词 WITHOUT compliance block -> pass (opt-in)", exitCode(write("banwithout.prose.json", banWithout)) === 0, "fiction must not be false-tripped");

// industry promise words only fire when that industry is opted in
const eduOn = clone(base); eduOn.language = "zh"; eduOn.body = han(120) + "报我们稳上岸"; eduOn.compliance = { industries: ["education"] };
check("教育承诺词 with industries:[education] -> fail", exitCode(write("eduon.prose.json", eduOn)) !== 0, "expected fail");

const eduOff = clone(base); eduOff.language = "zh"; eduOff.body = han(120) + "报我们稳上岸"; eduOff.compliance = {}; // industries not opted in
check("教育承诺词 with compliance:{} (no industries) -> pass", exitCode(write("eduoff.prose.json", eduOff)) === 0, "industry word needs its industry opted in");

// length override widens the band
const over = clone(base); over.body = words(900); over.length = { max: 1000 };
check("length.max override admits a longer body -> pass", exitCode(write("over.prose.json", over)) === 0, "expected pass");

// renderProse projects every field (title / summary / body / tags) — locks the .md against drift
{
  const r = clone(base); r.summary = "one-line hook"; r.tags = ["alpha", "beta"]; r.body = "Para one.\n\nPara two.";
  // body is 4 words < min 60, but render doesn't gate — we only assert the projection here
  const md = execFileSync("node", [RENDER, write("render.prose.json", r)], { encoding: "utf8" });
  check("render: title heading", md.includes("# A Short Card"), md);
  check("render: summary blockquote", md.includes("> one-line hook"), md);
  check("render: body preserved", md.includes("Para one.") && md.includes("Para two."), md);
  check("render: tags line", md.includes("#alpha #beta"), md);
}

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
