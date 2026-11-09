// Spike F0: does a phone pay a sandbox invoice QR, and do we see PAID?
// Usage: npx tsx scripts/spike-f0.ts   (prints the payer URL, writes qr PNG to ./spike-qr.png, polls every 3 s)
import { writeFileSync } from "node:fs";
import { createSaleInvoice, generateQr, getInvoiceStatus } from "../lib/invoices";

async function main() {
  const created = await createSaleInvoice({
    currency: "USD", total: 22, payment_mode: "paypal_qr",
    items: [
      { sku: "honey-500", name: "Honey 500 g", qty: 2, unit_price: 8 },
      { sku: "candle-l", name: "Beeswax candle large", qty: 1, unit_price: 6 },
    ],
  });
  console.log("INVOICE", created.invoice_id);
  console.log("PAYER_URL", created.payer_url);
  const t0 = Date.now();
  const png = await generateQr(created.invoice_id);
  console.log("QR", png ? `ok (${png.length} b64 chars) in ${Date.now() - t0} ms` : "FAILED to parse");
  if (png) writeFileSync("spike-qr.png", Buffer.from(png, "base64"));
  const limitMs = Number(process.env.SPIKE_WAIT_MIN ?? 20) * 60_000;
  const start = Date.now();
  let last = "";
  while (Date.now() - start < limitMs) {
    const s = await getInvoiceStatus(created.invoice_id);
    if (s !== last) { console.log(new Date().toISOString(), "STATUS", s); last = s; }
    if (s === "PAID") { console.log("PAID after", Math.round((Date.now() - start) / 1000), "s"); return; }
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log("TIMEOUT waiting for PAID");
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
