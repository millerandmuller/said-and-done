// Thin wrapper around the PayPal Agent Toolkit (Vercel AI SDK adapter).
// The toolkit is the primary way this app talks to PayPal: invoices, catalog and reporting
// all go through its tools. Only verbs the toolkit lacks use lib/paypal-rest.ts.
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { getConfig } from "./config";

type ToolMap = ReturnType<PayPalAgentToolkit["getTools"]>;

let cached: { toolkit: PayPalAgentToolkit; tools: ToolMap } | null = null;

function getToolkit() {
  if (cached) return cached;
  const cfg = getConfig();
  const toolkit = new PayPalAgentToolkit({
    clientId: cfg.paypalClientId,
    clientSecret: cfg.paypalClientSecret,
    configuration: {
      actions: {
        invoices: { create: true, list: true, get: true, send: true, sendReminder: true, generateQRC: true, recordPayment: true, cancel: true },
        products: { create: true, list: true, show: true },
        transactions: { list: true },
        insights: { get: true },
      },
      context: { sandbox: true },
    },
  });
  cached = { toolkit, tools: toolkit.getTools() };
  return cached;
}

export class ToolkitError extends Error {
  constructor(public tool: string, message: string) {
    super(`PayPal toolkit tool ${tool} failed: ${message}`);
  }
}

// Calls one toolkit tool directly (no model in the loop: the money path stays deterministic).
// Toolkit tools return a JSON string, or a plain error string; both are normalised here.
export async function callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const tool = getToolkit().tools[name];
  if (!tool || !tool.execute) throw new ToolkitError(name, "tool is not enabled in the toolkit configuration");
  const raw = await tool.execute(args, { toolCallId: `${name}-${Date.now()}`, messages: [] });
  const text = typeof raw === "string" ? raw : JSON.stringify(raw);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ToolkitError(name, text.slice(0, 500));
  }
}
