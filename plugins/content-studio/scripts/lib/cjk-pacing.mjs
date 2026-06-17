/**
 * cjk-pacing — shared, zero-dependency spoken-runtime estimation for scripts/audio.
 *
 * One source of truth for "how long does this narration take to speak", used by both the
 * youtube-script gate (check-script.mjs) and the renderer (render.mjs) so the estimate printed
 * in a rendered teleprompter can never drift from the number the gate enforces.
 *
 * Runtime is CJK-aware: Latin words are timed at `wpm`, CJK characters at `cpm` (a Chinese
 * narrator speaks ~240 chars/min, not 150 "words"/min). For a pure-English text this is identical
 * to the classic words/wpm estimate (no CJK chars).
 */

export const DEFAULT_WPM = 150;
export const DEFAULT_CPM = 240; // CJK characters per minute (spoken), distinct from Latin words/min

export const countEnWords = (str) => (String(str).match(/[A-Za-z0-9][A-Za-z0-9'’‑-]*/g) || []).length;
export const countCjkChars = (str) => (String(str).match(/[一-鿿㐀-䶿]/g) || []).length;
export const countWords = (str) => countEnWords(str) + countCjkChars(str); // combined display total

export const secondsForText = (str, wpm = DEFAULT_WPM, cpm = DEFAULT_CPM) =>
  (countEnWords(str) / wpm) * 60 + (countCjkChars(str) / cpm) * 60;
