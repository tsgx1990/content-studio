#!/usr/bin/env node
/**
 * test-xhsnote — fixture self-test for the Xiaohongshu note gate. Zero dependencies.
 * Run with: node scripts/test-xhsnote.mjs
 * Exit 0 = all cases behaved as expected, exit 1 = a check regressed.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GATE = resolve(dirname(fileURLToPath(import.meta.url)), "check-xhsnote.mjs");
const tmp = mkdtempSync(join(tmpdir(), "xhs-test-"));
let passed = 0, failed = 0;

function exitCode(args) {
  try { execFileSync("node", [GATE, ...args], { stdio: "pipe" }); return 0; }
  catch (e) { return typeof e.status === "number" ? e.status : 1; }
}
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✖ ${name} — ${detail}`); }
}
function writeNote(name, obj) { const p = join(tmp, name); writeFileSync(p, JSON.stringify(obj, null, 2)); return p; }
const han = (n) => "字".repeat(n); // n Chinese chars

const validNote = {
  note_id: "demo", language: "zh", platform: "xiaohongshu",
  title: "新手必看的写作小技巧✍️",
  body: han(220) + " 真实体验分享～",
  tags: ["写作", "干货", "新手"],
};
const clone = (o) => JSON.parse(JSON.stringify(o));

console.log("XHS note gate:");
check("valid note -> pass", exitCode([writeNote("ok.note.json", validNote)]) === 0, "expected pass");

const longTitle = clone(validNote); longTitle.title = han(25); // 25 > 20
check("title over 20 chars -> fail", exitCode([writeNote("title.note.json", longTitle)]) !== 0, "expected fail");

const shortBody = clone(validNote); shortBody.body = han(40); // < 100
check("body under 100 chars -> fail", exitCode([writeNote("short.note.json", shortBody)]) !== 0, "expected fail");

const longBody = clone(validNote); longBody.body = han(1200); // > 1000
check("body over 1000 chars -> fail", exitCode([writeNote("long.note.json", longBody)]) !== 0, "expected fail");

const noTags = clone(validNote); noTags.tags = [];
check("no tags -> fail (schema minItems)", exitCode([writeNote("notags.note.json", noTags)]) !== 0, "expected fail");

const tooManyTags = clone(validNote); tooManyTags.tags = Array.from({ length: 12 }, (_, i) => "标签" + i);
check("too many tags (>10) -> fail", exitCode([writeNote("manytags.note.json", tooManyTags)]) !== 0, "expected fail");

const jiduci = clone(validNote); jiduci.body = han(200) + " 全网第一，效果100%！";
check("极限词 in body -> fail", exitCode([writeNote("ban.note.json", jiduci)]) !== 0, "expected fail");

// "最" inside 最近 must NOT false-match the banned multi-char terms
const zuijin = clone(validNote); zuijin.body = han(200) + " 最近最后我才搞懂～";
check("'最近/最后' does not trip 极限词 -> pass", exitCode([writeNote("zuijin.note.json", zuijin)]) === 0, "expected pass");

const badSchema = clone(validNote); delete badSchema.title;
check("schema violation (missing title) -> fail", exitCode([writeNote("schema.note.json", badSchema)]) !== 0, "expected fail");

// 导流 (off-platform contact info) — the #1 限流/封号 trigger
const weixin = clone(validNote); weixin.body = han(200) + " 加我微信领资料～";
check("微信 导流 in body -> fail", exitCode([writeNote("vx.note.json", weixin)]) !== 0, "expected fail");

const qrcode = clone(validNote); qrcode.body = han(200) + " 扫二维码进群";
check("二维码 导流 in body -> fail", exitCode([writeNote("qr.note.json", qrcode)]) !== 0, "expected fail");

const phone = clone(validNote); phone.body = han(200) + " 电话13812345678联系";
check("phone number 导流 in body -> fail", exitCode([writeNote("phone.note.json", phone)]) !== 0, "expected fail");

const vxLatin = clone(validNote); vxLatin.body = han(200) + " 详情看主页vx哦";
check("latin 'vx' 导流 in body -> fail", exitCode([writeNote("vxlatin.note.json", vxLatin)]) !== 0, "expected fail");

// soft phrasing that is NOT in the default list must not false-trip (precision over recall)
const softOk = clone(validNote); softOk.body = han(200) + " 欢迎评论区交流，有问题私信我～";
check("'私信/评论区' alone does not trip 导流 -> pass", exitCode([writeNote("soft.note.json", softOk)]) === 0, "expected pass");

// override: a note legitimately about WeChat marketing can disable the scan explicitly
const allow = clone(validNote); allow.diversion_terms = []; allow.body = han(200) + " 聊聊微信运营心得";
check("diversion_terms=[] override -> pass", exitCode([writeNote("allow.note.json", allow)]) === 0, "expected pass");

// override: allow up to 30 tags
const wide = clone(validNote); wide.limits = { max_tags: 30 }; wide.tags = Array.from({ length: 12 }, (_, i) => "t" + i);
check("limits.max_tags override -> pass", exitCode([writeNote("wide.note.json", wide)]) === 0, "expected pass");

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
