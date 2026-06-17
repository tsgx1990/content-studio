---
description: Write an audio story (narrated fiction / audio drama / TTS-voiced short) as a structured cue list, TTS-safety-gated, + rendered producer script. Args like project=slug premise="..." target_seconds=120 language=en.
---

Write an audio story. Parse arguments from: $ARGUMENTS

Invoke the **audio-story** skill:
1. Create/confirm `projects/{project}/project.yaml` with `type: audio-story` (propose a slug from
   the premise if `project` is missing).
2. Write the cue list FIRST — `projects/{project}/audio/{language}/{slug}.audio.json`: declare
   `voices[]` (+ `sounds[]`), then ordered `cues[]` (`narration`/`dialogue` with `voice`+`text`;
   `sfx`/`music` with `sound`). Open on narration or a sound, never cold dialogue. For any
   number/acronym/symbol in spoken text, add a `say_as { text, as }` or rewrite it as words.
3. Gate it: `node "${CLAUDE_PLUGIN_ROOT}"/scripts/check-audio-story.mjs <story.audio.json>` — fix until it exits 0 (speakers
   + sounds resolve, an orienting opening, runtime in tolerance, no un-marked TTS-hostile token).
4. Render the cue list to `{slug}.md` (Cast list, then cues in order — narration as prose, dialogue
   as **Name:** lines, sfx/music as `> [SFX/MUSIC: …]`, say_as pronunciations noted).
5. Run **content-review** → `{slug}.review.json` (`content_type: audio-story`).
6. Stop before publishing unless asked.

Never skip the TTS-safety gate; never leave a number/acronym/symbol for the TTS engine to guess.
