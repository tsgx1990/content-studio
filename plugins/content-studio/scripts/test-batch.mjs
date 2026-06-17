#!/usr/bin/env node
/**
 * test-batch — fixture self-test for the batch readiness reporter (TC-005). Zero dependencies.
 * Run with: node scripts/test-batch.mjs   (exit 0 = all cases as expected, 1 = a regression)
 *
 * Proves the orchestration the batch tool adds: discover files, run the RIGHT checks per type,
 * classify pass/warn/fail, and roll the exit code up (hard fail => 1, advisory => 0). The whole
 * suite fails without check-batch.mjs (the script wouldn't exist) — the fail/exit cases are the core.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GATE = resolve(dirname(fileURLToPath(import.meta.url)), "check-batch.mjs");
const tmp = mkdtempSync(join(tmpdir(), "batch-test-"));
let passed = 0, failed = 0;

function run(paths) {
  try {
    const out = execFileSync("node", [GATE, ...paths, "--json"], { stdio: "pipe" }).toString();
    return { code: 0, json: JSON.parse(out) };
  } catch (e) {
    const code = typeof e.status === "number" ? e.status : 1;
    let j = null; try { j = JSON.parse((e.stdout || "").toString()); } catch { /* usage error */ }
    return { code, json: j };
  }
}
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✖ ${name} — ${detail}`); }
}
const w = (name, body) => { const p = join(tmp, name); writeFileSync(p, body); return p; };
const statusOf = (j, endsWith) => (j.results.find((r) => r.file.endsWith(endsWith)) || {}).status;

console.log("batch gate:");

// clean prose .md (no review sibling) -> only the advisory AI-tell scan -> ready
const clean = w("clean.md", `# 一个干净的标题

先想清楚这一步到底要做什么，把目标写成动词。再放一个具体的障碍进去：一扇锁着的门，一个旁观者，一个时钟。
障碍真实、目标紧迫，这一段就立住了。读出声来，磕巴的地方就是要改的地方。`);
// .md whose prose overuses 破折号 -> AI-tell flags (advisory) -> warn, but NOT a hard fail
const dashes = w("dashes.md", `# 标题

重点——这很关键——其实很简单。你要每天写——无论如何——都别停。卡壳——多半是怕——一动笔就散了。
势头——不是天赋——才是写完一本书的东西——唯一的东西——记住这一点。`);
// a valid *.data.json -> schema passes -> ready
const goodData = w("good.data.json", JSON.stringify({
  dataset_id: "t", data_year: 2025, source: { name: "t" },
  anchors: [{ score: 600, rank: 45887, rank_wan: 4.6 }],
}));
// a malformed *.data.json (missing required anchors) -> schema fails -> hard fail
const badData = w("bad.data.json", JSON.stringify({ dataset_id: "t", data_year: 2025, source: { name: "t" } }));
// a schema-valid note whose title is > 20 chars -> note gate fails (proves the GATE_BY_SUFFIX path)
const longTitle = w("bad.note.json", JSON.stringify({
  note_id: "t",
  title: "这是一个故意写得超过二十个字符上限的小红书标题用来触发门禁",
  body: "这是一段用于测试的小红书正文，需要凑够一百个字以上才能通过长度检查。".repeat(4),
  tags: ["测试", "示例话题"],
}));

// 1. clean .md -> ready
{ const r = run([clean]); check("clean .md -> ready, exit 0", r.code === 0 && statusOf(r.json, "clean.md") === "pass", JSON.stringify(r)); }
// 2. AI-tell trip -> warn, NOT a hard fail (exit stays 0)
{ const r = run([dashes]); check("ai-tell .md -> warn, exit 0", r.code === 0 && statusOf(r.json, "dashes.md") === "warn", JSON.stringify(r)); }
// 3. valid data.json -> ready
{ const r = run([goodData]); check("valid *.data.json -> ready", r.code === 0 && statusOf(r.json, "good.data.json") === "pass", JSON.stringify(r)); }
// 4. malformed data.json -> schema fail, exit 1
{ const r = run([badData]); check("malformed *.data.json -> fail, exit 1", r.code === 1 && statusOf(r.json, "bad.data.json") === "fail", JSON.stringify(r)); }
// 5. schema-valid note, gate fails -> fail, exit 1 (GATE_BY_SUFFIX path)
{
  const r = run([longTitle]);
  const fileR = r.json && r.json.results.find((x) => x.file.endsWith("bad.note.json"));
  const schemaOk = fileR && fileR.checks.find((c) => c.name === "schema")?.status === "pass";
  const gateFail = fileR && fileR.checks.find((c) => c.name === "note")?.status === "fail";
  check("note: schema pass + gate fail -> fail, exit 1", r.code === 1 && schemaOk && gateFail, JSON.stringify(r));
}
// 6. advisory-only batch (clean + dashes) -> exit 0 with a warn in the rollup
{
  const r = run([clean, dashes]);
  check("advisory-only batch -> exit 0, summary has the warn", r.code === 0 && r.json.summary.warn === 1 && r.json.summary.fail === 0, JSON.stringify(r));
}
// 7. directory scan that includes a hard fail -> exit 1
{ const r = run([tmp]); check("dir scan with a fail -> exit 1", r.code === 1 && r.json.summary.fail >= 1, JSON.stringify(r)); }

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${failed ? `✖ ${failed} failed` : `✔ ${passed} passed`}`);
process.exit(failed ? 1 : 0);
