export function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: Number.isInteger(amount) ? 0 : 2 }).format(amount);
}

/** Whole seconds under a minute ("41 s"), minutes and seconds from 60 s ("1 min 38 s"). The row on the PAID card, as measured. */
export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;
  return `${Math.floor(total / 60)} min ${total % 60} s`;
}

/** "said → done 41 s (buyer login included)", or null when either stamp is missing or the clock ran backwards. */
export function saidToDoneRow(saidAt?: number, doneAt?: number): string | null {
  if (saidAt === undefined || doneAt === undefined || doneAt < saidAt) return null;
  return `said → done ${formatElapsed((doneAt - saidAt) / 1000)} (buyer login included)`;
}
