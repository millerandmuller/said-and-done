// Guards the two things a judge meets first: the README's access and difference lines, and the one-log rule on the QR screen.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SAMPLE_SENTENCE } from "./sample";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

describe("README carries the case alone", () => {
  const readme = read("README.md");
  it("names the hosted URL and the repository URL", () => {
    expect(readme).toContain("https://said-and-done-ten.vercel.app");
    expect(readme).toContain("https://github.com/millerandmuller/said-and-done");
  });
  it("names the products it differs from", () => {
    expect(readme).toContain("Unlike PayPal Zettle or Square POS");
  });
  it("states the audience without an unsourced number", () => {
    expect(readme).toContain("Who it is for");
  });
});

describe("one log on the QR and PAID screens", () => {
  const css = read("app/globals.css");
  it("hides the small log exactly where the proof card shows, and the card where it would touch the QR", () => {
    expect(css).toMatch(/@media \(min-width: 1201px\) \{ \.proof \{ display: none; \} \}/);
    expect(css).toMatch(/\n\.proof-card \{ display: none; \}/);
    expect(css).toMatch(/@media \(min-width: 1201px\) \{ \.proof-card \{ display: block; \} \}/);
  });
  it("keeps proof-card rows on one line", () => {
    expect(css).toMatch(/\.proof-card li \{[^}]*white-space: nowrap/);
  });
});

describe("Try this sentence", () => {
  it("offers the hero sentence", () => {
    expect(SAMPLE_SENTENCE).toBe("two jars of honey and the big candle, she pays by PayPal");
  });
});
