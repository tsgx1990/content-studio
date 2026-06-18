#!/usr/bin/env node
/**
 * render — deterministic JSON-source → rendered Markdown. Zero dependencies.
 *   node scripts/render.mjs <source.json> [--write]
 *
 * The rendered `.md` for the structured content types is a *projection* of the JSON source of
 * truth — title, body, sections, etc. Hand-assembling it each time lets the .md silently drift
 * from the JSON (older demos did: punctuation, paragraph breaks and wording diverged). This makes
 * the projection canonical and reproducible, so the JSON stays the single source of truth.
 *
 * Type is detected from the filename suffix. Supported (the .md is a faithful projection of the JSON):
 *   .note.json    → xiaohongshu note      (title / body / tags)
 *   .script.json  → youtube teleprompter  (language-aware; runtime estimate via lib/cjk-pacing)
 *   .lesson.json  → graded-reader page    (objective / story paragraphs / glossary table)
 *   .drama.json   → 微短剧 script preview  (synopsis / episodes / role-tagged beats / cliffhangers)
 *   .prose.json   → prose card            (title / optional summary / body / tags)
 *   .if.json      → interactive fiction   (anchored scene sections + in-page choice links; node.title)
 *
 * NOT rendered (their committed .md carries prose that is NOT in the JSON — author by hand):
 *   .game.json             — scene *titles* are not in the JSON
 *   .spec.json             — the children's-story prose is not in the JSON (spec = constraints only)
 *   .audio.json            — the Cast bios differ from the per-voice tts_voice field
 *
 * Default: print the .md to stdout. `--write`: write the sibling .md (basename + ".md").
 * Exit 0 = rendered. Exit 2 = bad usage / unsupported type.
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { countWords, secondsForText } from "./lib/cjk-pacing.mjs";

const args = process.argv.slice(2);
const write = args.includes("--write");
const arg = args.find((a) => !a.startsWith("--"));
if (!arg) {
  console.error("usage: node scripts/render.mjs <source.json> [--write]");
  process.exit(2);
}
const srcPath = resolve(process.cwd(), arg);
if (!existsSync(srcPath)) {
  console.error(`source file not found: ${srcPath}`);
  process.exit(2);
}

let data;
try {
  data = JSON.parse(readFileSync(srcPath, "utf8"));
} catch (e) {
  console.error(`✖ ${basename(srcPath)} is not valid JSON: ${e.message}`);
  process.exit(2);
}

// ---- renderers --------------------------------------------------------------

function renderNote(n) {
  const tags = Array.isArray(n.tags) ? n.tags.map((t) => "#" + t).join(" ") : "";
  return `# ${n.title}\n\n${n.body}\n\n${tags}\n`;
}

function renderProse(p) {
  let out = `# ${p.title}\n\n`;
  if (p.summary) out += `> ${p.summary}\n\n`;
  out += `${p.body}\n`;
  const tags = Array.isArray(p.tags) && p.tags.length ? p.tags.map((t) => "#" + t).join(" ") : "";
  if (tags) out += `\n${tags}\n`;
  return out;
}

function renderScript(s) {
  const zh = s.language === "zh";
  const sections = Array.isArray(s.sections) ? s.sections : [];
  const words = sections.reduce((n, sec) => n + countWords(sec.narration || ""), 0);
  const est = sections.reduce((n, sec) => n + secondsForText(sec.narration || ""), 0).toFixed(0);
  const target = s.target_seconds;

  const subtitle = zh
    ? `> 关键词：${s.keyword} ｜ 目标 ${target}s ｜ 估算 ${est}s ｜ 约 ${words} 字`
    : `> Keyword: ${s.keyword} · target ${target}s · est. ${est}s · ~${words} words`;

  let out = `# ${s.title}\n\n${subtitle}\n\n`;
  for (const sec of sections) {
    out += `## ${sec.title}  (${sec.role})\n\n${sec.narration}\n\n`;
    if (sec.visual) out += zh ? `> [画面：${sec.visual}]\n\n` : `> [VISUAL: ${sec.visual}]\n\n`;
  }
  return out;
}

function renderLesson(l) {
  const lvl = l.cefr_level;
  const subtitle =
    `*Graded reader · CEFR **${lvl}** · rendered from \`${l.lesson_id}.lesson.json\`. Controlled ` +
    `vocabulary enforced by the graded-reader gate (per-level sentence cap, ${lvl} word band, target ` +
    `words repeated, beyond-core budget).*`;
  const rows = (Array.isArray(l.target_vocabulary) ? l.target_vocabulary : [])
    .map((t) => `| **${t.word}** | ${t.gloss} | ${t.example} |`).join("\n");
  return (
    `# ${l.title}\n\n${subtitle}\n\n> **Objective:** ${l.learning_objective}\n\n` +
    `## Story\n\n${l.story}\n\n` +
    `## Glossary — new words\n\n| Word | Meaning | Example |\n|------|---------|---------|\n${rows}\n`
  );
}

// 微短剧 beat roles (the short-drama gate enum) → the Chinese labels used in the script preview.
const DRAMA_ROLE_CN = { hook: "钩子", setup: "铺垫", escalation: "升级", twist: "反转", payoff: "爽点" };
const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

function renderDrama(d, srcPath) {
  let topicRef = "";
  const researchPath = srcPath.replace(/\.drama\.json$/i, ".research.json");
  if (existsSync(researchPath)) {
    try {
      const dec = JSON.parse(readFileSync(researchPath, "utf8")).decision;
      if (dec) topicRef = `（选题依据：\`${d.drama_id}.research.json\`，decision: ${dec}）`;
    } catch { /* no usable research sibling — omit the clause */ }
  }
  const subtitle =
    `*微短剧剧本预览 · 由 \`${d.drama_id}.drama.json\` 渲染 · 题材：${d.genre}${topicRef}。` +
    `竖屏，单集目标 ~${d.target_seconds_per_episode} 秒，付费卡点在第 ${d.paywall_episode} 集。*`;
  const blocks = [`# ${d.title}`, subtitle, `> **内容概要**：${d.synopsis}`, "---"];
  for (const ep of (Array.isArray(d.episodes) ? d.episodes : [])) {
    const mark = ep.number === d.paywall_episode ? "  〔💰 付费卡点〕" : "";
    const parts = [`## 第 ${ep.number} 集 · ${ep.title}${mark}`];
    (Array.isArray(ep.beats) ? ep.beats : []).forEach((b, i) => {
      const num = CIRCLED[i] || `${i + 1}.`;
      parts.push(`**${num}〔${DRAMA_ROLE_CN[b.role] || b.role}〕** ${b.summary}\n\n> ${b.lines}`);
    });
    parts.push(`**🪝 钩子：** ${ep.cliffhanger}`);
    blocks.push(parts.join("\n\n"), "---");
  }
  blocks.pop(); // drop the trailing separator after the last episode
  return blocks.join("\n\n") + "\n";
}

