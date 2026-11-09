import { describe, expect, it } from "vitest";
import { classify } from "./voice-commands";

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
