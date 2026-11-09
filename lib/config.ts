// Single place for environment-driven settings (provider, model ids, currency, demo flags).
// Everything reads from process.env at call time so scripts and route handlers share it.

export type AppConfig = {
  paypalClientId: string;
  paypalClientSecret: string;
  paypalApiBase: string;
  geminiModel: string;
  geminiFallbackModel: string;
  defaultCurrency: string;
  demoFxUsdEur: number;
  sellerName: string;
  demoMode: boolean;
  timezone: string; // the stall's local day boundaries for "today" and "last Saturday"
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`);
  return value;
}

export function getConfig(): AppConfig {
  return {
    paypalClientId: required("PAYPAL_CLIENT_ID"),
    paypalClientSecret: required("PAYPAL_CLIENT_SECRET"),
    paypalApiBase: process.env.PAYPAL_API_BASE || "https://api-m.sandbox.paypal.com",
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.7-flash",
    geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL || "gemini-3.5-flash",
    defaultCurrency: process.env.DEFAULT_CURRENCY || "USD",
    demoFxUsdEur: Number(process.env.DEMO_FX_USD_EUR || "0.92"),
    sellerName: process.env.SELLER_NAME || "Said & Done",
    demoMode: process.env.DEMO_MODE === "true",
    timezone: process.env.STALL_TIMEZONE || "America/Los_Angeles",
  };
}
