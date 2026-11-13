import type { ParsedReceipt } from "@/lib/receipts-storage";

function normalize(value: string | undefined): string {
  return (value || "").trim().toLocaleLowerCase("sk").replace(/\s+/g, " ");
}

function realUid(value: string | undefined): string {
  const uid = normalize(value);
  return uid && !uid.startsWith("foto-") ? uid : "";
}

/** Len upozornenie: zhodné údaje nemusia vždy znamenať ten istý doklad. */
export function findPotentialDuplicate(
  candidate: ParsedReceipt,
  existing: ParsedReceipt[],
): { receipt: ParsedReceipt; reason: string } | null {
  const uid = realUid(candidate.uid);
  for (const receipt of existing) {
    if (receipt.id === candidate.id) continue;
    if (uid && uid === realUid(receipt.uid)) {
      return { receipt, reason: "Rovnaký identifikátor UID" };
    }
  }

  const date = (candidate.issueDate || "").slice(0, 10);
  const vendor = normalize(candidate.organizationName);
  const amount = Number(candidate.totalAmount);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !vendor || vendor === "neznámy obchod" || !Number.isFinite(amount)) return null;

  for (const receipt of existing) {
    if (receipt.id === candidate.id) continue;
    if (normalize(receipt.organizationName) === vendor &&
        (receipt.issueDate || "").slice(0, 10) === date &&
        Number.isFinite(Number(receipt.totalAmount)) &&
        Math.abs(Number(receipt.totalAmount) - amount) < 0.005) {
      return { receipt, reason: "Rovnaký predajca, dátum a suma" };
    }
  }
  return null;
}
