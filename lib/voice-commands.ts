// Short spoken commands are matched locally: instant, deterministic, no model round trip.
// Anything longer or unclear goes to the model (lib/understand.ts).
export type Command = "yes" | "no" | "cash" | "later" | "never_mind" | "other";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").replace(/\s+/g, " ").trim();

const YES = new Set(["yes", "yeah", "yep", "yup", "correct", "right", "that's right", "go ahead", "do it", "confirm", "confirmed", "ok", "okay", "sure", "yes please"]);
const NO = new Set(["no", "nope", "wrong", "not that", "nah"]);
const NEVER_MIND = new Set(["never mind", "nevermind", "cancel", "cancel that", "forget it", "scratch that", "stop"]);
const CASH = new Set(["cash", "in cash", "cash please", "she pays cash", "he pays cash", "they pay cash", "paid cash", "cash it"]);
const LATER = new Set(["later", "pay later", "she pays later", "he pays later", "they pay later", "on account"]);

export function classify(text: string): Command {
  const t = norm(text);
  if (YES.has(t)) return "yes";
  if (NEVER_MIND.has(t)) return "never_mind";
  if (NO.has(t)) return "no";
  if (CASH.has(t)) return "cash";
  if (LATER.has(t)) return "later";
  return "other";
}

const WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, to: 2, too: 2, three: 3, four: 4, for: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

// "no, three" / "no 3" / "make it three" / "three" / "make that 3 please": a bare quantity correction for the focused line.
// Speech recognition writes "to"/"for" for 2/4, so those count too, but only inside this narrow pattern.
export function parseQuantity(text: string): number | null {
  const t = norm(text).replace(/^(no|nope|actually|wait|sorry|make it|make that|change it to|change that to|it's|its|let's say|say)\s+/, "")
    .replace(/^(make it|make that|change it to)\s+/, "").replace(/\s+(please|of them|of those)$/, "").trim();
  if (/^\d{1,2}$/.test(t)) return Number(t);
  return t in WORDS ? WORDS[t] : null;
}
