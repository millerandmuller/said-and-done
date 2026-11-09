import { describe, expect, it } from "vitest";
import { classify, parseQuantity } from "./voice-commands";

describe("classify", () => {
  it.each([["Yes."], ["yeah"], ["Go ahead!"], ["OK"]])("%s is yes", (t) => expect(classify(t)).toBe("yes"));
  it.each([["no"], ["Nope."]])("%s is no", (t) => expect(classify(t)).toBe("no"));
  it.each([["never mind"], ["Cancel that"]])("%s is never mind", (t) => expect(classify(t)).toBe("never_mind"));
  it("hears cash and later", () => {
    expect(classify("Cash")).toBe("cash");
    expect(classify("she pays later")).toBe("later");
  });
  it("sends corrections and sales to the model, not the shortcut", () => {
    expect(classify("no, three")).toBe("other");
    expect(classify("yes and a jam")).toBe("other");
    expect(classify("two jars of honey")).toBe("other");
  });
});

describe("parseQuantity", () => {
  it.each([["no, 3", 3], ["No, three", 3], ["no 3", 3], ["make it three", 3], ["make that 4 please", 4], ["three", 3], ["actually two", 2], ["no for", 4]])("%s -> %s", (t, n) => expect(parseQuantity(t)).toBe(n));
  it.each([["two jars of honey"], ["no"], ["yes"], ["and a jam"], ["no, the big candle"]])("%s is not a bare quantity", (t) => expect(parseQuantity(t)).toBeNull());
});
