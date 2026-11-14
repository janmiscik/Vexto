"use client";

import type { ParsedReceipt } from "@/lib/receipts-storage";
import { X } from "lucide-react";

type ReceiptEditorProps = {
  editingReceipt: ParsedReceipt;
  savingEdit: boolean;
  imageUrl: string | null;
  imageError: boolean;
  onChange: (receipt: ParsedReceipt) => void;
  onClose: () => void;
  onSave: () => void;
};

const euro = (value: number) => new Intl.NumberFormat("sk-SK", { style: "currency", currency: "EUR" }).format(value);
const roundCents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export default function ReceiptEditor({
  editingReceipt, savingEdit, imageUrl, imageError,
  onChange, onClose, onSave,
}: ReceiptEditorProps) {
  const vatRows = editingReceipt.vatAmounts ?? [];
  const changeVat = (index: number, field: "vatRate" | "baseAmount" | "vatAmount", value: string) => {
    const next = vatRows.map((row, i) => i === index ? { ...row, [field]: value.trim() === "" ? NaN : Number(value) } : row);
    onChange({ ...editingReceipt, vatAmounts: next });
  };
  const validVat = vatRows.every((row) =>
    Number.isFinite(row.vatRate) && row.vatRate >= 0 && row.vatRate <= 100 &&
    Number.isFinite(row.baseAmount) && row.baseAmount >= 0 &&
    Number.isFinite(row.vatAmount) && row.vatAmount >= 0
  );
  const vatTotal = vatRows.reduce((sum, row) => sum + row.baseAmount + row.vatAmount, 0);
  const difference = roundCents(vatTotal - editingReceipt.totalAmount);
  const hasMismatch = vatRows.length > 0 && validVat && Number.isFinite(difference) && Math.abs(difference) >= 0.01;

  return (
    <section className="bg-white rounded-2xl p-5 border border-emerald-200 shadow-sm space-y-4" aria-label="Detail uloženého dokladu">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold">Detail a úprava dokladu</h2>
        <button type="button" onClick={onClose} aria-label="Zavrieť detail" className="p-2 rounded-lg hover:bg-neutral-100"><X className="w-4 h-4" /></button>
      </div>
      {editingReceipt.imagePath && (
        <div className="rounded-xl border border-neutral-200 p-3 space-y-2">
          <p className="text-xs font-semibold text-neutral-700">Fotografia dokladu</p>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="Originál fotografie dokladu" className="max-h-96 w-full object-contain rounded-lg" />
          ) : imageError ? (
            <p className="text-xs text-red-600">Fotografiu sa nepodarilo načítať.</p>
          ) : (
            <p className="text-xs text-neutral-500">Načítavam fotografiu...</p>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {([
          ["organizationName", "Predajca"], ["ico", "IČO"], ["dic", "DIČ"], ["icDph", "IČ DPH"],
        ] as const).map(([key, label]) => (
          <label key={key} className="block text-xs font-medium text-neutral-700">
            {label}
            <input type="text" value={editingReceipt[key] || ""}
              onChange={(e) => onChange({ ...editingReceipt, [key]: e.target.value })}
              className="mt-1 w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2" />
          </label>
        ))}
        <label className="block text-xs font-medium text-neutral-700">
          Dátum
          <input type="date" value={(editingReceipt.issueDate || "").slice(0, 10)}
            onChange={(e) => onChange({ ...editingReceipt, issueDate: e.target.value })}
            className="mt-1 w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2" />
        </label>
        <label className="block text-xs font-medium text-neutral-700">
          Suma spolu (€)
          <input type="number" min="0" step="0.01" value={Number.isNaN(editingReceipt.totalAmount) ? "" : editingReceipt.totalAmount}
            onChange={(e) => onChange({ ...editingReceipt, totalAmount: e.target.value === "" ? NaN : Number(e.target.value) })}
            className="mt-1 w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2" />
        </label>
      </div>

      <div className="rounded-xl border border-neutral-200 p-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-neutral-800">Rozpis DPH</h3>
          <button type="button" disabled={savingEdit} onClick={() => onChange({ ...editingReceipt, vatAmounts: [...vatRows, { vatRate: 0, baseAmount: 0, vatAmount: 0 }] })}
            className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">+ Pridať sadzbu</button>
        </div>
        {vatRows.length === 0 && <p className="text-xs text-neutral-500">Doklad zatiaľ nemá rozpis DPH. Údaje môžeš doplniť ručne.</p>}
        {vatRows.map((row, index) => (
          <div key={index} className="rounded-lg bg-neutral-50 p-3 space-y-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {([
                ["vatRate", "Sadzba DPH (%)"], ["baseAmount", "Základ dane (€)"], ["vatAmount", "DPH (€)"],
              ] as const).map(([field, label]) => (
                <label key={field} className="block text-xs font-medium text-neutral-700">
                  {label}
                  <input type="number" min="0" max={field === "vatRate" ? "100" : undefined} step="0.01"
                    value={Number.isNaN(row[field]) ? "" : row[field]}
                    onChange={(e) => changeVat(index, field, e.target.value)}
                    className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm" />
                </label>
              ))}
            </div>
            <div className="flex justify-end">
              <button type="button" disabled={savingEdit} onClick={() => onChange({ ...editingReceipt, vatAmounts: vatRows.filter((_, i) => i !== index) })}
                className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50">Odstrániť sadzbu</button>
            </div>
          </div>
        ))}
        {vatRows.length > 0 && (
          <div className="space-y-1 text-xs text-neutral-700" aria-live="polite">
            <p>Súčet základov a DPH: <strong>{validVat ? euro(vatTotal) : "Neplatné hodnoty"}</strong></p>
            {!validVat && <p className="text-red-600">V rozpise DPH sú neplatné alebo prázdne hodnoty. Oprav ich pred uložením.</p>}
            {hasMismatch && (
              <div role="alert" className="rounded-lg border border-red-500 bg-red-50 p-3 text-sm font-semibold text-red-700">
                Nesúlad DPH: súčet základu dane a DPH je {euro(vatTotal)}, ale suma dokladu je {euro(editingReceipt.totalAmount)}. Rozdiel: {euro(Math.abs(difference))}. Oprav údaje pred uložením.
              </div>
            )}
          </div>
        )}
      </div>

      <div className="text-xs text-neutral-500 space-y-1 break-all">
        <p><strong>UID:</strong> {editingReceipt.uid || "—"}</p>
        <p><strong>Zdroj:</strong> {editingReceipt.source || "—"}</p>
        {editingReceipt.verificationUrl && <p><a href={editingReceipt.verificationUrl} target="_blank" rel="noopener noreferrer" className="underline text-emerald-700">Otvoriť overenie dokladu</a></p>}
        {editingReceipt.note && <p><strong>Poznámka:</strong> {editingReceipt.note}</p>}
      </div>
      {hasMismatch && (
        <p role="alert" className="rounded-lg border border-red-500 bg-red-50 p-3 text-sm font-semibold text-red-700">
          Uloženie je zablokované: rozpis DPH nesúhlasí so sumou dokladu o {euro(Math.abs(difference))}.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={savingEdit || !validVat || hasMismatch} onClick={onSave}
          className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium">
          {savingEdit ? "Ukladám..." : "Uložiť zmeny"}
        </button>
        <button type="button" onClick={onClose} className="bg-neutral-100 hover:bg-neutral-200 rounded-lg px-4 py-2 text-sm">Zrušiť</button>
      </div>
    </section>
  );
}
