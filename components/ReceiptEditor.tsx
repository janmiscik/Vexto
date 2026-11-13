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

export default function ReceiptEditor({
  editingReceipt, savingEdit, imageUrl, imageError,
  onChange, onClose, onSave,
}: ReceiptEditorProps) {
  return (
          <section className="bg-white rounded-2xl p-5 border border-emerald-200 shadow-sm space-y-4" aria-label="Detail uloženého dokladu">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold">Detail a úprava dokladu</h2>
              <button type="button" onClick={() => onClose()} aria-label="Zavrieť detail" className="p-2 rounded-lg hover:bg-neutral-100">
                <X className="w-4 h-4" />
              </button>
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
                ["organizationName", "Predajca"],
                ["ico", "IČO"],
                ["dic", "DIČ"],
                ["icDph", "IČ DPH"],
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
                <input type="number" min="0" step="0.01" value={editingReceipt.totalAmount}
                  onChange={(e) => onChange({ ...editingReceipt, totalAmount: e.target.value === "" ? NaN : Number(e.target.value) })}
                  className="mt-1 w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2" />
              </label>
            </div>
            <div className="text-xs text-neutral-500 space-y-1 break-all">
              <p><strong>UID:</strong> {editingReceipt.uid || "—"}</p>
              <p><strong>Zdroj:</strong> {editingReceipt.source || "—"}</p>
              {editingReceipt.verificationUrl && (
                <p><a href={editingReceipt.verificationUrl} target="_blank" rel="noopener noreferrer" className="underline text-emerald-700">Otvoriť overenie dokladu</a></p>
              )}
              {editingReceipt.note && <p><strong>Poznámka:</strong> {editingReceipt.note}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={savingEdit} onClick={onSave}
                className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg px-4 py-2 text-sm font-medium">
                {savingEdit ? "Ukladám..." : "Uložiť zmeny"}
              </button>
              <button type="button" onClick={() => onClose()}
                className="bg-neutral-100 hover:bg-neutral-200 rounded-lg px-4 py-2 text-sm">Zrušiť</button>
            </div>
          </section>
  );
}
