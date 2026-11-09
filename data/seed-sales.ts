// Curated history for the demo stall (brief 1.6 "Demo-Daten"): 8 sales "earlier today", 12 "last Saturday".
// These are real sandbox invoices with an external payment recorded and tagged SD:seed-*; the ledger and README label them curated.
// The mix is designed so the planning answer has something true to say: honey rises, soap falls.
export type SeedSale = { items: [sku: string, qty: number][]; method: "PAYPAL" | "CASH" };

export const SEED_TODAY: SeedSale[] = [
  { items: [["honey-500", 2], ["candle-large", 1]], method: "PAYPAL" },
  { items: [["honey-250", 1], ["lip-balm", 2]], method: "CASH" },
  { items: [["jam", 2]], method: "PAYPAL" },
  { items: [["honey-500", 3]], method: "PAYPAL" },
  { items: [["soap", 2], ["tea", 1]], method: "CASH" },
  { items: [["gift-box", 1], ["honey-500", 1]], method: "PAYPAL" },
  { items: [["candle-small", 2]], method: "CASH" },
  { items: [["honey-500", 2], ["jam", 1]], method: "PAYPAL" },
];

export const SEED_LAST_SATURDAY: SeedSale[] = [
  { items: [["honey-500", 1], ["soap", 2]], method: "PAYPAL" },
  { items: [["lip-balm", 3]], method: "CASH" },
  { items: [["candle-small", 4]], method: "PAYPAL" },
  { items: [["soap", 3]], method: "PAYPAL" },
  { items: [["honey-250", 2], ["tea", 1]], method: "CASH" },
  { items: [["gift-box", 2]], method: "PAYPAL" },
  { items: [["candle-large", 2]], method: "PAYPAL" },
  { items: [["lip-balm", 2], ["soap", 1]], method: "PAYPAL" },
  { items: [["honey-500", 1], ["candle-small", 2]], method: "CASH" },
  { items: [["propolis", 1]], method: "PAYPAL" },
  { items: [["soap", 2], ["candle-small", 1]], method: "PAYPAL" },
  { items: [["tea", 2], ["jam", 1]], method: "PAYPAL" },
];

// The regular who "still owes from this morning": one honey, pay later, emailed to the sandbox buyer.
export const SEED_PAY_LATER = { sku: "honey-500", qty: 1, name: "Anna" };
