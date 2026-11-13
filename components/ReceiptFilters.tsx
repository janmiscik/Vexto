"use client";

import { Search } from "lucide-react";

export type SortBy = "newest" | "oldest" | "highest" | "lowest";

type ReceiptFiltersProps = {
  searchQuery: string;
  dateFrom: string;
  dateTo: string;
  sortBy: SortBy;
  onSearchQueryChange: (value: string) => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onSortByChange: (value: SortBy) => void;
  onClear: () => void;
};

export default function ReceiptFilters({
  searchQuery, dateFrom, dateTo, sortBy,
  onSearchQueryChange, onDateFromChange, onDateToChange,
  onSortByChange, onClear,
}: ReceiptFiltersProps) {
  return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 mb-3">
            <label className="sm:col-span-2 block text-xs font-medium text-neutral-700">
              Vyhľadávanie (predajca, IČO, UID)
              <span className="relative block mt-1">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-neutral-400" aria-hidden="true" />
                <input type="search" value={searchQuery} onChange={(e) => onSearchQueryChange(e.target.value)}
                  placeholder="Hľadať doklad..." className="w-full pl-9 pr-3 py-2 text-sm bg-neutral-50 border border-neutral-200 rounded-lg" />
              </span>
            </label>
            <label className="block text-xs font-medium text-neutral-700">
              Dátum od
              <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => onDateFromChange(e.target.value)}
                className="mt-1 w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2" />
            </label>
            <label className="block text-xs font-medium text-neutral-700">
              Dátum do
              <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => onDateToChange(e.target.value)}
                className="mt-1 w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2" />
            </label>
            <label className="block text-xs font-medium text-neutral-700">
              Zoradenie
              <select value={sortBy} onChange={(e) => onSortByChange(e.target.value as SortBy)}
                className="mt-1 w-full text-sm bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
                <option value="newest">Najnovšie dátumy</option>
                <option value="oldest">Najstaršie dátumy</option>
                <option value="highest">Najvyššia suma</option>
                <option value="lowest">Najnižšia suma</option>
              </select>
            </label>
            <div className="flex items-end">
              <button type="button" onClick={onClear}
                className="w-full rounded-lg bg-neutral-100 hover:bg-neutral-200 px-3 py-2 text-sm text-neutral-800">
                Vymazať filtre
              </button>
            </div>
          </div>
  );
}
