import { describe, expect, it } from "vitest";
import { initialState, reducer, type Action, type CounterState } from "./counter-machine";
import { CHATTER_FADE_MS, fadeDelay, plateText } from "./transcript";

const run = (actions: Action[], from: CounterState = initialState) => actions.reduce(reducer, from);
const long = "so anyway we went to the new place on the corner and the coffee was fine but the service was really slow and then he said something else";

describe("plateText", () => {
  it("leaves a normal sale sentence untouched (shows in full)", () => {
    const sale = "two honey and a large candle for Anna, pay later, anna@example.com";
    expect(plateText(sale)).toBe(sale);
    const pay = "one gift box, she pays later, her name is Anna and her email is sb-otb43o53811890@personal.example.com";
    expect(plateText(pay)).toBe(pay);
  });
  it("bounds a long unclassified monologue too, newest words kept", () => {
    const talk = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const out = plateText(talk);
    expect(out.startsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(121);
    expect(out.endsWith("word59")).toBe(true);
  });
  it("does not split an emoji and does not return only whitespace", () => {
    const out = plateText("😀".repeat(80) + "a", "fresh");
    expect(out).not.toMatch(/(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/); // no lone low surrogate
    expect(plateText("a".repeat(40) + " " + "b".repeat(60) + " ", "fresh")).not.toBe("…");
    expect(plateText(" ".repeat(100), "fresh")).toBe("");
  });
  it("leaves short chatter untouched", () => expect(plateText("hello there", "fresh")).toBe("hello there"));
  it("keeps only the newest words of long chatter, with an ellipsis at the start", () => {
    const out = plateText(long, "fresh");
    expect(out.startsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(61);
    expect(long.endsWith(out.slice(1))).toBe(true);
    expect(out).toContain("something else");
    expect(out.slice(1).startsWith(" ")).toBe(false);
    expect(long.slice(-60).includes(out.slice(1))).toBe(true);
  });
  it("never starts on a half-cut word", () => {
    const out = plateText(long, "faded").slice(1);
    expect(long.split(" ")).toContain(out.split(" ")[0]);
  });
});

describe("chatter fade", () => {
  it("schedules nothing until the server has called the utterance chatter", () => {
    expect(fadeDelay(initialState.chatter)).toBeNull();
    const s = run([{ type: "start" }, { type: "heard", text: long }, { type: "thinking" }]);
    expect(fadeDelay(s.chatter)).toBeNull();
  });
  it("schedules the fade right after an ignore", () => {
    const s = run([{ type: "start" }, { type: "heard", text: long }, { type: "thinking" }, { type: "ignore" }]);
    expect(s.chatter).toBe("fresh");
    expect(fadeDelay(s.chatter)).toBe(CHATTER_FADE_MS);
  });
  it("is cancelled by a new utterance, and the plate is back in full", () => {
    const s = run([{ type: "start" }, { type: "heard", text: long }, { type: "thinking" }, { type: "ignore" }, { type: "heard", text: "two honey" }]);
    expect(fadeDelay(s.chatter)).toBeNull();
    expect(run([{ type: "fade" }], s).chatter).toBeUndefined();
  });
  it("hides the plate when the timer fires, and a later utterance brings it back", () => {
    let s = run([{ type: "start" }, { type: "heard", text: long }, { type: "thinking" }, { type: "ignore" }, { type: "fade" }]);
    expect(s.chatter).toBe("faded");
    expect(fadeDelay(s.chatter)).toBeNull();
    s = run([{ type: "heard", text: "hello" }], s);
    expect(s.chatter).toBeUndefined();
  });
  it("never fades a sale, a correction or a question: those replies do not call ignore", () => {
    const s = run([{ type: "start" }, { type: "heard", text: "two honey" }, { type: "thinking" }, { type: "say", message: "What does it cost?" }]);
    expect(fadeDelay(s.chatter)).toBeNull();
    expect(run([{ type: "fade" }], s).chatter).toBeUndefined();
  });
  it("an ignore outside thinking does not start a fade", () => {
    expect(run([{ type: "start" }, { type: "ignore" }]).chatter).toBeUndefined();
  });
  it("a sale or a reply after chatter clears the flag", () => {
    const chatter = run([{ type: "start" }, { type: "thinking" }, { type: "ignore" }]);
    expect(run([{ type: "say", message: "What does it cost?" }], chatter).chatter).toBeUndefined();
  });
  it("reject clears a pending chatter state", () => {
    const s = run([{ type: "start" }, { type: "thinking" }, { type: "ignore" }, { type: "reject" }]);
    expect(s.chatter).toBeUndefined();
  });
});
