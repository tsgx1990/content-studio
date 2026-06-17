#!/usr/bin/env node
/**
 * test-compliance — fixture self-test for the shared 中文 compliance scanner
 * (scripts/lib/compliance-cn.mjs) and its opt-in wiring into the script + drama gates.
 * Run with: node scripts/test-compliance.mjs   (exit 0 = all behaved as expected)
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { findComplianceIssues, INDUSTRY_TERMS } from "./lib/compliance-cn.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT_GATE = resolve(HERE, "check-script.mjs");
const DRAMA_GATE = resolve(HERE, "check-short-drama.mjs");
const tmp = mkdtempSync(join(tmpdir(), "compliance-test-"));
let passed = 0, failed = 0;

function exitCode(gate, file) {
  try { execFileSync("node", [gate, file], { stdio: "pipe" }); return 0; }
  catch (e) { return typeof e.status === "number" ? e.status : 1; }
}
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✖ ${name} — ${detail}`); }
}
function write(name, obj) { const p = join(tmp, name); writeFileSync(p, JSON.stringify(obj, null, 2)); return p; }
const han = (n) => "字".repeat(n);

console.log("compliance lib (unit):");
check("教育 industry catches 保录取", findComplianceIssues("我们保录取上岸", { industries: ["education"] }).some((f) => f.kind === "extreme"), "expected an extreme finding");
check("教育 industry off by default (no 保录取 catch)", !findComplianceIssues("我们保录取上岸").some((f) => f.kind === "extreme"), "should not catch without industries");
check("极限词 最好 caught by default", findComplianceIssues("这是最好的选择").some((f) => f.kind === "extreme"), "expected extreme");
check("最近/最后 not caught", !findComplianceIssues("最近最后都没事").some((f) => f.kind === "extreme"), "false positive");
check("微信 导流 caught", findComplianceIssues("加微信详聊").some((f) => f.kind === "diversion"), "expected diversion");
check("手机号 caught", findComplianceIssues("电话13812345678").some((f) => f.kind === "phone"), "expected phone");
check("私信/评论区 not caught", findComplianceIssues("私信我，评论区见").length === 0, "false positive");
check("INDUSTRY_TERMS has the 3 verticals", ["education", "medical", "finance"].every((k) => Array.isArray(INDUSTRY_TERMS[k])), "missing a vertical");
// 升学/招生 承诺词补漏 (these promise words slipped a generic 极限词 list, caught only by manual grep)
check("教育 catches 不滑档", findComplianceIssues("帮你排到稳稳不滑档", { industries: ["education"] }).some((f) => f.kind === "extreme"), "expected extreme (不滑档)");
check("教育 catches 稳上 (incl. 稳上本科)", findComplianceIssues("这个分稳上本科", { industries: ["education"] }).some((f) => f.kind === "extreme"), "expected extreme (稳上)");
check("教育 catches 必上本科", findComplianceIssues("照这个填必上本科", { industries: ["education"] }).some((f) => f.kind === "extreme"), "expected extreme (必上本科)");
// negative — the legit phrasings that live RIGHT NEXT to the banned ones must NOT trip (locks out an over-broad future addition)
check("不被退档/稳进/务必上 NOT caught", findComplianceIssues("服从调剂换的是不被退档，稳进的公办放中间，出分后务必上官网核对", { industries: ["education"] }).length === 0, "false positive on a legit mechanism explanation");

// ---- script gate opt-in wiring ----
const baseScript = (extra) => ({
  script_id: "demo", language: "zh", target_seconds: 50,
  sections: [
    { role: "hook", narration: han(20) },
    { role: "segment", narration: han(140) },
    { role: "cta", narration: han(40) },
  ],
  ...extra,
});
console.log("script gate (opt-in compliance):");
// a clean script passes regardless
check("clean script -> pass", exitCode(SCRIPT_GATE, write("clean.script.json", baseScript({ compliance: { industries: ["education"] } }))) === 0, "expected pass");
// 保录取 in narration WITHOUT compliance block -> pass (not scanned)
const dirty = baseScript({});
dirty.sections[1].narration = han(135) + "保录取";
check("保录取 without compliance block -> pass", exitCode(SCRIPT_GATE, write("nocomp.script.json", dirty)) === 0, "expected pass (not opted in)");
// 保录取 WITH compliance block -> fail
const dirty2 = baseScript({ compliance: { industries: ["education"] } });
dirty2.sections[1].narration = han(135) + "保录取";
check("保录取 with education compliance -> fail", exitCode(SCRIPT_GATE, write("comp.script.json", dirty2)) !== 0, "expected fail");
// 不滑档 through the gate end-to-end (would PASS before this lexicon fix)
const dirty3 = baseScript({ compliance: { industries: ["education"] } });
dirty3.sections[1].narration = han(135) + "不滑档";
check("不滑档 with education compliance -> fail", exitCode(SCRIPT_GATE, write("comp3.script.json", dirty3)) !== 0, "expected fail (education promise red-line word)");

// ---- drama gate opt-in wiring ----
const baseDrama = (extra) => ({
  drama_id: "demo", title: "测试", language: "zh", genre: "都市", keyword: "测试",
  synopsis: han(120), target_seconds_per_episode: 60, spoken_cpm: 240, tolerance: 0.5,
  paywall_episode: 2, min_synopsis_chars: 100,
  episodes: [
    { number: 1, title: "一", beats: [{ role: "hook", summary: "开场", lines: han(200) }], cliffhanger: han(12) },
    { number: 2, title: "二", beats: [{ role: "setup", summary: "推进", lines: han(200) }], cliffhanger: han(12) },
    { number: 3, title: "三", beats: [{ role: "payoff", summary: "收束", lines: han(200) }], cliffhanger: han(12) },
  ],
  ...extra,
});
console.log("drama gate (opt-in compliance):");
const dDirty = baseDrama({});
dDirty.episodes[0].beats[0].lines = han(200) + "保收益稳赚";
check("金融违禁词 without compliance -> pass", exitCode(DRAMA_GATE, write("nocomp.drama.json", dDirty)) === 0, "expected pass (not opted in)");
const dDirty2 = baseDrama({ compliance: { industries: ["finance"] } });
dDirty2.episodes[0].beats[0].lines = han(200) + "保收益稳赚";
check("金融违禁词 with finance compliance -> fail", exitCode(DRAMA_GATE, write("comp.drama.json", dDirty2)) !== 0, "expected fail");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
