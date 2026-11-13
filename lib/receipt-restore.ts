"use client";

import { createClient } from "@/lib/supabase/client";
import type { ParsedReceipt } from "@/lib/receipts-storage";
import { findPotentialDuplicate } from "@/lib/receipt-duplicates";

const MAX_ZIP = 160 * 1024 * 1024;
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_JSON = 12 * 1024 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: true });
const allowedTypes: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

type BackupReceipt = ParsedReceipt & { backupImageFile?: string };
type Backup = { format: string; version: number; receiptCount: number; imageCount: number; receipts: BackupReceipt[] };
export type RestorePreview = { total: number; toImport: number; duplicates: number; images: number };
export type RestoreResult = { imported: number; skipped: number; failed: number; errors: string[] };
type Archive = { manifest: Backup; images: Map<string, Uint8Array> };

const crcTable = Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function parseArchive(buffer: ArrayBuffer): Archive {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const entries = new Map<string, Uint8Array>();
  let offset = 0;
  let total = 0;
  while (offset + 4 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    if (offset + 30 > bytes.length) throw new Error("Poškodená hlavička ZIP.");
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const expectedCrc = view.getUint32(offset + 14, true);
    const size = view.getUint32(offset + 18, true);
    const uncompressed = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    if (flags !== 0x0800 || method !== 0 || size !== uncompressed) throw new Error("Nepodporovaný ZIP. Použi pôvodnú zálohu vytvorenú vo Vexto.");
    const start = offset + 30 + nameLength + extraLength;
    if (start > bytes.length || size > bytes.length - start) throw new Error("Poškodený obsah ZIP.");
    const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLength));
    if (name !== "receipts.json" && !/^images\/[1-9]\d*\.(jpg|jpeg|png|webp)$/.test(name)) throw new Error("ZIP obsahuje nepovolenú položku.");
    if (entries.has(name)) throw new Error("ZIP obsahuje duplicitné názvy súborov.");
    const content = bytes.slice(start, start + size);
    if (crc32(content) !== expectedCrc) throw new Error(`Súbor ${name} je poškodený (CRC).`);
    total += size;
    if (total > MAX_ZIP || (name === "receipts.json" && size > MAX_JSON) || (name !== "receipts.json" && size > MAX_IMAGE)) throw new Error("Záloha prekračuje povolenú veľkosť.");
    entries.set(name, content);
    offset = start + size;
  }
  if (offset + 22 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
    // Central directory must follow local entries (the exporter writes it immediately).
    throw new Error("ZIP nemá platný centrálny adresár.");
  }
  const manifestBytes = entries.get("receipts.json");
  if (!manifestBytes) throw new Error("V zálohe chýba receipts.json.");
  let parsed: unknown;
  try { parsed = JSON.parse(decoder.decode(manifestBytes)); } catch { throw new Error("Neplatný receipts.json."); }
  if (!parsed || typeof parsed !== "object") throw new Error("Neplatný formát zálohy.");
  const manifest = parsed as Backup;
  if (manifest.format !== "vexto-backup" || manifest.version !== 1 || !Array.isArray(manifest.receipts) ||
      !Number.isSafeInteger(manifest.receiptCount) || manifest.receiptCount !== manifest.receipts.length ||
      !Number.isSafeInteger(manifest.imageCount)) throw new Error("Nepodporovaný formát zálohy.");
  const usedImages = new Set<string>();
  const ids = new Set<string>();
  for (const receipt of manifest.receipts) {
    if (!receipt || typeof receipt !== "object" || typeof receipt.id !== "string" || !receipt.id || receipt.id.length > 256 ||
        ids.has(receipt.id) || typeof receipt.organizationName !== "string" || receipt.organizationName.length > 500 ||
        typeof receipt.issueDate !== "string" || !validDate(receipt.issueDate) ||
        typeof receipt.totalAmount !== "number" || !Number.isFinite(receipt.totalAmount) || receipt.totalAmount < 0 ||
        [receipt.uid, receipt.ico, receipt.dic, receipt.icDph, receipt.note, receipt.source, receipt.verificationUrl].some(v => v !== undefined && (typeof v !== "string" || v.length > 4000)) ||
        (receipt.vatAmounts !== undefined && (!Array.isArray(receipt.vatAmounts) || receipt.vatAmounts.length > 50 || receipt.vatAmounts.some(v => !v || ![v.vatRate, v.vatAmount, v.baseAmount].every(n => typeof n === "number" && Number.isFinite(n)))))) {
      throw new Error("Záloha obsahuje neplatné alebo duplicitné doklady.");
    }
    ids.add(receipt.id);
    if (receipt.backupImageFile !== undefined) {
      if (typeof receipt.backupImageFile !== "string" || !entries.has(receipt.backupImageFile) || usedImages.has(receipt.backupImageFile)) throw new Error("Záloha obsahuje neplatný odkaz na fotografiu.");
      usedImages.add(receipt.backupImageFile);
    }
  }
  if (usedImages.size !== manifest.imageCount || entries.size !== usedImages.size + 1) throw new Error("Počet fotografií v zálohe nesúhlasí.");
  entries.delete("receipts.json");
  return { manifest, images: entries };
}

