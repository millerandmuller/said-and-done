import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Sale } from "./types";

// startCheckout with PayPal mocked: one invoice per (key, sale); the same key with a different sale must not return the old invoice.
const createInvoiceDraft = vi.fn();
vi.mock("./invoices", () => ({
  createInvoiceDraft: (...a: unknown[]) => createInvoiceDraft(...a),
  shareInvoice: async () => "https://pay.example/x",
  generateQr: async () => "QR",
  recordExternalPayment: vi.fn(),
}));
vi.mock("./ledger", () => ({ invalidateLedger: vi.fn() }));

import { startCheckout } from "./checkout";

const sale = (qty: number): Sale => ({ items: [{ sku: "tea", name: "Tea", qty, unit_price: 6 }], currency: "USD", total: qty * 6, payment_mode: "paypal_qr" });

describe("startCheckout idempotency", () => {
  beforeEach(() => { createInvoiceDraft.mockReset(); let n = 0; createInvoiceDraft.mockImplementation(async () => `INV2-${++n}`); });

  it("same key and same sale: one invoice", async () => {
    const a = await startCheckout(sale(2), "key-a");
    const b = await startCheckout(sale(2), "key-a");
    expect(b.invoice_id).toBe(a.invoice_id);
    expect(createInvoiceDraft).toHaveBeenCalledTimes(1);
  });

  it("same key but a different sale: a new invoice", async () => {
    const a = await startCheckout(sale(2), "key-b");
    const b = await startCheckout(sale(3), "key-b");
    expect(b.invoice_id).not.toBe(a.invoice_id);
    expect(b.total).toBe(18);
  });
});
