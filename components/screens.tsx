// Presentational screens for the counter. No fetching and no speech in here: props in, markup out.
import type { Awaiting, TraceStep } from "@/lib/counter-machine";
import { formatMoney } from "@/lib/format";
import type { LedgerRow, Sale } from "@/lib/types";

const MicIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12h-2Z" /></svg>
);

export function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="stage">
      <button className="mic" onClick={onStart} aria-label="Start the counter"><MicIcon /></button>
      <p className="line">Tap once to open the counter.</p>
      <p className="sub">After that, just talk.</p>
    </div>
  );
}

export function ListeningStage({ transcript, message, thinking, live }: { transcript: string; message: string; thinking: boolean; live: boolean }) {
  return (
    <div className="stage">
      <div className={`mic ${live && !thinking ? "live" : ""}`} aria-hidden="true"><MicIcon /></div>
      <p className="line">{thinking ? "One moment." : message || "Listening."}</p>
      <p className="sub" aria-live="polite">{transcript ? `“${transcript}”` : ""}</p>
      {!thinking && <p className="hint">Try: <em>two jars of honey and the big candle, she pays by PayPal</em></p>}
    </div>
  );
}

export function ConfirmStage(props: {
  sale: Sale; focusSku?: string; message: string; busy: boolean;
  onFocus: (sku: string) => void; onAdjust: (sku: string, delta: number) => void; onYes: () => void; onNo: () => void;
}) {
  const { sale, focusSku, busy } = props;
  return (
    <div className="stage">
      <div className="chips">
        {sale.items.map((i) => (
          <div key={i.sku} className={`chip ${i.sku === focusSku ? "focus" : ""}`} onClick={() => props.onFocus(i.sku)}>
            <span className="qty">{i.qty}×</span> <span>{i.name}</span> <span className="price">{formatMoney(i.unit_price * i.qty, sale.currency)}</span>
            {i.sku === focusSku && (
              <span className="stepper">
                <button aria-label={`One less ${i.name}`} onClick={(e) => { e.stopPropagation(); props.onAdjust(i.sku, -1); }}>−</button>
                <button aria-label={`One more ${i.name}`} onClick={(e) => { e.stopPropagation(); props.onAdjust(i.sku, 1); }}>+</button>
              </span>
            )}
          </div>
        ))}
      </div>
      <p className="total">{formatMoney(sale.total, sale.currency)}</p>
      <p className="sub">{sale.payment_mode === "cash" ? "Cash sale." : sale.payment_mode === "paypal_later" ? `Pay later${sale.payer_name ? ` · ${sale.payer_name}` : ""}.` : "Pays by PayPal."} Say “yes”.</p>
      <div className="actions">
        <button className="btn" disabled={busy} onClick={props.onYes}>{busy ? "Making the invoice." : "Yes"}</button>
        <button className="btn ghost" disabled={busy} onClick={props.onNo}>No</button>
      </div>
    </div>
  );
}

export function QrScreen(props: { awaiting: Awaiting; offline: boolean; notice: string; onCash: () => void; onLater: () => void; onCancel: () => void }) {
  const { awaiting, offline } = props;
  const pending = awaiting.status === "PAYMENT_PENDING";
  return (
    <div className="full qr">
      <p className="total">{formatMoney(awaiting.sale.total, awaiting.sale.currency)}</p>
      {awaiting.qr_png_base64 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="qr-img" alt="PayPal invoice QR code" src={`data:image/png;base64,${awaiting.qr_png_base64}`} />
      ) : (
        <div className="qr-fallback">Open this link to pay:<br />{awaiting.payer_url}</div>
      )}
      <p className="sub">{pending ? "" : props.notice || "Show this to pay."}</p>
      {pending && <span className="status-pending">Almost there.</span>}
      {offline && <span className="status-pending">No connection. Cash?</span>}
      <div className="actions">
        <button className="btn cash" onClick={props.onCash}>Cash</button>
        <button className="btn" onClick={props.onLater}>Later</button>
        <button className="btn" onClick={props.onCancel}>Never mind</button>
      </div>
      <ProofTrace awaiting={awaiting} />
      <ProofCard invoiceId={awaiting.invoice_id} trace={awaiting.trace} from="UNPAID" to={awaiting.status} />
    </div>
  );
}

