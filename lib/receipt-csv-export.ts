import type { ParsedReceipt } from "@/lib/receipts-storage";

// Excel in Slovak locale recognizes UTF-8 BOM and semicolon-separated values.
const HEADERS = ["Dátum", "Predajca", "IČO", "DIČ", "IČ DPH", "UID", "Suma (EUR)"];

function csvCell(value: string | number | null | undefined): string {
  const raw = String(value ?? "");
  // Prevent spreadsheet formula execution when opening exported user/OCR data.
  const safe = /^[\s\u0000-\u001f]*[=+@\-]/u.test(raw) && typeof value !== "number"
    ? "'" + raw
    : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function exportReceiptsCsv(receipts: ParsedReceipt[]): void {
  if (receipts.length === 0) return;
  const rows = receipts.map((receipt) => [
    receipt.issueDate?.slice(0, 10) ?? "",
    receipt.organizationName,
    receipt.ico,
    receipt.dic,
    receipt.icDph,
    receipt.uid,
    Number.isFinite(Number(receipt.totalAmount))
      ? Number(receipt.totalAmount).toFixed(2).replace(".", ",")
      : "",
  ]);
  const contents = "\uFEFFsep=;\r\n" + [HEADERS, ...rows]
    .map((row) => row.map(csvCell).join(";"))
    .join("\r\n") + "\r\n";
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vexto_doklady_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
