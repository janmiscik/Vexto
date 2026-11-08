import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { receiptId } = await request.json();

    if (!receiptId || typeof receiptId !== "string") {
      return NextResponse.json(
        { error: "Chýba identifikátor dokladu" },
        { status: 400 }
      );
    }

    const cleanId = receiptId.trim();
    console.log("[Vexto API] Spracovávam UID:", cleanId);

    // Oficiálny odkaz na overenie dokladu na portáli Finančnej správy SR
    const verificationUrl = `https://opk.financnasprava.sk/napoveda/overenie-dokladu?uid=${cleanId}`;
    const targetUrl = `https://ekasa.financnasprava.sk/mws/vee-api/v1/receipts/${cleanId}`;

    let parsedData = null;

    try {
      const response = await fetch(targetUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        const rawReceipt = data.receipt || data;

        parsedData = {
          uid: cleanId,
          ico: rawReceipt?.ico || rawReceipt?.organization?.ico || "",
          dic: rawReceipt?.dic || rawReceipt?.organization?.dic || "",
          icDph: rawReceipt?.icDph || rawReceipt?.organization?.icDph || "",
          organizationName:
            rawReceipt?.organization?.name ||
            rawReceipt?.organizationName ||
            "Dodávateľ",
          issueDate: rawReceipt?.issueDate || rawReceipt?.createDate || "",
          totalAmount: rawReceipt?.totalAmount ?? rawReceipt?.amount ?? 0,
          vatAmounts:
            rawReceipt?.taxData?.map((t: any) => ({
              vatRate: t.taxRate ?? t.vatRate ?? 0,
              vatAmount: t.taxAmount ?? t.vatAmount ?? 0,
              baseAmount: t.taxBase ?? t.baseAmount ?? 0,
            })) || [],
          verificationUrl,
          source: "ekasa_api",
        };
      } else {
        console.warn(`[Vexto API] FS SR vrátila kód: ${response.status}`);
      }
    } catch {
      console.warn("[Vexto API] FS SR API spojenie zlyhalo, prepínam na fallback");
    }

    // Ak API zlyhá (napr. kód 499 alebo firewall), vrátime štruktúrovaný fallback
    if (!parsedData) {
      parsedData = {
        uid: cleanId,
        ico: "",
        dic: "",
        icDph: "",
        organizationName: "Doklad z pokladnice",
        issueDate: new Date().toISOString().slice(0, 10),
        totalAmount: 0,
        vatAmounts: [
          { vatRate: 23, vatAmount: 0, baseAmount: 0 },
          { vatRate: 19, vatAmount: 0, baseAmount: 0 },
        ],
        verificationUrl,
        source: "manual_fallback",
        note: "Finančná správa dočasne obmedzila automatické overovanie cez API (kód 499). Údaje si môžete skontrolovať na portáli OPK.",
      };
    }

    return NextResponse.json({ success: true, data: parsedData });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Neznáma chyba";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}