// The Proof beat: which PayPal Agent Toolkit tools ran, and the invoice lifecycle.
export function ProofTrace({ awaiting }: { awaiting: Awaiting }) {
  return (
    <div className="proof" aria-label="PayPal tool calls">
      {awaiting.trace.map((t) => (
        <div key={t.tool}><span className="ok">✓</span> {t.tool}{t.ms !== undefined ? ` · ${t.ms} ms` : ""}</div>
      ))}
      <div>… get_invoice · {awaiting.invoice_id} · {awaiting.status === "UNPAID" ? "UNPAID" : `UNPAID → ${awaiting.status}`}</div>
      <div>sandbox</div>
    </div>
  );
}

// The readable proof card (legible in a 1080p recording, unlike the small log): tool names, timings, invoice status change.
export function ProofCard({ invoiceId, trace, from, to }: { invoiceId: string; trace: TraceStep[]; from: string; to: string }) {
  const changed = to !== from;
  return (
    <aside className="proof-card" aria-label="PayPal Agent Toolkit proof">
      <h2>PayPal Agent Toolkit · sandbox</h2>
      <ul>
        {trace.map((t) => (
          <li key={t.tool}><span className="ok">✓</span> {t.tool}{t.ms !== undefined && <span className="ms">{t.ms} ms</span>}</li>
        ))}
        <li><span className="ok">✓</span> get_invoice<span className="ms">polled</span></li>
      </ul>
      <p className="flip">{invoiceId}</p>
      <p className="flip big">{changed ? `${from} → ${to}` : `${from} · waiting`}</p>
    </aside>
  );
}

export function PaidScreen({ total, currency, proof }: { total: number; currency: string; proof?: { invoice_id: string; trace: TraceStep[] } }) {
  return (
    <div className="full paid" role="status">
      <p className="total">{formatMoney(total, currency)}</p>
      <p className="line" style={{ color: "#fff" }}>Paid.</p>
      {proof && <ProofCard invoiceId={proof.invoice_id} trace={proof.trace} from="UNPAID" to="PAID" />}
    </div>
  );
}

export function CashScreen({ total, currency }: { total: number; currency: string }) {
  return (
    <div className="full cashed" role="status">
      <p className="total">{formatMoney(total, currency)}</p>
      <p className="line" style={{ color: "#fff" }}>Cash. Noted.</p>
    </div>
  );
}

export function LaterScreen({ message }: { message: string }) {
  return (
    <div className="full later" role="status">
      <p className="line" style={{ color: "#fff" }}>{message}</p>
    </div>
  );
}

export function OwesList({ rows, loading, onRemind, reminding }: { rows: LedgerRow[]; loading: boolean; onRemind: () => void; reminding: boolean }) {
  return (
    <div className="stage">
      <div className="owes">
        {loading && <p className="sub">Checking PayPal.</p>}
        {!loading && rows.length === 0 && <p className="line">Nobody owes you anything.</p>}
        {rows.map((r) => (
          <div className="owe" key={r.invoice_id}>
            <span>{r.payer && !r.payer.includes("@") ? r.payer : r.payer ?? "Open invoice"}<small>{r.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}{r.payer_email ? "" : " · no email"}</small></span>
            <span className="amber-text">{formatMoney(r.total, r.currency)}</span>
          </div>
        ))}
      </div>
      {rows.length > 0 && <button className="btn amber" disabled={reminding} onClick={onRemind}>{reminding ? "Sending." : "Remind everyone"}</button>}
    </div>
  );
}
