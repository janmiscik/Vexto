"use client";

import { useSyncExternalStore } from "react";
import type { ParsedReceipt } from "@/lib/receipts-storage";
import { BarChart3 } from "lucide-react";

type Props = { receipts: ParsedReceipt[] };

const money = (value: number) =>
  new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(value);

const subscribe = () => () => {};
const getCurrentMonth = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};
const getServerMonth = () => "";

export default function ReceiptStatistics({ receipts }: Props) {
  const currentMonth = useSyncExternalStore(subscribe, getCurrentMonth, getServerMonth);
  const total = receipts.reduce((sum, receipt) => sum + (Number.isFinite(Number(receipt.totalAmount)) ? Number(receipt.totalAmount) : 0), 0);
  const average = receipts.length ? total / receipts.length : 0;
  const months = currentMonth ? Array.from({ length: 6 }, (_, index) => {
    const [year, month] = currentMonth.split("-").map(Number);
    const monthDate = new Date(year, month - 1 - (5 - index), 1);
    const key = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;
    const amount = receipts.reduce((sum, receipt) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(receipt.issueDate || "") || receipt.issueDate.slice(0, 7) !== key) return sum;
      const value = Number(receipt.totalAmount);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);
    return { key, label: new Intl.DateTimeFormat("sk-SK", { month: "short" }).format(monthDate), amount };
  }) : [];
  const maximum = Math.max(...months.map((month) => month.amount), 0);

  return (
    <section className="rounded-2xl border border-neutral-100 bg-white p-5 shadow-sm" aria-label="Štatistiky výdavkov">
      <h2 className="mb-4 flex items-center gap-2 text-base font-bold text-neutral-900">
        <BarChart3 className="h-4 w-4 text-emerald-600" /> Prehľad výdavkov
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-neutral-50 p-3">
          <p className="text-xs text-neutral-500">Počet dokladov</p>
          <p className="mt-1 text-lg font-bold text-neutral-900">{receipts.length}</p>
        </div>
        <div className="rounded-xl bg-neutral-50 p-3">
          <p className="text-xs text-neutral-500">Celkové výdavky</p>
          <p className="mt-1 text-lg font-bold text-neutral-900">{money(total)}</p>
        </div>
        <div className="rounded-xl bg-neutral-50 p-3">
          <p className="text-xs text-neutral-500">Priemerný doklad</p>
          <p className="mt-1 text-lg font-bold text-neutral-900">{money(average)}</p>
        </div>
      </div>
      <h3 className="mb-2 mt-5 text-sm font-semibold text-neutral-800">Posledných 6 mesiacov</h3>
      <div className="grid grid-cols-6 items-end gap-2" role="img" aria-label={`Mesačné výdavky: ${months.map((m) => `${m.key}: ${money(m.amount)}`).join(", ")}`}>
        {months.map((month) => (
          <div key={month.key} className="flex min-w-0 flex-col items-center gap-1">
            <span className="max-w-full truncate text-[10px] text-neutral-600" title={money(month.amount)}>{money(month.amount)}</span>
            <div className="flex h-28 w-full items-end rounded-md bg-neutral-50 px-1 pb-1">
              <div className="w-full rounded-t bg-emerald-600" style={{ height: maximum > 0 ? `${Math.max(month.amount > 0 ? 4 : 0, (month.amount / maximum) * 100)}%` : "0%" }} />
            </div>
            <span className="text-[11px] text-neutral-500">{month.label}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-neutral-500">Graf zahŕňa doklady s platným dátumom v uvedenom období. Súhrn zahŕňa všetky uložené doklady.</p>
    </section>
  );
}
