"use client";
// The seller's counter: wires speech, the server turn API, the invoice API and the polling loop to the state machine.
// Business rules live in lib/ (turn, checkout, sale-math); this file only sequences browser side effects.
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useSpeech } from "@/hooks/useSpeech";
import { playChime, unlockAudio } from "@/lib/chime";
import { draftOf, initialState, reducer } from "@/lib/counter-machine";
import { owing } from "@/lib/day";
import { buildSale, confirmationSentence, setQuantity, spokenAmount } from "@/lib/sale-math";
import type { CheckoutResult } from "@/lib/checkout";
import type { TurnResult } from "@/lib/turn";
import type { LedgerRow } from "@/lib/types";
import { classify, parseQuantity } from "@/lib/voice-commands";
import { CashScreen, ConfirmStage, LaterScreen, ListeningStage, OwesList, PaidScreen, QrScreen, StartScreen } from "./screens";

const POLL_MS = 3000;
const TERMINAL_MS = { paid: 3500, cash: 2500, later: 3200 } as const;

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) }); // a hung request must not freeze the counter
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? res.statusText);
  return json as T;
}

export function Counter({ sellerName }: { sellerName: string }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [tab, setTab] = useState<"counter" | "owes">("counter");
  const [offline, setOffline] = useState(false);
  const [owes, setOwes] = useState<{ rows: LedgerRow[]; loading: boolean; reminding: boolean }>({ rows: [], loading: false, reminding: false });
  const stateRef = useRef(state);
  stateRef.current = state;
  const pendingPrice = useRef<{ original: string; name: string } | null>(null); // "I don't know 'the blue one'. What does it cost?"
  const heardRef = useRef<(text: string) => void>(() => {});
  const rejectTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // a bare "no" waits briefly for "...three"
  const saleKey = useRef<{ sig: string; id: string } | null>(null); // same sale, same key: a retry never makes a second invoice
  const busyRef = useRef(false); // one turn at a time: a second sentence while thinking is ignored

  const speech = useSpeech({
    onFinal: (t) => heardRef.current(t),
    onInterim: (t) => dispatch({ type: "heard", text: t }),
    onError: (m) => dispatch({ type: "say", message: m }),
  });
  const speakRef = useRef(speech.speak);
  speakRef.current = speech.speak;

  const reply = useCallback((message: string) => {
    dispatch({ type: "say", message });
    void speakRef.current(message);
  }, []);

  const runTurn = useCallback(async (text: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    dispatch({ type: "thinking" });
    const pending = pendingPrice.current;
    pendingPrice.current = null;
    const utterance = pending ? `${pending.original}. The ${pending.name} costs ${text}.` : text;
    try {
      const r = await post<TurnResult>("/api/turn", { utterance, draft: pending ? null : draftOf(stateRef.current), focusSku: stateRef.current.focusSku });
      if (r.kind === "sale") {
        dispatch({ type: "sale_ready", sale: r.sale, speak: r.speak });
        void speakRef.current(r.speak);
      } else if (r.kind === "ignored") {
        dispatch({ type: "ignore" }); // bystander chatter: stay silent, the faint transcript already shows what was heard
      } else {
        if (r.kind === "ask_price") pendingPrice.current = { original: utterance, name: r.unknown[0] };
        reply(r.speak);
      }
    } catch (e) {
      console.error(e);
      reply("I didn't catch that.");
    } finally {
      busyRef.current = false;
    }
  }, [reply]);

  const confirm = useCallback(async () => {
    const sale = stateRef.current.sale;
    if (!sale || busyRef.current) return;
    busyRef.current = true;
    dispatch({ type: "creating" });
    try {
      const sig = JSON.stringify(sale);
      if (saleKey.current?.sig !== sig) saleKey.current = { sig, id: crypto.randomUUID() };
      const r = await post<CheckoutResult>("/api/invoice", { sale, saleKey: saleKey.current.id });
      saleKey.current = null;
      if (r.mode === "cash") {
        dispatch({ type: "cash", total: sale.total, currency: sale.currency });
        void speakRef.current("Cash. Noted.");
      } else if (r.mode === "paypal_later") {
        const who = sale.payer_name ?? "the buyer";
        const msg = sale.payer_email ? `Reminder set for ${who}.` : `Noted. ${who} owes ${spokenAmount(sale.total, sale.currency)}.`;
        dispatch({ type: "later", message: msg });
        void speakRef.current(msg);
      } else {
        dispatch({ type: "invoice_ready", awaiting: { invoice_id: r.invoice_id, payer_url: r.payer_url, qr_png_base64: r.qr_png_base64, status: r.status, sale, trace: r.trace } });
      }
    } catch (e) {
      console.error(e);
      reply("PayPal is slow. Keeping your sale on screen. Try again, or say cash.");
    } finally {
      busyRef.current = false;
    }
  }, [reply]);

  const recordCash = useCallback(async () => {
    const a = stateRef.current.awaiting;
    if (!a) return;
    try {
      await post(`/api/invoice/${a.invoice_id}`, { action: "cash", total: a.sale.total, currency: a.sale.currency });
      dispatch({ type: "cash", total: a.sale.total, currency: a.sale.currency });
      void speakRef.current("Cash. Noted.");
    } catch {
      reply("I couldn't record the cash. Try again.");
    }
  }, [reply]);

  const cancelInvoice = useCallback(async () => {
    const a = stateRef.current.awaiting;
    if (!a) return;
    dispatch({ type: "reject" });
    try { await post(`/api/invoice/${a.invoice_id}`, { action: "cancel" }); } catch (e) { console.error("cancel failed", e); }
  }, []);

  const keepForLater = useCallback(() => {
    dispatch({ type: "later", message: "Noted. It stays under Owes." });
    void speakRef.current("Noted. It stays under Owes.");
  }, []);

  // Every finished sentence from the microphone arrives here; state decides what it means.
  heardRef.current = (text: string) => {
    if (!text) return;
    const { phase } = stateRef.current;
    dispatch({ type: "heard", text });
    if (phase === "off" || phase === "thinking" || phase === "creating" || phase === "paid" || phase === "cash" || phase === "later") return;
    const cmd = classify(text);
    if (phase === "awaiting_payment") {
      if (cmd === "cash") void recordCash();
      else if (cmd === "never_mind") void cancelInvoice(); // a bare "no" is ignored here: a buyer saying "no" must not kill a live QR
      else if (cmd === "later") keepForLater();
      return;
    }
    if (phase === "confirming") {
      if (rejectTimer.current) { clearTimeout(rejectTimer.current); rejectTimer.current = null; }
      const qty = parseQuantity(text);
      const focus = stateRef.current.focusSku;
      if (qty !== null && focus) return adjustTo(focus, qty); // "no, three": deterministic, no model round trip
      if (cmd === "yes") return void confirm();
      if (cmd === "never_mind") return dispatch({ type: "reject" });
      // Recognizers often split "no, three" into "no" then "three"; give the number 1.8 s before dropping the sale.
      if (cmd === "no") { rejectTimer.current = setTimeout(() => { rejectTimer.current = null; dispatch({ type: "reject" }); }, 1800); return; }
    }
    void runTurn(text);
  };

  const adjustTo = useCallback((sku: string, qty: number) => {
    const sale = stateRef.current.sale;
    if (!sale) return;
    const items = setQuantity(sale.items, sku, qty);
    if (!items.length) return dispatch({ type: "reject" });
    const next = buildSale(items, sale);
    const sentence = confirmationSentence(next);
    dispatch({ type: "sale_ready", sale: next, speak: sentence });
    void speakRef.current(sentence); // read the corrected sale back so the seller can say "yes"
  }, []);
  const adjust = useCallback((sku: string, delta: number) => {
    const line = stateRef.current.sale?.items.find((i) => i.sku === sku);
    adjustTo(sku, (line?.qty ?? 0) + delta);
  }, [adjustTo]);

  // Polling: one GET per tick, never overlapping; network loss keeps the QR and resumes by itself (brief F9).
  const awaitingId = state.awaiting?.invoice_id;
  useEffect(() => {
    if (!awaitingId || state.phase !== "awaiting_payment") return;
    let inFlight = false;
    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await fetch(`/api/invoice/${awaitingId}`, { cache: "no-store", signal: AbortSignal.timeout(8000) }); // a hung connection must not block later polls
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setOffline(false);
        dispatch({ type: "status", status: json.status });
        const sale = stateRef.current.awaiting?.sale;
        if ((json.status === "PAID" || json.status === "MARKED_AS_PAID") && sale) {
          dispatch({ type: "paid", total: sale.total, currency: sale.currency });
          playChime();
          void speakRef.current(`Paid. ${spokenAmount(sale.total, sale.currency)}.`);
        } else if (json.status === "CANCELLED") {
          dispatch({ type: "reject" });
        }
      } catch {
        setOffline(true);
      } finally {
        inFlight = false;
      }
    };
    const first = setTimeout(tick, 1500);
    const id = setInterval(tick, POLL_MS);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [awaitingId, state.phase]);

  // Terminal screens return to listening on their own.
  useEffect(() => {
    if (state.phase !== "paid" && state.phase !== "cash" && state.phase !== "later") return;
    const t = setTimeout(() => dispatch({ type: "done" }), TERMINAL_MS[state.phase]);
    return () => clearTimeout(t);
  }, [state.phase]);

  // The Owes tab reads PayPal when it opens.
  const loadOwes = useCallback(async () => {
    setOwes((o) => ({ ...o, loading: true }));
    try {
      const res = await fetch("/api/ledger?fresh=1", { cache: "no-store" });
      const json = await res.json();
      setOwes((o) => ({ ...o, rows: owing(json.rows ?? []), loading: false }));
    } catch {
      setOwes((o) => ({ ...o, loading: false }));
    }
  }, []);
  useEffect(() => { if (tab === "owes") void loadOwes(); }, [tab, loadOwes]);

  const remindAll = useCallback(async () => {
    setOwes((o) => ({ ...o, reminding: true }));
    try {
      const r = await post<TurnResult>("/api/turn", { utterance: "remind everyone who still owes", draft: null });
      if (r.kind === "ignored") return;
      dispatch({ type: "say", message: r.speak });
      void speakRef.current(r.speak);
    } catch {
      reply("I couldn't send the reminders.");
    } finally {
      setOwes((o) => ({ ...o, reminding: false }));
    }
  }, [reply]);

  const start = () => { unlockAudio(); speech.start(); dispatch({ type: "start" }); };
  const [typed, setTyped] = useState("");

  const { phase } = state;
  const busy = phase === "creating";
  return (
    <div className="shell">
      <header className="topbar"><b>{sellerName}</b><span className="sandbox">PayPal sandbox</span></header>

      {phase === "awaiting_payment" && state.awaiting && (
        <QrScreen awaiting={state.awaiting} offline={offline} onCash={recordCash} onLater={keepForLater} onCancel={cancelInvoice} />
      )}
      {phase === "paid" && state.lastPaid && <PaidScreen {...state.lastPaid} proof={state.lastTrace} />}
      {phase === "cash" && state.lastPaid && <CashScreen {...state.lastPaid} />}
      {phase === "later" && <LaterScreen message={state.message} />}

      {tab === "counter" && (phase === "awaiting_payment" || phase === "paid" || phase === "cash" || phase === "later") ? null : tab === "owes" ? (
        <OwesList rows={owes.rows} loading={owes.loading} reminding={owes.reminding} onRemind={remindAll} />
      ) : phase === "off" ? (
        <StartScreen onStart={start} />
      ) : (phase === "confirming" || phase === "creating") && state.sale ? (
        <ConfirmStage sale={state.sale} focusSku={state.focusSku} message={state.message} busy={busy}
          onFocus={(sku) => dispatch({ type: "focus", sku })} onAdjust={adjust} onYes={confirm} onNo={() => dispatch({ type: "reject" })} />
      ) : (
        <ListeningStage transcript={state.transcript} message={state.message} thinking={phase === "thinking"} live={speech.listening} />
      )}

      {!speech.supported && phase !== "off" && (
        <form className="kb" onSubmit={(e) => { e.preventDefault(); heardRef.current(typed); setTyped(""); }}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Keyboard mode: type what you would say" aria-label="Keyboard mode" />
          <button className="btn" type="submit">Send</button>
        </form>
      )}

      <nav className="tabs" aria-label="Sections">
        <button className={`tab ${tab === "counter" ? "on" : ""}`} onClick={() => setTab("counter")}>Counter</button>
        <button className={`tab ${tab === "owes" ? "on" : ""}`} onClick={() => setTab("owes")}>Owes</button>
        <a className="tab" href="/ledger">Books</a>
      </nav>
    </div>
  );
}
