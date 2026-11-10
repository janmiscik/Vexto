"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "vexto_receipts";
const EMPTY_SNAPSHOT = "[]";

export interface ParsedReceipt {
  id: string;
  uid: string;
  ico: string;
  dic: string;
  icDph: string;
  organizationName: string;
  issueDate: string;
  totalAmount: number;
  vatAmounts?: Array<{
    vatRate: number;
    vatAmount: number;
    baseAmount: number;
  }>;
  verificationUrl?: string;
  source?: string;
  note?: string;
}

const listeners = new Set<() => void>();

function emitChange(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function getSnapshot(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? EMPTY_SNAPSHOT;
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

function getServerSnapshot(): string {
  return EMPTY_SNAPSHOT;
}

function parseReceipts(snapshot: string): ParsedReceipt[] {
  try {
    const parsed: unknown = JSON.parse(snapshot);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is ParsedReceipt => {
      return (
        item !== null &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.uid === "string"
      );
    });
  } catch {
    return [];
  }
}

export function useSavedReceipts(): ParsedReceipt[] {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return parseReceipts(snapshot);
}

export function saveReceipts(receipts: ParsedReceipt[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(receipts));
  emitChange();
}
