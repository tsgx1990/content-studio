#!/usr/bin/env node
/**
 * build-chapter-context — relevance-weighted context pack for writing ONE chapter. Zero deps.
 *   node scripts/build-chapter-context.mjs <state.json> <chapterNumber> [--last N] [--dormant-after N] [--json]
 *
 * Why this exists (the 60k-tractability lever): `chapter-generation` says "inject only the RELEVANT
 * facts, do NOT dump the whole bible" — but until now that relevance call was the agent's to make by
 * hand. At chapter 80 of a 60k-word book, dumping all characters + every prior summary blows the
 * context and drowns the model in irrelevant facts. This script makes the selection deterministic:
 * given a PLANNED chapter (its cast + pov in the ledger), it emits ONLY
 *
 *   - the premise (global anchor) + the containing arc's goal/summary (arc-level anchor)
 *   - full character cards for THIS chapter's cast (appearance anchors, status, goals, relationships)
 *   - one-line stubs for off-stage characters the cast is related to (so links aren't lost)
 *   - world rules in play (hard constraints, global by default; a rule may OPT IN to arc-scoping via
 *     an `arcs: [arcId,...]` field so a long book can localize rules per arc — untagged = always in)
 *   - OPEN foreshadowing already planted (setup_chapter <= N), plus any thread planned to pay off here;
 *     threads open & untouched for >= --dormant-after chapters (default 6) are FLAGGED (not dropped),
 *     using `last_advanced_chapter` if set else setup_chapter — so planted-and-forgotten threads surface
 *   - the summaries of the last N chapters (local continuity; default 3)
 *
 * and reports what it LEFT OUT, so you can see the pack stays bounded as the book grows.
 *
 * Output: Markdown by default (paste straight into the drafting prompt), or `--json` for tooling.
 * Exit 0 = pack emitted. Exit 1 = chapter not in ledger. Exit 2 = bad usage.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const statePath = args[0];
const chapterArg = args[1];
const asJson = args.includes("--json");
const lastIdx = args.indexOf("--last");
const lastN = lastIdx > -1 && args[lastIdx + 1] ? Math.max(0, parseInt(args[lastIdx + 1], 10) || 0) : 3;
const dormantIdx = args.indexOf("--dormant-after");
const dormantAfter = dormantIdx > -1 && args[dormantIdx + 1] ? Math.max(1, parseInt(args[dormantIdx + 1], 10) || 0) : 6;

if (!statePath || chapterArg == null || chapterArg.startsWith("--")) {
  console.error("usage: node scripts/build-chapter-context.mjs <state.json> <chapterNumber> [--last N] [--json]");
  process.exit(2);
}
const chapterNumber = parseInt(chapterArg, 10);
if (!Number.isFinite(chapterNumber)) {
  console.error(`chapterNumber must be a number, got "${chapterArg}"`);
  process.exit(2);
}
const resolved = resolve(process.cwd(), statePath);
if (!existsSync(resolved)) { console.error(`state file not found: ${resolved}`); process.exit(2); }

let state;
try { state = JSON.parse(readFileSync(resolved, "utf8")); }
catch (e) { console.error(`state.json is not valid JSON: ${e.message}`); process.exit(2); }

const characters = Array.isArray(state.characters) ? state.characters : [];
const chapters = Array.isArray(state.chapters) ? state.chapters : [];
const arcs = Array.isArray(state.arcs) ? state.arcs : [];
const byId = new Map(characters.map((c) => [c.id, c]));

const thisChapter = chapters.find((c) => c && c.number === chapterNumber);
if (!thisChapter) {
  console.error(`chapter ${chapterNumber} is not in the ledger — add a planned stub (number + cast + pov) first.`);
  process.exit(1);
}

// --- relevance selection ----------------------------------------------------
const castIds = [...new Set([thisChapter.pov, ...(thisChapter.cast || [])].filter(Boolean))];
const castCards = castIds.map((id) => byId.get(id)).filter(Boolean);

// off-stage characters the on-stage cast is related to (keep the link, not the whole card)
const offstageIds = new Set();
for (const c of castCards) for (const r of c.relationships || []) {
  if (r && r.with && !castIds.includes(r.with) && byId.has(r.with)) offstageIds.add(r.with);
}
const offstage = [...offstageIds].map((id) => byId.get(id)).filter(Boolean);

const arc = arcs.find((a) => a && typeof a.start_chapter === "number" &&
  chapterNumber >= a.start_chapter && (a.end_chapter == null || chapterNumber <= a.end_chapter)) || null;

// world rules in play: global by default; a rule may OPT IN to arc-scoping via `arcs: [arcId,...]`
// (untagged rules always inject — zero regression — so a long book can localize rules per arc).
const allWorldRules = Array.isArray(state.world_rules) ? state.world_rules : [];
const worldRules = allWorldRules.filter((r) =>
  !r || !Array.isArray(r.arcs) || r.arcs.length === 0 || (arc && r.arcs.includes(arc.id)));

// foreshadowing in play: planted (setup<=N) and still open, OR planned to pay off this chapter.
// Flag long-dormant threads (open, untouched for >= dormantAfter chapters) so they don't silently
// rot — a thread's last activity is `last_advanced_chapter` if set, else its setup_chapter.
const allForeshadow = Array.isArray(state.foreshadowing) ? state.foreshadowing : [];
const liveThreads = allForeshadow
  .filter((f) => f && typeof f.setup_chapter === "number" && f.setup_chapter <= chapterNumber &&
    (f.status === "open" || f.resolved_chapter === chapterNumber))
  .sort((a, b) => a.setup_chapter - b.setup_chapter)
  .map((f) => {
    const lastAdvanced = typeof f.last_advanced_chapter === "number" ? f.last_advanced_chapter : f.setup_chapter;
    const dormantFor = chapterNumber - lastAdvanced;
    const paysOffHere = f.resolved_chapter === chapterNumber;
    return { ...f, dormant_for: dormantFor, dormant: f.status === "open" && !paysOffHere && dormantFor >= dormantAfter };
  });

// last N chapter summaries strictly before this chapter
const recent = chapters
  .filter((c) => c && typeof c.number === "number" && c.number < chapterNumber)
  .sort((a, b) => b.number - a.number)
  .slice(0, lastN)
  .sort((a, b) => a.number - b.number);

// --- what was left out (bounding evidence) ----------------------------------
const excluded = {
  characters: characters.length - castCards.length,
  prior_chapters: chapters.filter((c) => c && typeof c.number === "number" && c.number < chapterNumber).length - recent.length,
  resolved_or_unplanted_threads: allForeshadow.length - liveThreads.length,
  off_arc_world_rules: allWorldRules.length - worldRules.length,
};

const pack = {
  story_id: state.story_id,
  chapter: { number: thisChapter.number, title: thisChapter.title || null, pov: thisChapter.pov || null, goal_hint: thisChapter.summary || null },
  premise: state.premise,
  arc: arc ? { id: arc.id, title: arc.title, goal: arc.goal || null, summary: arc.summary || null } : null,
  cast: castCards,
  offstage_links: offstage.map((c) => ({ id: c.id, name: c.name, status: c.status })),
  world_rules: worldRules,
  live_foreshadowing: liveThreads,
  recent_chapters: recent.map((c) => ({ number: c.number, title: c.title || null, summary: c.summary || null })),
  excluded,
};

if (asJson) {
  process.stdout.write(JSON.stringify(pack, null, 2) + "\n");
  process.exit(0);
}

// --- Markdown rendering ------------------------------------------------------
const L = [];
L.push(`# Context pack — ${pack.story_id} · chapter ${pack.chapter.number}${pack.chapter.title ? `: ${pack.chapter.title}` : ""}`);
L.push("");
L.push(`> Relevance-weighted. Inject THIS and only this — not the whole bible.`);
L.push("");
L.push(`**Premise.** ${pack.premise}`);
if (pack.arc) {
  L.push("");
  L.push(`**Arc — ${pack.arc.title}.** ${pack.arc.goal ? `Goal: ${pack.arc.goal} ` : ""}${pack.arc.summary || ""}`.trim());
}
if (pack.chapter.goal_hint) { L.push(""); L.push(`**This chapter (planned).** ${pack.chapter.goal_hint}`); }

L.push("");
L.push(`## On-stage cast (${castCards.length})`);
for (const c of castCards) {
  const bits = [];
  bits.push(`**${c.name}** \`${c.id}\` — ${c.status}${c.status === "dead" && c.died_chapter ? ` (died ch ${c.died_chapter})` : ""}`);
  if (c.id === pack.chapter.pov) bits[0] += " · POV";
  L.push(`- ${bits[0]}`);
  if (c.appearance) L.push(`  - look: ${c.appearance}`);
  if (c.goal) L.push(`  - wants: ${c.goal}`);
  if (c.fear) L.push(`  - fears: ${c.fear}`);
  for (const r of c.relationships || []) {
    const who = byId.get(r.with);
    L.push(`  - ${r.type} of ${who ? who.name : r.with}${r.state ? ` — ${r.state}` : ""}`);
  }
}

if (offstage.length) {
  L.push("");
  L.push(`## Off-stage (referenced, not on-stage)`);
  for (const c of offstage) L.push(`- **${c.name}** \`${c.id}\` — ${c.status}`);
}

if (worldRules.length) {
  L.push("");
  L.push(`## World rules in play (hard constraints)`);
  for (const r of worldRules) L.push(`- \`${r.id}\` ${r.rule}`);
}

if (liveThreads.length) {
  L.push("");
  L.push(`## Live foreshadowing (advance or pay off — do not drop)`);
  for (const f of liveThreads) {
    const note = f.resolved_chapter === chapterNumber ? " ← **pays off THIS chapter**"
      : f.dormant ? ` ← ⚠ **long-dormant ${f.dormant_for} ch — pay off or cut**` : "";
    L.push(`- \`${f.id}\` (set up ch ${f.setup_chapter}) ${f.description}${note}`);
  }
}

if (recent.length) {
  L.push("");
  L.push(`## Last ${recent.length} chapter(s) — local continuity`);
  for (const c of recent) L.push(`- **Ch ${c.number}${c.title ? ` ${c.title}` : ""}.** ${c.summary || "(no summary)"}`);
}

const approxChars = L.join("\n").length;
L.push("");
L.push(`---`);
const dormantCount = liveThreads.filter((f) => f.dormant).length;
L.push(`_Bounded: injected ${castCards.length}/${characters.length} characters, ${recent.length}/${recent.length + excluded.prior_chapters} prior chapters, ${worldRules.length}/${allWorldRules.length} world rules, ${liveThreads.length}/${allForeshadow.length} threads. Pack ≈ ${approxChars} chars (~${Math.ceil(approxChars / 4)} tokens). Excluded ${excluded.characters} characters + ${excluded.prior_chapters} older chapters + ${excluded.off_arc_world_rules} off-arc rules as not relevant.${dormantCount ? ` ⚠ ${dormantCount} long-dormant thread(s) flagged.` : ""}_`);

process.stdout.write(L.join("\n") + "\n");
process.exit(0);
