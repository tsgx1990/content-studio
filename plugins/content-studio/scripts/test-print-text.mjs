#!/usr/bin/env node
/**
 * test-print-text — fixture self-test for the print/export text gate (TC-011). Zero dependencies.
 * Run with: node scripts/test-print-text.mjs   (exit 0 = all cases behaved as expected)
 *
 * Locks the two things check-print-text.mjs blocks on: tofu glyphs (the documented PDF failure —
 * emoji / ✔ / · render as □) WITHOUT punishing CJK glyphs that draw fine (・ ■ √), and 极限词/承诺词
 * with a compliance allow-list (so an artifact that NAMES a banned term to warn against it passes).
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GATE = resolve(dirname(fileURLToPath(import.meta.url)), "check-print-text.mjs");
const tmp = mkdtempSync(join(tmpdir(), "printtext-test-"));
let passed = 0, failed = 0;
const check = (name, ok, detail) => ok
  ? (passed++, console.log(`  ✔ ${name}`))
  : (failed++, console.error(`  ✖ ${name} — ${detail || ""}`));
function exitCode(name, content, extra = []) {
  const p = join(tmp, name); writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content));
  try { execFileSync("node", [GATE, p, ...extra], { stdio: "pipe" }); return 0; }
  catch (e) { return typeof e.status === "number" ? e.status : 1; }
}
const cp = (n) => String.fromCodePoint(n);
const TICK = cp(0x2714), MIDDOT = cp(0x00B7), EMOJI = cp(0x1F600);      // tofu offenders
const KATA = cp(0x30FB), SQUARE = cp(0x25A0), ROOT = cp(0x221A);        // render fine — must NOT trip

console.log("print-text gate:");
check("clean .md -> pass", exitCode("ok.md", "这是一份干净的清单。用 √ 和 ■ 和 ・ 都没问题。") === 0, "expected pass");

// glyph safety
check("emoji -> fail", exitCode("emoji.md", `照着做${EMOJI}`) !== 0, "expected fail");
check("✔ dingbat -> fail", exitCode("tick.md", `${TICK} 怎么避`) !== 0, "expected fail");
check("· middle dot (U+00B7) -> fail", exitCode("middot.md", `2026 版 ${MIDDOT} 指南`) !== 0, "expected fail");
check("・■√ render fine -> pass (no false-trip)", exitCode("good.md", `2026 ${KATA} 自查 ${SQUARE} ${ROOT} 通过`) === 0, "must not flag working glyphs");

// 极限词
check("极限词 (全网第一) -> fail", exitCode("ban.md", "全网第一的方案") !== 0, "expected fail");
check("极限词 named-to-warn, allowed via --allow -> pass", exitCode("warn.md", "别轻信『包过』类承诺", ["--allow=包过"]) === 0, "allow should clear it");
check("education 承诺词 with --industries=education -> fail", exitCode("edu.md", "报我们稳上岸", ["--industries=education"]) !== 0, "expected fail");
check("education 承诺词 without industries -> pass", exitCode("edu2.md", "报我们稳上岸") === 0, "industry word needs its industry opted in");

// JSON source: scans string leaves + reads compliance block
check("JSON string leaves scanned (emoji) -> fail", exitCode("e.json", { a: "标题", b: { c: `好${EMOJI}` } }) !== 0, "expected fail");
check("JSON compliance.allow clears a named term -> pass", exitCode("a.json", { body: "别信『保录取』承诺", compliance: { allow: ["保录取"] } }) === 0, "allow block should clear it");
check("JSON compliance.industries opts in -> fail", exitCode("i.json", { body: "稳上岸", compliance: { industries: ["education"] } }) !== 0, "expected fail");

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
