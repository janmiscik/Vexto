import { NextResponse } from "next/server";

const MAX_RECEIPT_ID_LENGTH = 256;

function isValidReceiptId(value: string): boolean {
  // UID z QR môže obsahovať alfanumerické znaky a oddeľovače.
  // Nepovoľujeme riadiace znaky, medzery ani URL/HTML obsah.
  return (
    value.length > 0 &&
    value.length <= MAX_RECEIPT_ID_LENGTH &&
    !/[\u0000-\u0020\u007f]/.test(value)
  );
}

export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Neplatné JSON telo požiadavky" }, { status: 400 });
    }

    const receiptId =
      body && typeof body === "object" && "receiptId" in body
        ? (body as { receiptId?: unknown }).receiptId
        : undefined;

    if (typeof receiptId !== "string") {
      return NextResponse.json({ error: "Chýba identifikátor dokladu" }, { status: 400 });
    }

    const cleanId = receiptId.trim();
    if (!isValidReceiptId(cleanId)) {
      return NextResponse.json(
        { error: "Identifikátor dokladu má neplatný formát alebo dĺžku" },
        { status: 400 }
      );
    }

    const verificationUrl = `https://opk.financnasprava.sk/napoveda/overenie-dokladu?uid=${encodeURIComponent(cleanId)}`;
    const targetUrl = `https://ekasa.financnasprava.sk/mws/vee-api/v1/receipts/${encodeURIComponent(cleanId)}`;

    try {
      const response = await fetch(targetUrl, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
        cache: "no-store",
      });

      if (response.ok) {
        const data: unknown = await response.json();
        const rawReceipt =
          data && typeof data === "object" && "receipt" in data
            ? (data as { receipt?: unknown }).receipt ?? data
            : data;

        if (rawReceipt && typeof rawReceipt === "object") {
          const receipt = rawReceipt as Record<string, unknown>;
          const organization =
            receipt.organization && typeof receipt.organization === "object"
              ? (receipt.organization as Record<string, unknown>)
              : {};
          const rawAmount = receipt.totalAmount ?? receipt.amount;
          const totalAmount = Number(rawAmount);
          const rawTaxes = Array.isArray((receipt.taxData)) ? receipt.taxData : [];
          const vatAmounts = rawTaxes.map((item: unknown) => {
            const tax = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
            return {
              vatRate: Number(tax.taxRate ?? tax.vatRate ?? 0),
              vatAmount: Number(tax.taxAmount ?? tax.vatAmount ?? 0),
              baseAmount: Number(tax.taxBase ?? tax.baseAmount ?? 0),
            };
          });

          if (Number.isFinite(totalAmount) && totalAmount >= 0) {
            const parsedData = {
              uid: cleanId,
              ico: String(receipt.ico ?? organization.ico ?? ""),
              dic: String(receipt.dic ?? organization.dic ?? ""),
              icDph: String(receipt.icDph ?? organization.icDph ?? ""),
              organizationName: String(organization.name ?? receipt.organizationName ?? ""),
              issueDate: String(receipt.issueDate ?? receipt.createDate ?? ""),
              totalAmount,
              vatAmounts,
              verificationUrl,
              source: "ekasa_api",
              verificationStatus: "verified",
            };
            return NextResponse.json({ success: true, status: "verified", data: parsedData });
          }
        }
        console.warn("[Vexto API] Odpoveď Finančnej správy nemá očakávanú štruktúru.");
      } else {
        console.warn(`[Vexto API] Finančná správa vrátila HTTP ${response.status}.`);
      }
    } catch (error) {
      console.warn(
        "[Vexto API] Overenie dokladu sa nepodarilo:",
        error instanceof Error ? error.name : "neznáma chyba"
      );
    }

    // Neoverený doklad sa vracia výslovne ako neoverený; nikdy nevymýšľame dátum,
    // sumu ani sadzby DPH. Klient ho môže používateľovi ponúknuť na ručné doplnenie.
    const fallbackData = {
      uid: cleanId,
      ico: "",
      dic: "",
      icDph: "",
      organizationName: "",
      issueDate: "",
      totalAmount: 0,
      vatAmounts: [],
      verificationUrl,
      source: "manual_fallback",
      verificationStatus: "unverified",
      note: "Doklad sa nepodarilo automaticky overiť. Údaje nie sú potvrdené Finančnou správou. Skontrolujte ich na oficiálnom portáli a doplňte ručne.",
    };

    return NextResponse.json({ success: false, status: "unverified", data: fallbackData });
  } catch (error: unknown) {
    console.error(
      "[Vexto API] Neočakávaná chyba:",
      error instanceof Error ? error.name : "neznáma chyba"
    );
    return NextResponse.json({ error: "Pri spracovaní dokladu nastala interná chyba" }, { status: 500 });
  }
}
