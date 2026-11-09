// Shared data shapes (brief section 6). Kept free of logic so client and server can both import them.

export type PaymentMode = "paypal_qr" | "paypal_later" | "cash";

// How an item is read aloud: "one large candle", "three large candles", "Candles carried the day".
export type SpokenForms = { one: string; many: string; short: string };

export type SaleItem = { sku: string; name: string; qty: number; unit_price: number; spoken?: SpokenForms };

export type Sale = {
  items: SaleItem[];
  currency: string; // ISO 4217; USD by default, EUR for "she pays in euros"
  total: number; // in `currency`, two decimals
  payment_mode: PaymentMode;
  payer_email?: string;
  payer_name?: string;
};

export type CatalogItem = {
  sku: string;
  name: string;
  aliases: string[];
  price: number; // USD base price
  spoken?: SpokenForms;
  paypal_product_id?: string;
};

export type InvoiceStatus =
  | "DRAFT" | "SENT" | "UNPAID" | "PAYMENT_PENDING" | "PAID" | "MARKED_AS_PAID"
  | "CANCELLED" | "REFUNDED" | "PARTIALLY_PAID" | "MARKED_AS_REFUNDED" | "PARTIALLY_REFUNDED" | "SCHEDULED";

export type LedgerRow = {
  invoice_id: string;
  time: string; // ISO
  items: { name: string; qty: number; unit_price: number }[];
  total: number;
  currency: string;
  method: "PAYPAL" | "CASH";
  status: InvoiceStatus;
  payer?: string;
  curated?: boolean; // true for seeded "earlier today" / "last Saturday" history
  later?: boolean; // sold as pay-later (reminder candidates when still unpaid)
  payer_email?: string;
};

export type CreatedInvoice = {
  invoice_id: string;
  payer_url: string; // what the QR encodes
  qr_png_base64?: string;
  total: number;
  currency: string;
};
