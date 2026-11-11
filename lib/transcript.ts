// What the faint "heard" plate on the listening screen shows. Pure helpers so the quiet-bystander rules are unit-testable.
// A sale sentence, a correction or a question shows in full and never fades; only speech the server classed as chatter is bounded.

/** "fresh": just classified as chatter. "faded": the quiet period passed, the plate is hidden. Undefined: not chatter. */
export type ChatterPhase = "fresh" | "faded";

export const CHATTER_FADE_MS = 4000; // about 4 s of silence after the chatter verdict
const CHATTER_MAX_CHARS = 60; // two lines of the 34ch plate with room for word wrapping
const LIVE_MAX_CHARS = 120; // not yet classified (or a sale sentence): about three lines of the 46ch plate, which still fits the 20 px gap under the slot; a monologue cannot grow the plate without bound

/**
 * Keeps the newest words: at most `max` characters (code points), cut at a word boundary, with an ellipsis at the start.
 * Chatter gets the tight bound; text not (yet) classed as chatter gets a generous one.
 */
export function plateText(transcript: string, chatter?: ChatterPhase): string {
  const max = chatter ? CHATTER_MAX_CHARS : LIVE_MAX_CHARS;
  const chars = Array.from(transcript.trim());
  if (chars.length <= max) return transcript.trim();
  const tail = chars.slice(-max);
  const cutMidWord = chars[chars.length - max - 1] !== " " && tail[0] !== " ";
  let words = tail.join("");
  const firstSpace = words.indexOf(" ");
  if (cutMidWord && firstSpace >= 0) words = words.slice(firstSpace + 1); // drop a half-cut first word
  words = words.trim();
  return words ? `…${words}` : "…";
}

/** Milliseconds until the plate should fade, or null when no fade may be scheduled (not chatter, or already faded). */
export function fadeDelay(chatter?: ChatterPhase): number | null {
  return chatter === "fresh" ? CHATTER_FADE_MS : null;
}