async function currentReceipts() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error("Najprv sa prihlás.");
  const receipts: ParsedReceipt[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from("receipts").select("*").eq("user_id", user.id).order("created_at").order("id").range(from, from + 499);
    if (error) throw error;
    for (const row of data ?? []) receipts.push({
      id: row.id, uid: row.uid ?? "", ico: row.ico ?? "", dic: row.dic ?? "", icDph: row.ic_dph ?? "",
      organizationName: row.organization_name ?? "", issueDate: row.issue_date ?? "", totalAmount: Number(row.total_amount ?? 0),
      vatAmounts: row.vat_amounts ?? [], note: row.note ?? undefined, source: row.source ?? undefined,
      verificationUrl: row.verification_url ?? undefined, imagePath: row.image_path ?? undefined,
    });
    if (!data || data.length < 500) break;
  }
  return { supabase, user, receipts };
}
function isDuplicate(candidate: ParsedReceipt, existing: ParsedReceipt[]): boolean {
  return existing.some(r => r.id === candidate.id) || Boolean(findPotentialDuplicate(candidate, existing));
}
export async function previewReceiptsRestore(file: File): Promise<RestorePreview> {
  if (file.size > MAX_ZIP) throw new Error("ZIP presahuje limit 160 MB.");
  const archive = parseArchive(await file.arrayBuffer());
  const { receipts } = await currentReceipts();
  const known = [...receipts];
  let duplicates = 0;
  let images = 0;
  for (const item of archive.manifest.receipts) {
    if (isDuplicate(item, known)) { duplicates++; continue; }
    known.push(item);
    if (item.backupImageFile) images++;
  }
  return { total: archive.manifest.receipts.length, toImport: known.length - receipts.length, duplicates, images };
}
export async function restoreReceiptsBackup(file: File): Promise<RestoreResult> {
  if (file.size > MAX_ZIP) throw new Error("ZIP presahuje limit 160 MB.");
  const archive = parseArchive(await file.arrayBuffer());
  const { supabase, user, receipts } = await currentReceipts();
  const known = [...receipts];
  const result: RestoreResult = { imported: 0, skipped: 0, failed: 0, errors: [] };
  for (const item of archive.manifest.receipts) {
    if (isDuplicate(item, known)) { result.skipped++; continue; }
    const id = crypto.randomUUID(); // Never trust old IDs or overwrite a receipt in the destination account.
    let path: string | null = null;
    try {
      if (item.backupImageFile) {
        const bytes = archive.images.get(item.backupImageFile);
        if (!bytes) throw new Error("Chýbajúca fotografia.");
        const ext = item.backupImageFile.split(".").pop()!;
        const mime = allowedTypes[ext];
        path = `${user.id}/${id}.${ext}`;
        const { error } = await supabase.storage.from("receipt-images").upload(path, new Blob([new Uint8Array(bytes)], { type: mime }), { contentType: mime, upsert: false });
        if (error) throw error;
      }
      const { error } = await supabase.from("receipts").insert({
        id, user_id: user.id, uid: item.uid ?? "", ico: item.ico ?? "", dic: item.dic ?? "",
        ic_dph: item.icDph ?? "", organization_name: item.organizationName, issue_date: item.issueDate,
        total_amount: item.totalAmount, vat_amounts: item.vatAmounts ?? [], verification_url: item.verificationUrl ?? null,
        source: item.source ?? null, note: item.note ?? null, image_path: path,
      });
      if (error) throw error;
      known.push({ ...item, id, imagePath: path ?? undefined });
      result.imported++;
    } catch (error) {
      if (path) await supabase.storage.from("receipt-images").remove([path]);
      result.failed++;
      result.errors.push(`Doklad ${item.id}: ${error instanceof Error ? error.message : "neznáma chyba"}`);
    }
  }
  return result;
}
