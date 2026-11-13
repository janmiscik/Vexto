"use client";

import { createClient } from "@/lib/supabase/client";
import type { ParsedReceipt } from "@/lib/receipts-storage";

const BUCKET = "receipt-images";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
const encoder = new TextEncoder();

type Entry = { name: string; bytes: Uint8Array<ArrayBuffer> };

const crcTable = Array.from({ length: 256 }, (_, i) => {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function write16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true); }
function write32(view: DataView, offset: number, value: number) { view.setUint32(offset, value >>> 0, true); }

/** Creates a standard uncompressed ZIP without external dependencies. */
function makeZip(entries: Entry[]): Blob {
  const parts: BlobPart[] = [];
  const central: BlobPart[] = [];
  let offset = 0;
  let centralSize = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const size = entry.bytes.byteLength;
    const crc = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    write32(lv, 0, 0x04034b50);
    write16(lv, 4, 20);
    write16(lv, 6, 0x0800);
    write32(lv, 14, crc);
    write32(lv, 18, size);
    write32(lv, 22, size);
    write16(lv, 26, name.length);
    local.set(name, 30);
    parts.push(local, entry.bytes);

    const record = new Uint8Array(46 + name.length);
    const cv = new DataView(record.buffer);
    write32(cv, 0, 0x02014b50);
    write16(cv, 4, 20);
    write16(cv, 6, 20);
    write16(cv, 8, 0x0800);
    write32(cv, 16, crc);
    write32(cv, 20, size);
    write32(cv, 24, size);
    write16(cv, 28, name.length);
    write32(cv, 42, offset);
    record.set(name, 46);
    central.push(record);
    centralSize += record.length;
    offset += local.length + size;
  }

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  write32(ev, 0, 0x06054b50);
  write16(ev, 8, entries.length);
  write16(ev, 10, entries.length);
  write32(ev, 12, centralSize);
  write32(ev, 16, offset);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}

/** Downloads only the signed-in user's own receipts and private images. Never writes to Supabase. */
export async function downloadReceiptsBackup(): Promise<{ count: number; images: number }> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error("Na vytvorenie zálohy sa musíš prihlásiť.");

  const rows: ParsedReceipt[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from("receipts")
      .select("*").eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      rows.push({
        id: row.id, uid: row.uid ?? "", ico: row.ico ?? "", dic: row.dic ?? "",
        icDph: row.ic_dph ?? "", organizationName: row.organization_name ?? "",
        issueDate: row.issue_date ?? "", totalAmount: Number(row.total_amount ?? 0),
        vatAmounts: Array.isArray(row.vat_amounts) ? row.vat_amounts : [],
        verificationUrl: row.verification_url ?? undefined,
        source: row.source ?? undefined, note: row.note ?? undefined,
        imagePath: row.image_path ?? undefined,
      });
    }
    if (!data || data.length < pageSize) break;
  }

  const entries: Entry[] = [];
  let totalSize = 0;
  const backedUpReceipts = [] as Array<ParsedReceipt & { backupImageFile?: string }>;
  let images = 0;
  for (const receipt of rows) {
    const record: ParsedReceipt & { backupImageFile?: string } = { ...receipt };
    if (receipt.imagePath) {
      if (!receipt.imagePath.startsWith(`${user.id}/`)) {
        throw new Error(`Doklad ${receipt.id} má neplatnú cestu k fotografii. Záloha nebola vytvorená.`);
      }
      const { data: file, error } = await supabase.storage.from(BUCKET).download(receipt.imagePath);
      if (error || !file) throw new Error(`Fotografiu dokladu ${receipt.id} sa nepodarilo načítať. Záloha nebola vytvorená.`);
      if (file.size > MAX_IMAGE_BYTES) throw new Error(`Fotografia dokladu ${receipt.id} presahuje limit 8 MB.`);
      const ext = receipt.imagePath.split(".").pop()?.toLowerCase();
      if (!ext || !["jpg", "jpeg", "png", "webp"].includes(ext)) throw new Error("Neznámy formát fotografie v úložisku.");
      const name = `images/${images + 1}.${ext}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      totalSize += bytes.byteLength;
      if (totalSize > MAX_TOTAL_BYTES) throw new Error("Záloha presahuje limit 150 MB. Rozdeľ doklady do menších účtov alebo použi iný spôsob zálohy.");
      entries.push({ name, bytes });
      record.backupImageFile = name;
      images++;
    }
    backedUpReceipts.push(record);
  }

  const manifest = encoder.encode(JSON.stringify({
    format: "vexto-backup", version: 1, exportedAt: new Date().toISOString(),
    receiptCount: rows.length, imageCount: images, receipts: backedUpReceipts,
  }, null, 2));
  totalSize += manifest.byteLength;
  if (totalSize > MAX_TOTAL_BYTES) throw new Error("Záloha presahuje limit 150 MB.");
  entries.unshift({ name: "receipts.json", bytes: manifest });
  const blob = makeZip(entries);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `vexto-zaloha-${new Date().toISOString().slice(0, 10)}.zip`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return { count: rows.length, images };
}
