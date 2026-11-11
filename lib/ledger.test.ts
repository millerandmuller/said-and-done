import { describe, expect, it } from "vitest";
import { displayName, modeFromReference, rowFromInvoice } from "./ledger";

describe("ledger mapping", () => {
  it("ignores invoices this app did not create", () => {
    expect(rowFromInvoice("INV-X", { status: "PAID", detail: { reference: "PO-123" } })).toBeNull();
  });
  it("maps a cash-paid curated invoice", () => {
    const row = rowFromInvoice("INV-1", {
      status: "MARKED_AS_PAID",
      detail: { currency_code: "USD", reference: "SD:seed-saturday" },
      items: [{ name: "Soap", quantity: "2", unit_amount: { value: "5.00" } }],
      amount: { value: "10.00" },
      payments: { transactions: [{ method: "CASH", payment_date: "2026-11-07" }] },
    });
    expect(row).toMatchObject({ method: "CASH", curated: true, total: 10, time: "2026-11-07T20:00:00.000Z" });
    expect(row?.items).toEqual([{ name: "Soap", qty: 2, unit_price: 5 }]);
  });
  it("prefers a spoken name over the placeholder and the email", () => {
    expect(displayName({ email_address: "a@x.com", name: { given_name: "Anna" } })).toBe("Anna");
    expect(displayName({ email_address: "a@x.com", name: { given_name: "Customer" } })).toBe("a@x.com");
    expect(displayName({ name: { given_name: "Customer" } })).toBe("Walk-in");
    expect(displayName({ email_address: "a@x.com" })).toBe("a@x.com");
    expect(displayName(undefined)).toBeUndefined();
  });
  it("reads the reference tag", () => {
    expect(modeFromReference("SD:later")).toBe("paypal_later");
    expect(modeFromReference("SD:seed-today")).toBe("seed");
    expect(modeFromReference("other")).toBeUndefined();
  });
});
