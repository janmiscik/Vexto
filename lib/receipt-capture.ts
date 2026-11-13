import type { ParsedReceipt } from "@/lib/receipts-storage";

/** Načíta a overí údaje dokladu podľa QR identifikátora. */
export async function scanReceipt(scannedText: string): Promise<ParsedReceipt> {
  const res = await fetch("/api/receipt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ receiptId: scannedText }),
  });
  const json = await res.json();
  if (!json.data) throw new Error(json.error || "Nepodarilo sa načítať doklad z QR kódu");
  return { ...json.data, id: crypto.randomUUID() };
}

/** Prečíta fotografiu a vyťaží údaje cez existujúce OCR API. */
export async function recognizeReceiptPhoto(file: File): Promise<ParsedReceipt> {
  const base64String = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Nepodarilo sa načítať obrázok zo zariadenia"));
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Nepodarilo sa načítať obrázok zo zariadenia"));
    };
    reader.readAsDataURL(file);
  });

  const res = await fetch("/api/ocr", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: base64String }),
  });
  const json = await res.json();
  if (!res.ok || json.error) throw new Error(json.error || `Chyba servera (${res.status})`);
  if (!json.data) throw new Error("OCR nevrátilo údaje dokladu.");

  return {
    id: crypto.randomUUID(),
    uid: `FOTO-${Date.now().toString().slice(-6)}`,
    organizationName: json.data.organizationName || "Neznámy obchod",
    ico: json.data.ico || "",
    dic: json.data.dic || "",
    icDph: json.data.icDph || "",
    issueDate: json.data.issueDate || "",
    totalAmount: Number(json.data.totalAmount) || 0,
    source: "gemini_ai",
  };
}
