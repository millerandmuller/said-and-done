import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ListeningStage, PaidScreen } from "./screens";

const paid = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(PaidScreen, { total: 22, currency: "USD", proof, ...props } as never));
const proof = { invoice_id: "INV-1", trace: [{ tool: "create_invoice", ms: 900 }] };

describe("PAID proof card timing row", () => {
  it("appears as the last row when both stamps are set, after the UNPAID -> PAID line", () => {
    const html = paid({saidAt: 1000, doneAt: 42000});
    expect(html).toContain("said → done 41 s (buyer login included)");
    expect(html.indexOf("UNPAID → PAID")).toBeLessThan(html.indexOf("said → done"));
  });
  it("reads minutes from 60 s", () => {
    expect(paid({saidAt: 0, doneAt: 98000})).toContain("said → done 1 min 38 s");
  });
  it("is absent without both stamps", () => {
    expect(paid({saidAt: 1000})).not.toContain("said → done");
    expect(paid({})).not.toContain("said → done");
  });
});

const listening = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(ListeningStage, { transcript: "", message: "Listening.", thinking: false, live: true, onTry: () => {}, ...props } as never));
const chatterText = "so anyway we went to the new place on the corner and the coffee was fine but the service was really slow and then he said something else";

describe("listening screen heard plate", () => {
  it("shows a sale sentence in full", () => {
    const sale = "one gift box, she pays later, her name is Anna and her email is sb-otb43o53811890@personal.example.com";
    const html = listening({ transcript: sale });
    expect(html).toContain(sale);
    expect(html).not.toContain("faded");
  });
  it("clamps long chatter to its newest words with a leading ellipsis", () => {
    const html = listening({ transcript: chatterText, chatter: "fresh" });
    expect(html).toContain("…");
    expect(html).toContain("something else");
    expect(html).not.toContain("so anyway we went");
  });
  it("marks the plate faded after the quiet period, and keeps it in a fixed slot", () => {
    const html = listening({ transcript: chatterText, chatter: "faded" });
    expect(html).toContain("heard-plate faded");
    expect(html).toContain("heard-slot");
  });
  it("renders an empty slot (no plate text) before anything is heard", () => {
    expect(listening({})).toContain("heard-slot");
  });
});
