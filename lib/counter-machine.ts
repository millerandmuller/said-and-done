// The seller screen's state machine (brief section 4): idle -> listening -> confirming -> awaiting payment -> paid | cash | later.
// Pure reducer so every transition is unit-testable; side effects (speech, fetch) live in components/Counter.tsx.
import type { Draft } from "./turn";
import type { InvoiceStatus, Sale } from "./types";

export type Phase = "off" | "listening" | "thinking" | "confirming" | "creating" | "awaiting_payment" | "paid" | "cash" | "later";

export type Awaiting = {
  invoice_id: string;
  payer_url: string;
  qr_png_base64?: string;
  status: InvoiceStatus | "MARKED_AS_PAID";
  sale: Sale;
  trace: TraceStep[];
};

export type TraceStep = { tool: string; ms?: number; note?: string };

export type CounterState = {
  phase: Phase;
  transcript: string; // last thing heard, shown live
  sale: Sale | null; // the draft being confirmed
  focusSku?: string;
  awaiting: Awaiting | null;
  message: string; // the line the counter just said / shows (error voice included)
  lastPaid?: { total: number; currency: string };
  lastTrace?: { invoice_id: string; trace: TraceStep[] }; // the proof card on the PAID screen
  // Read-only observations for the "said → done" row (epoch ms): the sale sentence arrived / the first poll that returned PAID.
  saidAt?: number;
  doneAt?: number;
};

export const initialState: CounterState = { phase: "off", transcript: "", sale: null, awaiting: null, message: "" };

export type Action =
  | { type: "start" }
  | { type: "heard"; text: string }
  | { type: "said"; at: number } // the final transcript of a new sale sentence (or the click on a typed sample)
  | { type: "thinking" }
  | { type: "sale_ready"; sale: Sale; speak: string }
  | { type: "say"; message: string } // non-sale reply (summary, plan, error): back to listening with a caption
  | { type: "focus"; sku: string }
  | { type: "reject" }
  | { type: "creating" }
  | { type: "invoice_ready"; awaiting: Awaiting }
  | { type: "status"; status: InvoiceStatus | "MARKED_AS_PAID" }
  | { type: "paid"; total: number; currency: string; at?: number }
  | { type: "cash"; total: number; currency: string }
  | { type: "later"; message: string }
  | { type: "ignore" } // chatter: leave "thinking" without changing the message
  | { type: "done" }; // leave a terminal screen, back to listening

export function reducer(state: CounterState, action: Action): CounterState {
  switch (action.type) {
    case "start":
      return { ...state, phase: "listening", message: "Listening." };
    case "heard":
      return { ...state, transcript: action.text };
    case "said":
      return { ...state, saidAt: action.at, doneAt: undefined };
    case "thinking":
      return { ...state, phase: "thinking" };
    case "sale_ready":
      return { ...state, phase: "confirming", sale: action.sale, message: action.speak, focusSku: keepFocus(state.focusSku, action.sale) };
    case "say": {
      // A reply that is not a sale (summary, plan, error): leave "thinking"/"creating", keep any draft on screen.
      const busy = state.phase === "thinking" || state.phase === "creating";
      const phase = busy ? (state.sale ? "confirming" : "listening") : state.phase;
      return { ...state, phase, message: action.message };
    }
    case "ignore": {
      if (state.phase !== "thinking") return state;
      return { ...state, phase: state.sale ? "confirming" : "listening" };
    }
    case "focus":
      return { ...state, focusSku: action.sku };
    case "reject":
      return { ...state, phase: "listening", sale: null, focusSku: undefined, message: "Listening.", transcript: "", saidAt: undefined, doneAt: undefined };
    case "creating":
      return { ...state, phase: "creating", message: "Making the invoice." };
    case "invoice_ready":
      return { ...state, phase: "awaiting_payment", awaiting: action.awaiting, message: "Show this to pay." };
    case "status":
      return state.awaiting ? { ...state, awaiting: { ...state.awaiting, status: action.status } } : state;
    case "paid":
      return {
        ...state,
        phase: "paid",
        lastPaid: { total: action.total, currency: action.currency },
        lastTrace: state.awaiting ? { invoice_id: state.awaiting.invoice_id, trace: state.awaiting.trace } : undefined,
        doneAt: state.doneAt ?? action.at, // first PAID poll wins
        message: "Paid.",
      };
    case "cash":
      return { ...state, phase: "cash", lastPaid: { total: action.total, currency: action.currency }, message: "Cash. Noted." };
    case "later":
      return { ...state, phase: "later", message: action.message };
    case "done":
      return { ...initialState, phase: "listening", message: "Listening." };
    default:
      return state;
  }
}

const keepFocus = (current: string | undefined, sale: Sale) => (current && sale.items.some((i) => i.sku === current) ? current : sale.items[0]?.sku);

// The draft the server needs for corrections ("no, three").
export function draftOf(state: CounterState): Draft | null {
  const s = state.sale;
  return s ? { items: s.items, currency: s.currency, payment_mode: s.payment_mode, payer_email: s.payer_email, payer_name: s.payer_name } : null;
}