// A node is terminal if flagged, or (per the schema) if it offers no choices.
const ifIsEnding = (n) => n.ending === true || !(Array.isArray(n.choices) && n.choices.length);

function renderIF(s) {
  const nodes = Array.isArray(s.nodes) ? s.nodes : [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const titleOf = (n) => n.title || n.id;
  const endings = nodes.filter(ifIsEnding).length;
  const startNode = byId.get(s.start);
  const startTitle = startNode ? titleOf(startNode) : s.start;

  const blocks = [
    `# ${s.title}`,
    `*A choose-your-path story. Follow the links; some paths end sooner than others. There are ${endings} endings.*`,
    `Begin at [${startTitle}](#${s.start}).`,
  ];
  for (const n of nodes) {
    const head = `## ${titleOf(n)} {#${n.id}}`;
    if (ifIsEnding(n)) {
      // strip a trailing "An ending." the author may have baked into the prose — we render the marker.
      const text = String(n.text).replace(/\s*An ending\.?\s*$/i, "");
      blocks.push(`${head}\n\n${text}\n\n**An ending.** · [↻ Start again](#${s.start})`);
    } else {
      const choices = n.choices.map((c) => `- [${c.label}](#${c.target})`).join("\n");
      blocks.push(`${head}\n\n${n.text}\n\n${choices}`);
    }
  }
  return blocks.join("\n\n") + "\n";
}

const RENDERERS = [
  [/\.note\.json$/i, renderNote],
  [/\.prose\.json$/i, renderProse],
  [/\.if\.json$/i, renderIF],
  [/\.script\.json$/i, renderScript],
  [/\.lesson\.json$/i, renderLesson],
  [/\.drama\.json$/i, renderDrama],
];

const match = RENDERERS.find(([re]) => re.test(srcPath));
if (!match) {
  console.error(`✖ no renderer for ${basename(srcPath)} — supported: .note/.prose/.if/.script/.lesson/.drama.json (see header for why other types are author-by-hand)`);
  process.exit(2);
}

const md = match[1](data, srcPath);

if (write) {
  const outPath = srcPath.replace(/\.[a-z]+\.json$/i, ".md");
  writeFileSync(outPath, md);
  console.log(`✔ wrote ${basename(outPath)} (${Buffer.byteLength(md, "utf8")} bytes)`);
} else {
  process.stdout.write(md);
}
