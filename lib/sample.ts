// Typed samples offered on the listening screen for judges without a microphone.
// Shared by the listening screen (labels), the counter (feeds each into the same turn path as speech) and tests.
export const SAMPLE_SENTENCE = "two jars of honey and the big candle, she pays by PayPal";

// The sandbox buyer the seed script uses for the pay-later regular (same address as the README's buyer account),
// so every judge click lands on the same known name under Owes.
export const SANDBOX_BUYER_EMAIL = "sb-otb43o53811890@personal.example.com";

export const SAMPLE_CASH = "three small candles, cash";
export const SAMPLE_LATER = `one gift box, she pays later, her name is Anna and her email is ${SANDBOX_BUYER_EMAIL}`;
export const SAMPLE_SUMMARY = "how did today go";

export type Sample = { id: "hero" | "cash" | "later" | "summary"; label: string; sentence: string; shown: string };

// `shown` is the quoted text on the pill; it equals the sentence, except the long pay-later one shows its label only
// (the full sentence is the tooltip and appears as the heard transcript after the click). This keeps four pills in one row at 1201 px.
export const SAMPLES: Sample[] = [
  { id: "hero", label: "Try this sentence", sentence: SAMPLE_SENTENCE, shown: SAMPLE_SENTENCE },
  { id: "cash", label: "Cash", sentence: SAMPLE_CASH, shown: SAMPLE_CASH },
  { id: "later", label: "Pay later", sentence: SAMPLE_LATER, shown: "" },
  { id: "summary", label: "The day", sentence: SAMPLE_SUMMARY, shown: SAMPLE_SUMMARY },
];

export const SAMPLES_CAPTION = "Typed samples for judges without a microphone. The sale samples create real sandbox invoices.";
