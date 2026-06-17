#!/usr/bin/env node
/**
 * test-ai-tells — fixture self-test for the AI-tell prose scanner. Zero dependencies.
 * Run with: node scripts/test-ai-tells.mjs
 * Exit 0 = all cases behaved as expected, exit 1 = a check regressed.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GATE = resolve(dirname(fileURLToPath(import.meta.url)), "check-ai-tells.mjs");
const tmp = mkdtempSync(join(tmpdir(), "aitells-test-"));
let passed = 0, failed = 0;

function exitCode(args) {
  try { execFileSync("node", [GATE, ...args], { stdio: "pipe" }); return 0; }
  catch (e) { return typeof e.status === "number" ? e.status : 1; }
}
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✖ ${name} — ${detail}`); }
}
function writeMd(name, body) { const p = join(tmp, name); writeFileSync(p, body); return p; }

console.log("AI-tell gate:");

// A clean ~120-word draft: plain prose, no clichés, almost no em-dashes.
const clean = `# Writing a scene that moves

Start with what the character wants in this exact moment. Write the want as a verb,
not a feeling. Then put something physical in the way. A locked door, a witness, a
clock. The scene works when the obstacle is real and the want is urgent.

Read the draft aloud. If a sentence makes you take a breath, it is too long. Cut it
into two. If you trip on a word, the reader will trip harder, so change it.

Keep going until the want is either met or lost. That is the end of the scene, and
the start of the next one. Save the polishing for tomorrow, when the words feel cold.`;
check("clean prose -> pass", exitCode([writeMd("clean.md", clean)]) === 0, "expected pass");

// Em-dash overuse on a short body should block.
const dashes = `# Title

The point — and this matters — is simple. You write — every day — no matter what.
The block — fear, mostly — fades once you start — really start — moving the pen.
Momentum — not talent — is the thing — the only thing — that finishes a book.`;
check("em-dash overuse -> block (exit 1)", exitCode([writeMd("dashes.md", dashes)]) !== 0, "expected fail");

// Block-tier clichés must fail even with no em-dashes.
const cliche = `# Title

In today's digital age, we delve into the rich tapestry of storytelling. This is a
testament to the power of words. Let us embark on a journey to unleash the power of
your imagination and explore the realm of fiction. ` + "word ".repeat(80);
check("block-tier clichés -> block (exit 1)", exitCode([writeMd("cliche.md", cliche)]) !== 0, "expected fail");

// Antithesis cliché twice should block.
const anti = `# Title

It's not a trick, it's a habit. Writing is not just a skill but also a discipline.
You don't need talent. You need to show up. ` + "word ".repeat(80);
check("antithesis cliché x2 -> block (exit 1)", exitCode([writeMd("anti.md", anti)]) !== 0, "expected fail");

// Warn-tier only is advisory: passes by default, fails under --strict.
const warnOnly = `# Title

It's worth noting that a robust outline helps. In conclusion, leverage a seamless
routine and you will foster better habits. ` + "word ".repeat(80);
check("warn-tier only -> pass by default", exitCode([writeMd("warn.md", warnOnly)]) === 0, "expected pass");
check("warn-tier only -> fail under --strict", exitCode([writeMd("warn2.md", warnOnly), "--strict"]) !== 0, "expected fail");

// Em-dashes inside fenced code / blockquotes (example prompts) must NOT count against voice.
const quoted = clean + `

> Give me 10 — yes, ten — deliberately bad openings — overdone ones — to react against.

\`\`\`
example — with — many — dashes — here
\`\`\`
`;
check("dashes in code/blockquote are ignored -> pass", exitCode([writeMd("quoted.md", quoted)]) === 0, "expected pass");

// Per-file override: allow a term that would otherwise warn.
const allowP = writeMd("allow.md", warnOnly);
writeFileSync(allowP.replace(/\.md$/, ".aitells.json"), JSON.stringify({
  warn_terms: [], // disable the default warn list for this file
}));
check("aitells.json override (empty warn_terms) -> pass --strict", exitCode([allowP, "--strict"]) === 0, "expected pass");

// --- Chinese (ZH) fixtures: density is per CJK char, with ZH tell-sets ---

// Clean ZH prose: plain, no 套话, no 破折号. Should pass.
const zhClean = `# 写好一个场景

先想清楚角色此刻最想要什么。把欲望写成一个动作，而不是一种心情。然后在他面前放一个真实的
障碍：一扇锁住的门，一个不肯走开的目击者，一个不断逼近的期限。当障碍足够硬、欲望足够急的
时候，这个场景才立得住。写完先大声读一遍，如果一句话让你喘不过气，那就把它切成两句。把打磨
的功夫留到第二天，等文字凉下来以后再回头看，往往能看见昨天看不见的毛病。`;
check("ZH clean prose -> pass", exitCode([writeMd("zh-clean.md", zhClean)]) === 0, "expected pass");

// ZH 套话 (block-tier phrases) must block.
const zhCliche = `# 标题

在当今数字化时代，写作能力对每个人都越来越重要。随着科技的不断发展，各类工具层出不穷。
值得一提的是，它们确实能帮我们省下不少时间。总而言之，我们应该主动拥抱这样的变化，不要
被时代落下，让我们一起把手里的工具用好。`;
check("ZH 套话 cliché -> block (exit 1)", exitCode([writeMd("zh-cliche.md", zhCliche)]) !== 0, "expected fail");

// ZH 破折号 overuse must block (density per CJK char).
const zhDash = `# 标题

写作这件事——说到底——就是每天都坐下来——不管状态好坏——把字写出来。卡壳——多半是因为
害怕——只要真的动笔——哪怕写得很烂——那种害怕就会慢慢散开，剩下的——只有惯性。`;
check("ZH em-dash overuse -> block (exit 1)", exitCode([writeMd("zh-dash.md", zhDash)]) !== 0, "expected fail");

// ZH antithesis (不是X而是Y) twice must block.
const zhAnti = `# 标题

写作不是一种天赋，而是一种习惯。真正的关键不是灵感，而是每天都坐下来的那股韧劲。你不需要
等到状态最好的那一刻，你只需要先开始，然后让笔自己往下走，把今天的字写完。`;
check("ZH antithesis ×2 -> block (exit 1)", exitCode([writeMd("zh-anti.md", zhAnti)]) !== 0, "expected fail");

// ZH warn-tier only: advisory (pass by default, fail under --strict).
const zhWarn = `# 标题

写作能力至关重要，它和我们的表达息息相关。把日常的观察一点点记下来，好的句子就会应运而生。
总的来说，只要坚持记录，素材自然会丰富多彩起来，写起来也就不再发愁了，慢慢就有了自己的节奏。`;
check("ZH warn-tier only -> pass by default", exitCode([writeMd("zh-warn.md", zhWarn)]) === 0, "expected pass");
check("ZH warn-tier only -> fail under --strict", exitCode([writeMd("zh-warn2.md", zhWarn), "--strict"]) !== 0, "expected fail");

// ZH report should self-identify the language.
let zhLangOk = false;
try {
  const out = execFileSync("node", [GATE, writeMd("zh-j.md", zhClean), "--json"], { encoding: "utf8" });
  const o = JSON.parse(out);
  zhLangOk = o.lang === "zh" && o.blocked === false;
} catch { zhLangOk = false; }
check("ZH --json reports lang=zh -> ok", zhLangOk, "expected lang=zh, blocked=false");

// --- Quote style (check #6): ZH uses 中文引号 “ ”, EN uses ASCII " (double quotes only) ---

// ZH prose with ASCII double quotes: advisory warn (pass by default, fail under --strict).
const zhAsciiQuote = `# 引号测试

很多家长一拿到分数就问"这个分能上哪所学校"，其实更该先看位次。位次比分数稳，
拿位次去对照往年录取数据，才知道一个学校对你是冲是稳还是保，心里有数再去排志愿。`;
check("ZH ASCII quotes -> pass by default", exitCode([writeMd("zh-q1.md", zhAsciiQuote)]) === 0, "expected pass");
check("ZH ASCII quotes -> fail under --strict", exitCode([writeMd("zh-q2.md", zhAsciiQuote), "--strict"]) !== 0, "expected fail");

// Same ZH prose with proper 中文引号 “ ”: clean, passes even under --strict.
const zhCurlyQuote = `# 引号测试

很多家长一拿到分数就问“这个分能上哪所学校”，其实更该先看位次。位次比分数稳，
拿位次去对照往年录取数据，才知道一个学校对你是冲是稳还是保，心里有数再去排志愿。`;
check("ZH 中文引号 -> pass --strict", exitCode([writeMd("zh-q3.md", zhCurlyQuote), "--strict"]) === 0, "expected pass");

// EN prose with curly double quotes: advisory warn (pass default, fail --strict).
const enCurlyQuote = `# Quotes

The editor said the scene needed a clearer want. “Make the door locked,” she told me,
and the note held up. ` + "word ".repeat(80);
check("EN curly quotes -> pass by default", exitCode([writeMd("en-q1.md", enCurlyQuote)]) === 0, "expected pass");
check("EN curly quotes -> fail under --strict", exitCode([writeMd("en-q2.md", enCurlyQuote), "--strict"]) !== 0, "expected fail");

// ASCII quotes inside inline code are functional, not voice: stripped, so no quote warning.
const zhCodeQuote = `# 代码示例

下面这段配置里的引号属于代码，不该算进正文：直接写 \`{"key": "value"}\` 就可以了。
位次比分数稳，拿位次对照往年录取数据，才知道一个组对你是冲是稳还是保，先有数再排志愿。`;
check("ZH ASCII quotes inside inline code -> pass --strict", exitCode([writeMd("zh-q4.md", zhCodeQuote), "--strict"]) === 0, "expected pass");

// A <!-- data --> freshness declaration (functional JSON, ASCII quotes) is stripped like <!-- meta -->,
// so it must NOT raise the ZH quote warning even under --strict.
const zhDataDecl = `<!-- data: {"data_year":2025,"dataset":"../x.data.json"} -->
# 位次怎么用

位次比分数稳，拿位次对照往年录取数据，才知道一个组对你是冲是稳还是保，先有数再排志愿。
物理类 600 分对应大约四万多名，先按位次分三段，再排满志愿，别留空。`;
check("ZH <!-- data --> declaration stripped -> pass --strict", exitCode([writeMd("zh-q5.md", zhDataDecl), "--strict"]) === 0, "expected pass");

// --- Compliance scan (opt-in --compliance) — ZH-scoped, reuses lib/compliance-cn ---

// ZH marketing prose containing a 极限词 (最好). Opt-in: silent by default, blocks with --compliance.
const zhExtreme = `# 关于我们的课程

我们这套志愿规划课程口碑一直不错，在同类里算是口碑最好的选择之一。很多家长用完都说省心，
孩子也更清楚自己该往哪个方向走。我们只讲真实可落地的方法，帮你把时间花在刀刃上，少走弯路，
所有结论都提醒以官方公布为准。`;
check("ZH 极限词 without --compliance -> pass (opt-in)", exitCode([writeMd("zh-ext.md", zhExtreme)]) === 0, "expected pass");
check("ZH 极限词 with --compliance -> block (exit 1)", exitCode([writeMd("zh-ext2.md", zhExtreme), "--compliance"]) !== 0, "expected fail");

// EN prose with "100%" must NOT trip the ZH-scoped compliance scan.
const enPct = `# Our method

Our approach is practical and simple. 100% of the writers who actually tried it finished a draft,
because the steps are small and concrete. ` + "word ".repeat(80);
check("EN 100% with --compliance -> pass (ZH-scoped)", exitCode([writeMd("en-pct.md", enPct), "--compliance"]) === 0, "expected pass");

// Industry promise-word (保录取) is education-tier: needs the industry named to trigger.
const zhPromise = `# 服务说明

报名我们的志愿服务，老师会一对一带你梳理整张志愿表，把有风险的地方提前标出来。坦白讲，保录取
这种话我们不会说，一切以考试院和招生章程为准，我们能做的是帮你把方案排得更稳、把滑档风险降到更低。`;
check("ZH 保录取 with --compliance (no industry) -> pass", exitCode([writeMd("zh-pro.md", zhPromise), "--compliance"]) === 0, "expected pass");
check("ZH 保录取 with --compliance=education -> block", exitCode([writeMd("zh-pro2.md", zhPromise), "--compliance=education"]) !== 0, "expected fail");

// Sidecar `compliance_industries` enables the industry scan without the flag.
const zhPro3 = writeMd("zh-pro3.md", zhPromise);
writeFileSync(zhPro3.replace(/\.md$/, ".aitells.json"), JSON.stringify({ compliance_industries: ["education"] }));
check("sidecar compliance_industries=education -> block", exitCode([zhPro3]) !== 0, "expected fail");

// allow-list whitelists a legitimate name (国家级一流专业) that would otherwise be a 极限词 hit.
const zhAllow = `# 师资介绍

我们的部分合作专业是国家级一流本科专业，老师长期专注本地升学规划，经验比较扎实，
帮助过不少家庭做出更合适的选择，方法务实，结果同样以官方公布为准，不夸大、不承诺。`;
check("国家级 with --compliance -> block", exitCode([writeMd("zh-al.md", zhAllow), "--compliance"]) !== 0, "expected fail");
const zhAllowP = writeMd("zh-al2.md", zhAllow);
writeFileSync(zhAllowP.replace(/\.md$/, ".aitells.json"), JSON.stringify({ allow: ["国家级"] }));
check("国家级 with --compliance + allow -> pass", exitCode([zhAllowP, "--compliance"]) === 0, "expected pass");

// --json reports compliance flag state.
let compJsonOk = false;
try {
  const out = execFileSync("node", [GATE, writeMd("zh-cj.md", zhClean), "--compliance", "--json"], { encoding: "utf8" });
  const o = JSON.parse(out);
  compJsonOk = o.compliance === true && o.blocked === false;
} catch { compJsonOk = false; }
check("--compliance --json reports compliance=true -> ok", compJsonOk, "expected compliance=true, blocked=false");

// --json emits machine-readable output and still sets the exit code.
let jsonOk = false;
try {
  const out = execFileSync("node", [GATE, writeMd("j.md", clean), "--json"], { encoding: "utf8" });
  const o = JSON.parse(out);
  jsonOk = o.file === "j.md" && o.blocked === false && typeof o.em_per_1k === "number";
} catch { jsonOk = false; }
check("--json emits valid report -> ok", jsonOk, "expected parseable JSON with blocked=false");

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
