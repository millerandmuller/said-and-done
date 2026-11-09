// Invoice status groups, in their own file so client code can use them without importing any server-only module.
import type { InvoiceStatus } from "./types";

export const PAID_STATES: InvoiceStatus[] = ["PAID", "MARKED_AS_PAID"];
export const OWING_STATES: InvoiceStatus[] = ["UNPAID", "SENT", "PAYMENT_PENDING", "PARTIALLY_PAID"];
