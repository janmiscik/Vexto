
"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

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

let snapshot = EMPTY_SNAPSHOT;
let loadPromise: Promise<void> | null = null;
let revision = 0;

const listeners = new Set<() => void>();

function emitChange(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string {
  return snapshot;
}

function getServerSnapshot(): string {
  return EMPTY_SNAPSHOT;
}

function parseReceipts(value: string): ParsedReceipt[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function loadReceipts(): Promise<void> {
  if (loadPromise) return loadPromise;

  const currentRevision = revision;

  loadPromise = (async () => {
    const supabase = createClient();
    const { data: { user }, error: authError } =
      await supabase.auth.getUser();

    if (authError) throw authError;

    if (!user) {
      if (revision === currentRevision) {
        snapshot = EMPTY_SNAPSHOT;
        emitChange();
      }
      return;
    }

    const { data, error } = await supabase
      .from("receipts")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    if (revision !== currentRevision) return;

    snapshot = JSON.stringify((data ?? []).map((row) => ({
      id: row.id,
      uid: row.uid ?? "",
      ico: row.ico ?? "",
      dic: row.dic ?? "",
      icDph: row.ic_dph ?? "",
      organizationName: row.organization_name ?? "",
      issueDate: row.issue_date ?? "",
      totalAmount: Number(row.total_amount ?? 0),
      vatAmounts: Array.isArray(row.vat_amounts)
        ? row.vat_amounts
        : [],
      verificationUrl: row.verification_url ?? undefined,
      source: row.source ?? undefined,
      note: row.note ?? undefined,
    })));

    emitChange();
  })().catch((error: unknown) => {
    console.error("[Vexto] Načítanie účteniek zlyhalo:", error);
    throw error;
  }).finally(() => {
    loadPromise = null;
  });

  return loadPromise;
}

export function useSavedReceipts(): ParsedReceipt[] {
  const currentSnapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  useEffect(() => {
    void loadReceipts().catch(() => {});
  }, []);

  return parseReceipts(currentSnapshot);
}

export async function saveReceipts(
  receipts: ParsedReceipt[]
): Promise<void> {
  await loadReceipts();

  const supabase = createClient();
  const { data: { user }, error: authError } =
    await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) throw new Error("Používateľ nie je prihlásený.");

  const { data: existingRows, error: existingError } = await supabase
    .from("receipts")
    .select("id")
    .eq("user_id", user.id);

  if (existingError) throw existingError;

  const rows = receipts.map((receipt) => ({
    id: receipt.id,
    user_id: user.id,
    uid: receipt.uid,
    ico: receipt.ico,
    dic: receipt.dic,
    ic_dph: receipt.icDph,
    organization_name: receipt.organizationName,
    issue_date: receipt.issueDate,
    total_amount: receipt.totalAmount,
    vat_amounts: receipt.vatAmounts ?? [],
    verification_url: receipt.verificationUrl ?? null,
    source: receipt.source ?? null,
    note: receipt.note ?? null,
  }));

  if (rows.length) {
    const { error } = await supabase
      .from("receipts")
      .upsert(rows, { onConflict: "id" });

    if (error) throw error;
  }

  const retainedIds = new Set(receipts.map((receipt) => receipt.id));
  const obsoleteIds = (existingRows ?? [])
    .map((row) => row.id)
    .filter((id) => !retainedIds.has(id));

  if (obsoleteIds.length) {
    const { error } = await supabase
      .from("receipts")
      .delete()
      .eq("user_id", user.id)
      .in("id", obsoleteIds);

    if (error) throw error;
  }

  revision++;
  snapshot = JSON.stringify(receipts);
  emitChange();
}
