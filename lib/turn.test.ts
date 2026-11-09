import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CATALOG } from "../data/default-catalog";

// Bystander chatter must produce no spoken reply at all: the server returns "ignored".
const understand = vi.fn();
vi.mock("./understand", () => ({ understand: (...a: unknown[]) => understand(...a) }));
vi.mock("./catalog", () => ({ getCatalog: async () => DEFAULT_CATALOG, addCatalogItem: vi.fn() }));
vi.mock("./config", () => ({ getConfig: () => ({ defaultCurrency: "USD", demoFxUsdEur: 0.92, timezone: "America/Los_Angeles" }) }));
vi.mock("./ledger", () => ({ fetchLedger: vi.fn() }));
vi.mock("./invoices", () => ({ sendReminder: vi.fn() }));

import { interpretTurn } from "./turn";

const CHATTER = ["okay cool good just one second please", "hold on let me see", "yeah thanks, I'll be right with you"];

describe("interpretTurn: chatter is ignored silently", () => {
  beforeEach(() => understand.mockReset());

  it.each(CHATTER)("intent unknown -> ignored: %s", async (say) => {
    understand.mockResolvedValue({ intent: "unknown", items: [], payment_mode: null, currency: null });
    const r = await interpretTurn(say, null);
    expect(r).toEqual({ kind: "ignored" });
  });

  it.each(CHATTER)("a sale intent with no lines is ignored too: %s", async (say) => {
    understand.mockResolvedValue({ intent: "sale", items: [], payment_mode: null, currency: null });
    expect((await interpretTurn(say, null)).kind).toBe("ignored");
  });

  it("a real sale is still a sale", async () => {
    understand.mockResolvedValue({ intent: "sale", items: [{ sku: "honey-500", name: "honey", qty: 2 }], payment_mode: "paypal_qr", currency: null });
    const r = await interpretTurn("two honey", null);
    expect(r.kind).toBe("sale");
  });
});
