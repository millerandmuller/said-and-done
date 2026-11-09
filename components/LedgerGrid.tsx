"use client";
// The books: a plain bookkeeper's table (AG Grid Community). Deliberately not a chart wall.
import { AllCommunityModule, ModuleRegistry, type ColDef } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { useEffect, useMemo, useState } from "react";
import { byItem, byMethod, toLines, totalOfRows, type LineRow, type RollupRow } from "@/lib/ledger-view";
import { formatMoney } from "@/lib/format";
import type { LedgerRow } from "@/lib/types";

ModuleRegistry.registerModules([AllCommunityModule]);

const money = (p: { value: number }) => formatMoney(p.value ?? 0, "USD");

const rollupCols = (first: string): ColDef<RollupRow>[] => [
  { field: "label", headerName: first, flex: 2 },
  { field: "qty", headerName: "Units", flex: 1 },
  { field: "sales", headerName: "Sales", flex: 1 },
  { field: "amount", headerName: "Amount", flex: 1.2, valueFormatter: money },
];

const lineCols: ColDef<LineRow>[] = [
  { field: "day", headerName: "Day", flex: 1.2, sort: "desc", filter: true },
  { field: "item", headerName: "Item", flex: 2, filter: true },
  { field: "qty", headerName: "Qty", flex: 0.7 },
  { field: "amount", headerName: "Amount", flex: 1, valueFormatter: money },
  { field: "method", headerName: "Method", flex: 1, filter: true },
  { field: "status", headerName: "Status", flex: 1.3, filter: true },
  { field: "payer", headerName: "Payer", flex: 1.6 },
  { field: "curated", headerName: "Curated history", flex: 1, valueFormatter: (p) => (p.value ? "yes" : "") },
  { field: "invoice_id", headerName: "PayPal invoice", flex: 2 },
];

export function LedgerGrid({ tz, fx }: { tz: string; fx: number }) {
  const [rows, setRows] = useState<LedgerRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const res = await fetch("/api/ledger?fresh=1", { cache: "no-store" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        if (live) { setRows(json.rows); setError(""); }
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    };
    void load();
    const id = setInterval(load, 15000);
    return () => { live = false; clearInterval(id); };
  }, []);

  const lines = useMemo(() => (rows ? toLines(rows, tz, fx) : []), [rows, tz, fx]);
  const total = rows ? totalOfRows(rows, fx) : 0;

  return (
    <main className="books">
      <header className="books-head">
        <a href="/" className="back">← Counter</a>
        <h1>The books</h1>
        <p>{rows ? `${new Set(lines.map((l) => l.invoice_id)).size} paid sales · ${formatMoney(total, "USD")}` : error || "Reading PayPal."}</p>
      </header>
      <section className="books-rollups">
        <div className="grid-small"><AgGridReact<RollupRow> rowData={byItem(lines)} columnDefs={rollupCols("By item")} domLayout="autoHeight" /></div>
        <div className="grid-small"><AgGridReact<RollupRow> rowData={byMethod(lines)} columnDefs={rollupCols("By method")} domLayout="autoHeight" /></div>
      </section>
      <div className="grid-big">
        <AgGridReact<LineRow> rowData={lines} columnDefs={lineCols} defaultColDef={{ sortable: true, resizable: true }} />
      </div>
      <p className="books-note">Every row is a PayPal sandbox invoice. “Curated history” rows are seeded sales labelled as earlier days; all live sales are marked “no”.</p>
    </main>
  );
}
