# Said & Done

**Say the sale. Show the code. Get paid.**

At a market stall nobody has a free hand. Said & Done is the seller's counter that listens: the seller says
"two jars of honey and the big candle, she pays by PayPal", the app turns it into a PayPal invoice with a QR code,
the buyer pays on their own phone, and the screen turns green. It also handles cash, pay-later regulars with reminders,
new catalog items by voice, and a spoken end-of-day summary with a plain ledger.

Everything runs against the **PayPal sandbox**. No real money moves.

**Try it without installing anything:** https://said-and-done-ten.vercel.app (sandbox buyer credentials for judges are in the Devpost testing instructions; the "Try this sentence" button reaches the QR screen without a microphone).
Source: https://github.com/millerandmuller/said-and-done, MIT, 18 commits during the event, 113 tests.

**Who it is for:** the person behind a market or craft-fair table, hands full of jars or candles, who takes cash or a payment app today and wants to say the sale out loud and keep the day's books without typing. Market size: [USDA's National Farmers Market Directory listed 8,771 markets in its last published national count (2019)](https://www.ams.usda.gov/sites/default/files/media/NationalCountofFarmersMarketDirectoryListings082019.pdf).

**What is different:** Unlike PayPal Zettle or Square POS, which are built around a card reader and a catalog you set up by tapping, Said & Done takes the sale by voice, prices every line in code, not in the model, and keeps the books in the same place.

## What uses PayPal and AI

| Step | What runs |
|---|---|
| Sale understood | Gemini (`gemini-3.7-flash` via Vercel AI SDK) turns the sentence into items and quantities. Code, not the model, prices every line. |
| Invoice | PayPal Agent Toolkit tools `create_invoice`, `send_invoice` (share link, no email), `generate_invoice_qr_code` |
| Payment detected | `get_invoice` polled every 3 s until `PAID` |
| Cash | `record_payment_for_invoice` (method CASH) |
| Pay later and reminders | `send_invoice` with email, `send_invoice_reminder`, `cancel_sent_invoice` for "never mind" |
| Catalog by voice | `create_product`, `list_products` |
| Books | `list_invoices` and `get_invoice`, shown with AG Grid Community |

Not used, on purpose: `list_transactions` (returns 403 for sandbox apps here) and `get_merchant_insights`
(not supported in sandbox). End-of-day numbers are computed from invoices.

## Run it

```bash
npm install
cp .env.example .env.local   # fill in the values, see below
npm run seed                 # curated demo history in the sandbox (idempotent)
npm run dev                  # http://localhost:3000 in Chrome
```

Use **Chrome** (speech recognition). Tap the microphone once to open the counter, then talk. Without speech support a
labelled keyboard mode appears.

Environment (`.env.example`): PayPal sandbox `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`, `GOOGLE_GENERATIVE_AI_API_KEY`
(Gemini), `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, currency and seller name.

### Try it

1. Say: "two jars of honey and the big candle, she pays by PayPal". The chips appear and the counter reads them back.
2. Say "yes". A QR fills the screen.
3. Scan it with a phone and pay as the sandbox buyer (below). The seller screen turns green.
4. Other sentences: "three small candles and a lip balm, cash" · "one gift box, she pays later, her name is Anna and her
   email is anna at example dot com" · "no, three" (correct a quantity) · "she pays in euros" · "how did today go" ·
   "what should I bring next week" · "remind everyone who still owes" · "I sell lavender sachets for four dollars,
   people call them smellies". The **Books** tab opens the AG Grid ledger.

### Sandbox accounts

- Seller (business): `sb-zdpon53797977@business.example.com`
- Buyer (personal): `sb-otb43o53811890@personal.example.com`
- Passwords: **provided to judges in the Devpost testing instructions** (not committed).

Log in at https://www.sandbox.paypal.com/ on the phone that scans the QR.

## Honesty notes

- **Curated history:** the "earlier today" and "last Saturday" sales, and the pay-later regular, are seeded sandbox
  invoices (`npm run seed`) with an external payment recorded. They are labelled "Curated history" in the ledger.
  Every sale made live in the demo is a real sandbox payment.
- **Test invoices:** the sandbox account also holds invoices created while the app was being tested and reviewed. Nothing is
  hidden: the books open on Today, and "All days" shows every invoice.
- Sandbox only. No production credentials anywhere.
- No webhooks: payment status is polled.

## Built with

PayPal Agent Toolkit (`@paypal/agent-toolkit`) and PayPal Invoicing, Gemini, Vercel AI SDK, Next.js, AG Grid Community,
Vercel.

## Tests

```bash
npm test            # unit tests for sale math, catalog, day logic, ledger mapping, voice commands, state machine
npm run eval:parser # 12 scripted sentences against Gemini
```

## License

MIT
