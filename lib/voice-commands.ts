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
