#!/usr/bin/env node
/**
 * test-graded-reader — fixture self-test for the english-learning-story (CEFR) gate. Zero deps.
 * Run with: node scripts/test-graded-reader.mjs
 * Exit 0 = all cases behaved as expected, exit 1 = a check regressed.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const GATE = resolve(dirname(fileURLToPath(import.meta.url)), "check-graded-reader.mjs");
const tmp = mkdtempSync(join(tmpdir(), "graded-test-"));
let passed = 0, failed = 0;

function exitCode(args) {
  try { execFileSync("node", [GATE, ...args], { stdio: "pipe" }); return 0; }
  catch (e) { return typeof e.status === "number" ? e.status : 1; }
}
function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ✔ ${name}`); }
  else { failed++; console.error(`  ✖ ${name} — ${detail}`); }
}
function writeLesson(name, obj) { const p = join(tmp, name); writeFileSync(p, JSON.stringify(obj, null, 2)); return p; }
const clone = (o) => JSON.parse(JSON.stringify(o));

// A valid A2 story: ~175 words, short sentences (<=10 words), names recognized mid-sentence,
// target words 'umbrella' and 'puddle' each repeated, almost entirely core vocabulary.
const story = [
  "Mia goes to school every day.",
  "Today the sky is dark.",
  "Soon it starts to rain.",
  "Mia has no umbrella with her.",
  "Her shoes get wet in the rain.",
  "A boy sees Mia at the bus stop.",
  "The boy gives Mia his umbrella.",
  "Mia is very happy now.",
  "The umbrella keeps her head dry.",
  "She walks to school with the umbrella.",
  "A big puddle is in the road.",
  "Mia jumps over the big puddle.",
  "She does not want wet feet.",
  "At school Mia is warm and dry.",
  "She gives the umbrella back to him.",
  "The boy and Mia both smile.",
  "After school the sun comes out.",
  "Mia jumps in the puddle for fun.",
  "Now her shoes are wet again.",
  "But Mia does not care at all.",
  "Mia tells her mother about the boy.",
  "Her mother gives Mia a warm drink.",
  "Mia sits by the window.",
  "She looks at the rain outside.",
  "The rain stops in the evening.",
  "Mia reads a book in bed.",
  "She thinks about the kind boy.",
  "Mia falls into a happy sleep.",
].join(" ");

const validLesson = {
  lesson_id: "rainy-day",
  language: "en",
  cefr_level: "A2",
  title: "A Rainy Day",
  learning_objective: "Talk about weather and a simple everyday event.",
  story,
  target_vocabulary: [
    { word: "umbrella", gloss: "a thing you hold over your head in the rain" },
    { word: "puddle", gloss: "a small pool of water on the ground" },
  ],
};

console.log("graded-reader gate:");
check("valid A2 story -> pass", exitCode([writeLesson("ok.lesson.json", validLesson)]) === 0, "expected pass");

// a 19-word sentence (all core) -> over the A2 cap of 10
const longSentence = clone(validLesson);
longSentence.story = story + " Mia thought about the kind boy and the rain and the big puddle for a very long time after.";
check("a sentence over the level cap -> fail", exitCode([writeLesson("long.lesson.json", longSentence)]) !== 0, "expected fail");

// too short for the A2 band (150 min)
const tooShort = clone(validLesson);
tooShort.story = "Mia goes to school. It starts to rain. A boy gives Mia his umbrella. Mia jumps in a puddle.";
check("story too short for the band -> fail", exitCode([writeLesson("short.lesson.json", tooShort)]) !== 0, "expected fail");

// a target word that never appears in the story
const missingTarget = clone(validLesson);
missingTarget.target_vocabulary.push({ word: "rainbow", gloss: "colors in the sky after rain" });
check("a target word not used -> fail", exitCode([writeLesson("target.lesson.json", missingTarget)]) !== 0, "expected fail");

// a target word used only once (< default 2 repetitions)
const onceOnly = clone(validLesson);
onceOnly.story = story + " The teacher had a raincoat.";
onceOnly.target_vocabulary.push({ word: "raincoat", gloss: "a coat that keeps the rain off" });
check("a target word appearing once (< 2) -> fail", exitCode([writeLesson("once.lesson.json", onceOnly)]) !== 0, "expected fail");

// dense beyond-core block (short sentences, so the ONLY failure is the vocab budget)
const HARD = Array.from({ length: 8 }, () => "Wizard, dragon, witch, goblin, troll, ogre.").join(" ");
const hardWords = clone(validLesson);
hardWords.story = story + " " + HARD;
check("too many undeclared beyond-core words -> fail", exitCode([writeLesson("hard.lesson.json", hardWords)]) !== 0, "expected fail");

// schema violation: missing gloss on a target word
const badSchema = clone(validLesson);
delete badSchema.target_vocabulary[0].gloss;
check("schema violation (target word missing gloss) -> fail", exitCode([writeLesson("schema.lesson.json", badSchema)]) !== 0, "expected fail");

// unknown CEFR level
const badLevel = clone(validLesson); badLevel.cefr_level = "Z9";
check("unknown CEFR level -> fail", exitCode([writeLesson("level.lesson.json", badLevel)]) !== 0, "expected fail");

// allowed_extra declares the hard words -> pass
const rescued = clone(hardWords);
rescued.allowed_extra = ["wizard", "dragon", "witch", "goblin", "troll", "ogre"];
check("allowed_extra declares the hard words -> pass", exitCode([writeLesson("rescue.lesson.json", rescued)]) === 0, "expected pass");

// override max_sentence_words lets the long sentence through -> pass
const override = clone(longSentence); override.max_sentence_words = 22;
check("max_sentence_words override -> pass", exitCode([writeLesson("override.lesson.json", override)]) === 0, "expected pass");

// names at the start of a sentence are NOT counted as hard words (proper-noun heuristic) -> pass
const namesFirst = clone(validLesson);
namesFirst.story = story + " Mia and Mia walked home. Mia is happy. Mia smiled twice.";
check("sentence-initial names not flagged -> pass", exitCode([writeLesson("names.lesson.json", namesFirst)]) === 0, "expected pass");

rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
