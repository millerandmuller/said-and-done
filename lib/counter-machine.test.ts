import { describe, expect, it } from "vitest";
import { initialState, reducer, draftOf, type Action, type CounterState } from "./counter-machine";
import type { Sale } from "./types";

const sale: Sale = { items: [{ sku: "honey-500", name: "Honey 500 g", qty: 2, unit_price: 8 }, { sku: "candle-large", name: "Beeswax candle large", qty: 1, unit_price: 6 }], currency: "USD", total: 22, payment_mode: "paypal_qr" };
const run = (actions: Action[], from: CounterState = initialState) => actions.reduce(reducer, from);

describe("counter state machine", () => {
  it("walks the hero loop: listening -> confirming -> awaiting -> paid -> listening", () => {
    let s = run([{ type: "start" }, { type: "thinking" }, { type: "sale_ready", sale, speak: "Two honey... Yes?" }]);
    expect(s.phase).toBe("confirming");
    expect(s.focusSku).toBe("honey-500");
    s = run([{ type: "creating" }, { type: "invoice_ready", awaiting: { invoice_id: "INV-1", payer_url: "u", status: "UNPAID", sale, trace: [] } }], s);
    expect(s.phase).toBe("awaiting_payment");
    s = run([{ type: "paid", total: 22, currency: "USD" }], s);
    expect(s.phase).toBe("paid");
    expect(run([{ type: "done" }], s).phase).toBe("listening");
  });
  it("keeps the draft on screen when a non-sale reply arrives mid-confirmation", () => {
    const s = run([{ type: "start" }, { type: "sale_ready", sale, speak: "Yes?" }, { type: "thinking" }, { type: "say", message: "I didn't catch that." }]);
    expect(s.phase).toBe("confirming");
    expect(s.sale).toBe(sale);
  });
  it("returns to listening and drops the draft on reject", () => {
    const s = run([{ type: "start" }, { type: "sale_ready", sale, speak: "Yes?" }, { type: "reject" }]);
    expect(s).toMatchObject({ phase: "listening", sale: null });
  });
  it("keeps focus on a still-present line after a correction", () => {
    let s = run([{ type: "start" }, { type: "sale_ready", sale, speak: "Yes?" }, { type: "focus", sku: "candle-large" }]);
    s = run([{ type: "sale_ready", sale: { ...sale, total: 24 }, speak: "Yes?" }], s);
    expect(s.focusSku).toBe("candle-large");
  });
  it("exposes the draft for server-side corrections", () => {
    const s = run([{ type: "start" }, { type: "sale_ready", sale, speak: "Yes?" }]);
    expect(draftOf(s)?.items).toHaveLength(2);
    expect(draftOf(initialState)).toBeNull();
  });
});

describe("ignore: bystander chatter", () => {
  it("leaves thinking silently and keeps the draft", () => {
    const sale = { items: [{ sku: "tea", name: "Tea", qty: 1, unit_price: 6 }], currency: "USD", total: 6, payment_mode: "paypal_qr" as const };
    const confirming = reducer(initialState, { type: "sale_ready", sale, speak: "One tea, six dollars. Yes?" });
    const after = reducer(reducer(confirming, { type: "thinking" }), { type: "ignore" });
    expect(after.phase).toBe("confirming");
    expect(after.message).toBe("One tea, six dollars. Yes?");
  });
  it("from an empty counter returns to listening without a message change", () => {
    const listening = reducer(initialState, { type: "start" });
    const after = reducer(reducer(listening, { type: "thinking" }), { type: "ignore" });
    expect(after.phase).toBe("listening");
    expect(after.message).toBe("Listening.");
  });
});
