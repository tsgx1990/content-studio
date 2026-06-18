/**
 * gates — the single registry mapping a file's suffix to (a) its JSON schema and (b) its
 * per-type deterministic gate. Zero dependencies. Imported by check.mjs, validate-sidecar.mjs,
 * and check-batch.mjs so the suffix→schema / suffix→gate knowledge lives in ONE place (it used
 * to be hand-duplicated in check.mjs and validate-sidecar — they drifted, e.g. *.data.json had
 * to be added to both by hand).
 *
 * Schema paths are repo-root-relative; consumers resolve them against ROOT.
 */

// suffix -> schema (used to validate any sidecar/source/data JSON).
export const SCHEMA_BY_SUFFIX = [
  [/\.review\.json$/i, "schemas/review.schema.json"],
  [/\.research\.json$/i, "schemas/keyword-research.schema.json"],
  [/\.continuity\.json$/i, "schemas/continuity-report.schema.json"],
  [/\.spec\.json$/i, "schemas/children-story.schema.json"],
  [/\.if\.json$/i, "schemas/interactive-fiction.schema.json"],
  [/\.script\.json$/i, "schemas/youtube-script.schema.json"],
  [/\.note\.json$/i, "schemas/xhs-post.schema.json"],
  [/\.prose\.json$/i, "schemas/prose.schema.json"],
  [/\.drama\.json$/i, "schemas/short-drama.schema.json"],
  [/\.lesson\.json$/i, "schemas/english-learning-story.schema.json"],
  [/\.game\.json$/i, "schemas/game-story.schema.json"],
  [/\.audio\.json$/i, "schemas/audio-story.schema.json"],
  [/\.feedback\.json$/i, "schemas/topic-feedback.schema.json"],
  [/\.data\.json$/i, "schemas/data-anchors.schema.json"],
  [/\/state\.json$/i, "schemas/story-state.schema.json"],
];

// suffix -> the per-type gate that runs ON the JSON source itself (the uniform ones: the gate
// takes the .json path and exits non-zero on failure). children-story (readability) and
// long-form (continuity) are intentionally NOT here — their gate runs on the .md / on
// novel/state.json, a different shape handled explicitly by their callers.
export const GATE_BY_SUFFIX = [
  { suffix: /\.if\.json$/i,     script: "check-storygraph.mjs",    section: "interactive fiction (story-graph gate)",        label: "story-graph" },
  { suffix: /\.script\.json$/i, script: "check-script.mjs",        section: "youtube scripts (script gate)",                 label: "script" },
  { suffix: /\.note\.json$/i,   script: "check-xhsnote.mjs",       section: "xiaohongshu notes (note gate)",                 label: "note" },
  { suffix: /\.prose\.json$/i,  script: "check-prose.mjs",         section: "prose cards (prose gate)",                      label: "prose" },
  { suffix: /\.drama\.json$/i,  script: "check-short-drama.mjs",   section: "short dramas (short-drama gate)",               label: "short-drama" },
  { suffix: /\.lesson\.json$/i, script: "check-graded-reader.mjs", section: "english-learning stories (graded-reader gate)", label: "graded-reader" },
  { suffix: /\.game\.json$/i,   script: "check-game-story.mjs",    section: "game stories (game-story gate)",                label: "game-story" },
  { suffix: /\.audio\.json$/i,  script: "check-audio-story.mjs",   section: "audio stories (audio-story gate)",              label: "audio-story" },
];

/** The schema (repo-root-relative path) for a file, or null if none applies. */
export function schemaFor(file) {
  const hit = SCHEMA_BY_SUFFIX.find(([re]) => re.test(file));
  return hit ? hit[1] : null;
}

/** The per-type gate descriptor for a source file, or null if none applies. */
export function gateFor(file) {
  return GATE_BY_SUFFIX.find((g) => g.suffix.test(file)) || null;
}
