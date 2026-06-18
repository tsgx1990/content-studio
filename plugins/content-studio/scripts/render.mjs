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
 *   .game.json    → stateful choice game  (anchored scenes + choice links w/ needs/take/learn; win/lose)
 *   .audio.json   → audio producer script (cast w/ bios + ordered narration/dialogue/sfx/music cues)
 *
 * NOT rendered (their committed .md carries prose that is NOT in the JSON — author by hand):
 *   .spec.json             — the children's-story prose is not in the JSON (spec = constraints only)
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

const GAME_OUTCOME = { win: "**You win.**", lose: "**You lose.**", neutral: "**The end.**" };

function renderGame(g) {
  const scenes = Array.isArray(g.scenes) ? g.scenes : [];
  const flags = Array.isArray(g.flags) ? g.flags : [];
  const items = Array.isArray(g.items) ? g.items : [];
  const flagLabel = new Map(flags.map((f) => [f.id, f.label || f.id]));
  const itemLabel = new Map(items.map((i) => [i.id, i.label || i.id]));
  const titleOf = (s) => s.title || s.id;
  const isTerminal = (s) => !!s.outcome || s.ending === true || !(Array.isArray(s.choices) && s.choices.length);
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const startTitle = titleOf(scenes.find((s) => s.id === g.start) || { id: g.start });

  // a choice's display annotation, derived from its requirements (needs) + effects (learn/take), in
  // that order — the same human shorthand the hand-authored page used, now sourced from flag/item labels.
  const annotate = (c) => {
    const a = [];
    for (const r of (c.requires_flags || [])) a.push(`needs ${flagLabel.get(r.id) || r.id}`);
    for (const it of (c.requires_items || [])) a.push(`needs ${itemLabel.get(it) || it}`);
    for (const f of (c.set_flags || [])) a.push(`learn ${flagLabel.get(f.id) || f.id}`);
    for (const it of (c.add_items || [])) a.push(`take ${itemLabel.get(it) || it}`);
    return a.length ? ` *(${a.join(" — ")})*` : "";
  };

  const stateDesc = [flags.length && plural(flags.length, "flag"), items.length && plural(items.length, "item")].filter(Boolean).join(", ") || "no state";
  const goalPart = g.goal ? ` **Goal:** ${g.goal}.` : "";
  const blocks = [
    `# ${g.title}`,
    `*A choose-your-path **game** · rendered from \`${g.game_id}.game.json\`. State (${stateDesc}) and ` +
      `winnability are enforced by the game-story gate: every choice and item resolves, the exit is ` +
      `reachable, and there is no way to get permanently stuck.${goalPart}*`,
  ];
  if (flags.length || items.length) {
    blocks.push(
      `> **How to play:** start at *${startTitle}*, follow the link under each choice. Some choices only ` +
      `work once you carry the right thing — those are marked *(needs …)*. Items and clues you pick up ` +
      `are marked *(take …)* / *(learn …)*.`
    );
  }
  for (const s of scenes) {
    const head = `## ${titleOf(s)} {#${s.id}}`;
    if (isTerminal(s)) {
      blocks.push(`${head}\n\n${s.text}\n\n${GAME_OUTCOME[s.outcome] || "**The end.**"}`);
    } else {
      const choices = s.choices.map((c) => `- [${c.label}](#${c.target})${annotate(c)}`).join("\n");
      blocks.push(`${head}\n\n${s.text}\n\n${choices}`);
    }
  }
  return blocks.join("\n\n") + "\n";
}

function renderAudio(a) {
  const voices = Array.isArray(a.voices) ? a.voices : [];
  const sounds = Array.isArray(a.sounds) ? a.sounds : [];
  const cues = Array.isArray(a.cues) ? a.cues : [];
  const voiceName = new Map(voices.map((v) => [v.id, v.name || v.id]));
  const soundDesc = new Map(sounds.map((s) => [s.id, s.description || s.id]));
  const t = a.target_seconds || 0;
  const mmss = `${Math.floor(t / 60)}m ${t % 60}s`;

  const blocks = [
    `# ${a.title}`,
    `*An audio story · rendered from \`${a.audio_id}.audio.json\`. Every speaking part resolves to a ` +
      `declared voice and every sound to a declared cue; the opening orients the listener, the runtime ` +
      `sits within tolerance of the ${t}-second target, and every TTS-hostile token carries a ` +
      `\`say_as\` pronunciation — all enforced by the audio-story gate. **Target runtime:** ~${mmss}.*`,
    `> **Production notes:** narration is spoken by the Narrator voice; **Name:** lines are spoken by ` +
      `that character; \`> [SFX]\` / \`> [MUSIC]\` are sound cues, not spoken. Pronunciation overrides ` +
      `are noted in *(say-as: …)* — feed them to the TTS engine as SSML \`<say-as>\` (or speak the alias).`,
    `## Cast`,
    voices.map((v) => `- **${voiceName.get(v.id)}**${v.bio ? ` — ${v.bio}` : ""}`).join("\n"),
    `## Script`,
  ];
  for (const c of cues) {
    if (c.type === "narration") {
      blocks.push(c.text || "");
    } else if (c.type === "dialogue") {
      const dir = c.direction ? ` *(${c.direction})*` : "";
      let block = `**${voiceName.get(c.voice) || c.voice}:**${dir} ${c.text || ""}`;
      if (Array.isArray(c.say_as) && c.say_as.length) {
        const sa = c.say_as.map((s) => `"${s.text}" → ${s.as}${s.alias ? `, "${s.alias}"` : ""}`).join("; ");
        block += `\n*(say-as: ${sa})*`;
      }
      blocks.push(block);
    } else if (c.type === "sfx" || c.type === "music") {
      const dur = typeof c.seconds === "number" ? ` — ${c.seconds}s` : "";
      blocks.push(`> [${c.type === "sfx" ? "SFX" : "MUSIC"}: ${soundDesc.get(c.sound) || c.sound}${dur}]`);
    }
  }
  return blocks.join("\n\n") + "\n";
}

const RENDERERS = [
  [/\.note\.json$/i, renderNote],
  [/\.prose\.json$/i, renderProse],
  [/\.if\.json$/i, renderIF],
  [/\.game\.json$/i, renderGame],
  [/\.audio\.json$/i, renderAudio],
  [/\.script\.json$/i, renderScript],
  [/\.lesson\.json$/i, renderLesson],
  [/\.drama\.json$/i, renderDrama],
];

const match = RENDERERS.find(([re]) => re.test(srcPath));
if (!match) {
  console.error(`✖ no renderer for ${basename(srcPath)} — supported: .note/.prose/.if/.game/.audio/.script/.lesson/.drama.json (see header for why other types are author-by-hand)`);
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
