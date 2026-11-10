// Guards the two things a judge meets first: the README's access and difference lines, and the one-log rule on the QR screen.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SAMPLES, SAMPLES_CAPTION, SAMPLE_CASH, SAMPLE_LATER, SAMPLE_SENTENCE, SAMPLE_SUMMARY } from "./sample";

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

describe("Try this sentence and the three other samples", () => {
  it("offers the hero sentence", () => {
    expect(SAMPLE_SENTENCE).toBe("two jars of honey and the big candle, she pays by PayPal");
  });
  it("offers cash, pay later (known name and the seeded buyer email) and the day summary", () => {
    expect(SAMPLE_CASH).toBe("three small candles, cash");
    expect(SAMPLE_LATER).toBe("one gift box, she pays later, her name is Anna and her email is sb-otb43o53811890@personal.example.com");
    expect(SAMPLE_SUMMARY).toBe("how did today go");
  });
  it("lists exactly four buttons in order, each sending its own full sentence", () => {
    expect(SAMPLES.map((x) => x.sentence)).toEqual([SAMPLE_SENTENCE, SAMPLE_CASH, SAMPLE_LATER, SAMPLE_SUMMARY]);
    expect(new Set(SAMPLES.map((x) => x.id)).size).toBe(4);
  });
  it("shows the full sentence on the pill, or nothing (label only) for the long pay-later one", () => {
    for (const x of SAMPLES) expect(x.shown === x.sentence || x.shown === "").toBe(true);
  });
  it("labels the row for judges without a microphone and does not claim the day summary makes an invoice", () => {
    expect(SAMPLES_CAPTION).toBe("Typed samples for judges without a microphone. The sale samples create real sandbox invoices.");
  });
  it("README names all four sample buttons and the seed script uses the same buyer", () => {
    const readme = read("README.md");
    for (const label of ["Try this sentence", "Cash", "Pay later", "The day"]) expect(readme).toContain(`**${label}**`);
    expect(readme).toContain("sb-otb43o53811890@personal.example.com");
  });
});
