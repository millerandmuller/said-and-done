// Turns one spoken sentence (plus the current draft, so "no, three" works) into a structured intent.
// The model chooses WHAT was said; lib/sale-math.ts decides every price. Primary model first, fallback on error.
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { getConfig } from "./config";
import type { CatalogItem, SaleItem } from "./types";

export const understandingSchema = z.object({
  intent: z
    .enum(["sale", "add_catalog_item", "day_summary", "plan_week", "remind_owing", "unknown"])
    .describe("sale = any sentence that sells, changes or corrects the current sale; the other values are the seller asking for something else"),
  items: z
    .array(
      z.object({
        sku: z.string().nullable().describe("catalog sku that matches what was said, or null if nothing in the catalog matches"),
        name: z.string().nullable().describe("the spoken name, needed when sku is null"),
        qty: z.number().int().min(0).describe("how many; 0 removes the line"),
        custom_price: z.number().nullable().describe("price per unit in dollars if the seller named one ('the chipped one for six'), else null"),
      }),
    )
    .describe("the COMPLETE list of lines after this sentence, including lines kept from the current draft"),
  payment_mode: z.enum(["paypal_qr", "paypal_later", "cash"]).nullable().describe("how the buyer pays; null when not said"),
  currency: z.enum(["USD", "EUR"]).nullable().describe("EUR only when the seller says the buyer pays in euros; else null"),
  payer_email: z.string().nullable().describe("email address if spoken, normalised ('anna at example dot com' -> anna@example.com)"),
  payer_name: z.string().nullable().describe("first name of the buyer if spoken"),
  new_item: z
    .object({ name: z.string(), price: z.number(), aliases: z.array(z.string()) })
    .nullable()
    .describe("only for add_catalog_item: 'I sell 500 g honey for 8 dollars, people call it the big jar'"),
});

export type Understanding = z.infer<typeof understandingSchema>;

export function buildSystemPrompt(catalog: CatalogItem[], draft: SaleItem[], focusSku?: string): string {
  const focus = focusSku ?? draft[0]?.sku;
  const rows = catalog.map((c) => `- sku=${c.sku} | ${c.name} | $${c.price} | people say: ${c.aliases.join(", ")}`).join("\n");
  const current = draft.length ? draft.map((d) => `- sku=${d.sku} | ${d.name} | qty ${d.qty}`).join("\n") : "(empty)";
  return [
    "You are the listening counter of a small market stall. A seller speaks one sentence; you return structured data.",
    "Speech recognition is noisy: expect homophones ('for' for 'four', 'to' for 'two') and missing punctuation.",
    "Never invent prices. Only set custom_price when the seller said an amount for that item.",
    "Match items to the catalog by meaning and aliases. If nothing matches, use sku=null and keep the spoken name.",
    "If a current draft exists and the sentence corrects it ('no, three', 'make that two candles', 'remove the soap', 'and a lip balm'), return the FULL updated list of lines, intent=sale.",
    "A new sale sentence replaces the draft entirely.",
    focus ? `A bare number or 'no, three' with no item name changes the quantity of the FOCUS line, sku=${focus}, and nothing else.` : "",
    "payment_mode: 'by PayPal' / 'she pays by PayPal' -> paypal_qr; 'she pays later' / 'I'll bill her' -> paypal_later; 'cash' -> cash. If the seller did not say how the buyer pays (including every correction like 'no, three'), payment_mode is null: the code keeps the draft's mode or defaults to PayPal.",
    "intent day_summary = 'how did today go'. plan_week = 'what should I bring next week'. remind_owing = 'remind everyone who still owes'. add_catalog_item = the seller defines a new product with a price.",
    "Anything else is intent=unknown with no items: small talk, bystander chatter, thinking aloud ('okay cool good just one second please', 'hold on', 'let me see', 'thanks'). Never invent a sale from chatter.",
    "",
    "CATALOG:",
    rows,
    "",
    "CURRENT DRAFT:",
    current,
  ].join("\n");
}

async function runModel(modelId: string, utterance: string, catalog: CatalogItem[], draft: SaleItem[], focusSku?: string): Promise<Understanding> {
  const { object } = await generateObject({
    model: google(modelId),
    schema: understandingSchema,
    system: buildSystemPrompt(catalog, draft, focusSku),
    prompt: utterance,
    temperature: 0,
    // Thinking off: measured 2 s vs 3.5-5 s with identical parses (the sale schema is not a reasoning task).
    providerOptions: { google: { thinkingConfig: { thinkingBudget: 0 } } },
    abortSignal: AbortSignal.timeout(10000),
  });
  return object;
}

const HEDGE_AFTER_MS = 4000;

// Hedged request: the primary model gets HEDGE_AFTER_MS alone; after that the fallback races it and the first
// success wins. A slow tail on one model must not eat the 20 s sentence-to-QR budget.
export async function understand(utterance: string, catalog: CatalogItem[], draft: SaleItem[], focusSku?: string): Promise<Understanding> {
  const cfg = getConfig();
  const primary = runModel(cfg.geminiModel, utterance, catalog, draft, focusSku);
  const fallback = new Promise<Understanding>((resolve, reject) => {
    const start = () => runModel(cfg.geminiFallbackModel, utterance, catalog, draft, focusSku).then(resolve, reject);
    const timer = setTimeout(start, HEDGE_AFTER_MS);
    // If the primary fails outright, start the fallback immediately instead of waiting for the timer.
    primary.catch(() => { clearTimeout(timer); start(); });
  });
  return Promise.any([primary, fallback]).catch((e: AggregateError) => {
    throw new Error(`Both models failed: ${e.errors.map((x: Error) => x.message).join(" | ").slice(0, 300)}`);
  });
}
