import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaidScreen } from "./screens";

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
