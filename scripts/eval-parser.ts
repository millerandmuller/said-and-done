// Acceptance: 8 of 10 scripted utterances parsed correctly on the first try (brief F1).
// Usage: npx tsx scripts/eval-parser.ts
import { DEFAULT_CATALOG } from "../data/default-catalog";
import { priceLines, totalOf } from "../lib/sale-math";
import { understand } from "../lib/understand";
import type { SaleItem } from "../lib/types";

type Case = { say: string; draft?: SaleItem[]; expectTotal?: number; expectMode?: string | null; expectIntent?: string; expectCurrency?: string | null; expectEmail?: string };

const honey2: SaleItem[] = [{ sku: "honey-500", name: "Honey 500 g", qty: 2, unit_price: 8 }, { sku: "candle-large", name: "Beeswax candle large", qty: 1, unit_price: 6 }];

const CASES: Case[] = [
  { say: "two jars of honey and the big candle, she pays by PayPal", expectTotal: 22, expectMode: "paypal_qr" },
  { say: "three small candles and a lip balm cash", expectTotal: 13, expectMode: "cash" },
  { say: "one gift box and two teas she pays later her email is anna at example dot com", expectTotal: 27, expectMode: "paypal_later", expectEmail: "anna@example.com" },
  { say: "no three", draft: honey2, expectTotal: 30 },
  { say: "make that one honey", draft: honey2, expectTotal: 14 },
  { say: "and a jam", draft: honey2, expectTotal: 29 },
  { say: "the chipped candle for two dollars and a soap", expectTotal: 7 },
  { say: "a large honey and a propolis tincture she pays in euros", expectTotal: 18.4, expectCurrency: "EUR" },
  { say: "how did today go", expectIntent: "day_summary" },
  { say: "what should I bring next week", expectIntent: "plan_week" },
  { say: "remind everyone who still owes", expectIntent: "remind_owing" },
  { say: "okay cool good just one second please", expectIntent: "unknown" },
  { say: "hold on, let me see, yeah that looks great", expectIntent: "unknown" },
  { say: "thanks so much, I'll be right with you", expectIntent: "unknown" },
  { say: "I sell five hundred gram honey for eight dollars people call it the big jar", expectIntent: "add_catalog_item" },
];

async function main() {
  let pass = 0;
  for (const c of CASES) {
    const t0 = Date.now();
    try {
      const u = await understand(c.say, DEFAULT_CATALOG, c.draft ?? []);
      const fx = u.currency === "EUR" ? 0.92 : 1;
      const priced = priceLines(u.items.filter((i) => i.qty > 0), DEFAULT_CATALOG, fx);
      const total = totalOf(priced.items);
      const checks: string[] = [];
      if (c.expectIntent && u.intent !== c.expectIntent) checks.push(`intent ${u.intent}`);
      if (!c.expectIntent && u.intent !== "sale") checks.push(`intent ${u.intent}`);
      if (c.expectTotal !== undefined && Math.abs(total - c.expectTotal) > 0.01) checks.push(`total ${total} != ${c.expectTotal}`);
      if (c.expectMode !== undefined && u.payment_mode !== c.expectMode) checks.push(`mode ${u.payment_mode}`);
      if (c.expectCurrency && u.currency !== c.expectCurrency) checks.push(`currency ${u.currency}`);
      if (c.expectEmail && u.payer_email !== c.expectEmail) checks.push(`email ${u.payer_email}`);
      const ok = checks.length === 0;
      if (ok) pass++;
      console.log(`${ok ? "PASS" : "FAIL"} ${Date.now() - t0}ms  "${c.say}"  ${ok ? "" : "-> " + checks.join("; ")}`);
    } catch (e) {
      console.log(`ERR  "${c.say}" -> ${(e as Error).message.slice(0, 200)}`);
    }
  }
  console.log(`\n${pass}/${CASES.length} passed`);
}
main();
