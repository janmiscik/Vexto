"use client";

import type { ParsedReceipt } from "@/lib/receipts-storage";
import { Building2, Calendar, Euro, FileCheck, Sparkles } from "lucide-react";

type ReceiptFormProps = {
  receipt: ParsedReceipt;
  saving: boolean;
  onChange: (receipt: ParsedReceipt) => void;
  onSave: () => void;
};

export default function ReceiptForm({ receipt, saving, onChange, onSave }: ReceiptFormProps) {
  return (
          <section className="p-5 bg-white rounded-2xl border border-neutral-200/80 shadow-md flex flex-col gap-4">
            {receipt.source === "manual_fallback" && (
              <div
                role="alert"
                className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              >
                <strong>Doklad nie je overený.</strong>{" "}
                {receipt.note ||
                  "Údaje skontroluj a doplň ručne."}
              </div>
            )}

            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                Identifikátor
              </span>

              {receipt.source === "gemini_ai" && (
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  Vyťažené cez Gemini AI
                </span>
              )}
            </div>

            <p className="font-mono text-xs text-neutral-800 bg-neutral-50 p-2 rounded-lg border border-neutral-200 break-all">
              {receipt.uid}
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-neutral-700 flex items-center gap-1.5 mb-1">
                  <Building2 className="w-3.5 h-3.5 text-neutral-400" />
                  Predajca / IČO
                </label>

                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={receipt.organizationName}
                    onChange={(e) =>
                      onChange({
                        ...receipt,
                        organizationName: e.target.value,
                      })
                    }
                    placeholder="Názov obchodu"
                    className="col-span-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-neutral-900"
                  />

                  <input
                    type="text"
                    value={receipt.ico}
                    onChange={(e) =>
                      onChange({
                        ...receipt,
                        ico: e.target.value,
                      })
                    }
                    placeholder="IČO"
                    className="text-sm font-mono bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-neutral-700 flex items-center gap-1.5 mb-1">
                    <Calendar className="w-3.5 h-3.5 text-neutral-400" />
                    Dátum
                  </label>

                  <input
                    type="date"
                    value={(receipt.issueDate || "").slice(0, 10)}
                    onChange={(e) =>
                      onChange({
                        ...receipt,
                        issueDate: e.target.value,
                      })
                    }
                    className="w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-neutral-900"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-neutral-700 flex items-center gap-1.5 mb-1">
                    <Euro className="w-3.5 h-3.5 text-neutral-400" />
                    Suma spolu (€)
                  </label>

                  <input
                    type="number"
                    step="0.01"
                    value={receipt.totalAmount || ""}
                    onChange={(e) =>
                      onChange({
                        ...receipt,
                        totalAmount: parseFloat(e.target.value) || 0,
                      })
                    }
                    placeholder="0.00"
                    className="w-full text-sm font-bold bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-neutral-900 text-emerald-700"
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="mt-2 w-full flex items-center justify-center gap-2 bg-neutral-900 hover:bg-neutral-800 text-white font-medium py-3 px-4 rounded-xl text-sm transition-all cursor-pointer shadow-sm"
            >
              <FileCheck className="w-4 h-4" />
              {saving ? "Ukladám doklad a fotografiu..." : "Potvrdiť a uložiť do evidencie"}
            </button>
          </section>
  );
}
