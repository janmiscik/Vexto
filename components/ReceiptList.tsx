"use client";

import ReceiptFilters, { type SortBy } from "@/components/ReceiptFilters";
import type { ParsedReceipt } from "@/lib/receipts-storage";
import { Download, FileText, Pencil, Trash2 } from "lucide-react";

type Props = {
  savedReceipts: ParsedReceipt[];
  filteredReceipts: ParsedReceipt[];
  totalSum: number;
  filteredSum: number;
  searchQuery: string;
  dateFrom: string;
  dateTo: string;
  sortBy: SortBy;
  onSearchQueryChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onSortByChange: (value: SortBy) => void;
  onClear: () => void;
  onExport: () => void;
  onOpen: (receipt: ParsedReceipt) => void;
  onDelete: (id: string) => void;
};

export default function ReceiptList({
  savedReceipts, filteredReceipts, totalSum, filteredSum,
  searchQuery, dateFrom, dateTo, sortBy,
  onSearchQueryChange, onDateFromChange, onDateToChange,
  onSortByChange, onClear, onExport, onOpen, onDelete,
}: Props) {
  return (
        <section className="bg-white rounded-2xl p-5 border border-neutral-100 shadow-sm">
          <div className="flex items-center justify-between pb-4 border-b border-neutral-100">
            <div>
              <h2 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <FileText className="w-4 h-4 text-neutral-500" />
                Doklady ({filteredReceipts.length} z {savedReceipts.length})
              </h2>

              <p className="text-xs text-neutral-400 mt-0.5">
                Spolu:{" "}
                <span className="font-bold text-neutral-900">
                  {totalSum.toFixed(2)} €
                </span>
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                Výber: <strong>{filteredSum.toFixed(2)} €</strong>
              </p>
            </div>

            {filteredReceipts.length > 0 && (
              <button
                onClick={onExport}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium py-2 px-3 rounded-lg shadow-sm transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export výberu XML (Pohoda)
              </button>
            )}
          </div>

          <ReceiptFilters
            searchQuery={searchQuery}
            dateFrom={dateFrom}
            dateTo={dateTo}
            sortBy={sortBy}
            onSearchQueryChange={onSearchQueryChange}
            onDateFromChange={onDateFromChange}
            onDateToChange={onDateToChange}
            onSortByChange={onSortByChange}
            onClear={onClear}
          />
          <div className="divide-y divide-neutral-100 mt-2">
            {savedReceipts.length === 0 ? (
              <p className="text-xs text-neutral-400 py-6 text-center">
                Zatiaľ žiadne uložené doklady. Odfoťte bloček zeleným tlačidlom vyššie.
              </p>
            ) : filteredReceipts.length === 0 ? (
              <p className="text-xs text-neutral-500 py-6 text-center">Žiadne doklady nezodpovedajú filtrom.</p>
            ) : (
              filteredReceipts.map((r) => (
                <div
                  key={r.id}
                  className="py-3 flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <p className="font-semibold text-neutral-800">
                      {r.organizationName}
                    </p>

                    <p className="text-neutral-400 text-[11px]">
                      {(r.issueDate || "").slice(0, 10)} • IČO:{" "}
                      {r.ico || "—"}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-bold text-neutral-900 text-sm">
                      {Number(r.totalAmount || 0).toFixed(2)} €
                    </span>

                    <button
                      type="button"
                      onClick={() => onOpen(r)}
                      aria-label={`Zobraziť a upraviť doklad ${r.organizationName}`}
                      title="Zobraziť a upraviť"
                      className="text-neutral-500 hover:text-emerald-700 p-1 rounded-md"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      aria-label={`Vymazať doklad ${r.organizationName}`}
                      onClick={() => onDelete(r.id)}
                      className="text-neutral-400 hover:text-red-600 p-1 rounded-md"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
  );
}
