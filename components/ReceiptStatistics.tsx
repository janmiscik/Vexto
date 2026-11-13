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
  const merchants = Object.values(receipts.reduce<Record<string, { name: string; amount: number; count: number }>>((groups, receipt) => {
    const name = receipt.organizationName?.trim() || "Neznámy obchodník";
    const key = name.toLocaleLowerCase("sk-SK");
    const value = Number(receipt.totalAmount);
    if (!groups[key]) groups[key] = { name, amount: 0, count: 0 };
    groups[key].amount += Number.isFinite(value) ? value : 0;
    groups[key].count += 1;
    return groups;
  }, {})).sort((a, b) => b.amount - a.amount).slice(0, 5);
  const merchantMaximum = Math.max(0, ...merchants.map((merchant) => merchant.amount));

  // Only use itemized VAT data actually present on receipts.
  const vatGroups = new Map<number, { base: number; vat: number; count: number }>();
  let withoutVatBreakdown = 0;
  for (const receipt of receipts) {
    const entries = (receipt.vatAmounts ?? []).filter((entry) =>
      entry && typeof entry.vatRate === "number" && Number.isFinite(entry.vatRate) &&
      typeof entry.baseAmount === "number" && Number.isFinite(entry.baseAmount) &&
      typeof entry.vatAmount === "number" && Number.isFinite(entry.vatAmount)
    );
    if (!entries.length) {
      withoutVatBreakdown += 1;
      continue;
    }
    const ratesInReceipt = new Set<number>();
    for (const entry of entries) {
      const rate = entry.vatRate;
      const group = vatGroups.get(rate) ?? { base: 0, vat: 0, count: 0 };
      group.base += entry.baseAmount;
      group.vat += entry.vatAmount;
      vatGroups.set(rate, group);
      ratesInReceipt.add(rate);
    }
    for (const rate of ratesInReceipt) vatGroups.get(rate)!.count += 1;
  }
  const vatSummary = [...vatGroups.entries()].sort(([a], [b]) => a - b);


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
      <h3 className="mb-3 mt-6 text-sm font-semibold text-neutral-800">Top 5 obchodníkov podľa výdavkov</h3>
      {merchants.length === 0 ? (
        <p className="text-sm text-neutral-500">Zatiaľ nemáš uložené žiadne doklady.</p>
      ) : (
        <div className="space-y-3">
          {merchants.map((merchant) => (
            <div key={merchant.name.toLocaleLowerCase("sk-SK")}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                <span className="min-w-0 break-words font-medium text-neutral-800">{merchant.name}</span>
                <span className="shrink-0 text-neutral-600">{money(merchant.amount)} · {merchant.count} {merchant.count === 1 ? "doklad" : merchant.count < 5 ? "doklady" : "dokladov"}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                <div className="h-full rounded-full bg-emerald-600" style={{ width: `${merchantMaximum > 0 ? Math.max(0, (merchant.amount / merchantMaximum) * 100) : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="mb-3 mt-6 text-sm font-semibold text-neutral-800">Prehľad DPH</h3>
      {vatSummary.length === 0 ? (
        <p className="text-sm text-neutral-500">Zatiaľ nie sú dostupné údaje o rozpisanej DPH.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-200 text-neutral-500">
              <tr><th className="py-2 pr-2">Sadzba</th><th className="py-2 pr-2 text-right">Základ</th><th className="py-2 pr-2 text-right">DPH</th><th className="py-2 text-right">Spolu</th></tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {vatSummary.map(([rate, group]) => (
                <tr key={rate} title={`Dokladov s touto sadzbou: ${group.count}`}>
                  <td className="py-2 pr-2 font-medium text-neutral-800">{rate} %</td>
                  <td className="py-2 pr-2 text-right text-neutral-700">{money(group.base)}</td>
                  <td className="py-2 pr-2 text-right text-neutral-700">{money(group.vat)}</td>
                  <td className="py-2 text-right font-medium text-neutral-800">{money(group.base + group.vat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-neutral-500">Doklady bez rozpisu DPH: {withoutVatBreakdown}. Zobrazené sú len dostupné údaje, bez odhadovania. Jeden doklad môže obsahovať viac sadzieb. Prehľad nie je daňovým priznaním.</p>
    </section>
  );
}
