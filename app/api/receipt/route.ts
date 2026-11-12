
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_RECEIPT_ID_LENGTH = 256;

function isValidReceiptId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= MAX_RECEIPT_ID_LENGTH &&
    !/[\u0000-\u0020\u007f]/.test(value)
  );
}

function formatIssueDate(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  const rawDate = value.trim();

  const match = rawDate.match(
    /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/
  );

  if (!match) {
    return rawDate;
  }

  const [, day, month, year] = match;

  return `${year}-${month}-${day}`;
}

function unverifiedResponse(
  receiptId: string,
  verificationUrl: string
) {
  return NextResponse.json({
    success: false,
    status: "unverified",
    data: {
      uid: receiptId,
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
      note:
        "Doklad sa nepodarilo automaticky overiť. Údaje nie sú potvrdené Finančnou správou. Skontrolujte ich na oficiálnom portáli a doplňte ručne.",
    },
  });
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Na overovanie účteniek sa musíte prihlásiť." },
        { status: 401 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Neplatné JSON telo požiadavky." },
        { status: 400 }
      );
    }

    const receiptId =
      body && typeof body === "object" && "receiptId" in body
        ? (body as { receiptId?: unknown }).receiptId
        : undefined;

    if (typeof receiptId !== "string") {
      return NextResponse.json(
        { error: "Chýba identifikátor dokladu." },
        { status: 400 }
      );
    }

    const cleanId = receiptId.trim();

    if (!isValidReceiptId(cleanId)) {
      return NextResponse.json(
        { error: "Identifikátor dokladu má neplatný formát alebo dĺžku." },
        { status: 400 }
      );
    }

    const verificationUrl =
      `https://opk.financnasprava.sk/napoveda/overenie-dokladu?uid=${encodeURIComponent(cleanId)}`;

    const response = await fetch(
      "https://ekasa.financnasprava.sk/mdu/api/v1/opd/receipt/find",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        },
        body: JSON.stringify({ receiptId: cleanId }),
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      }
    );

    if (!response.ok) {
      console.warn(
        `[Vexto API] OPD vrátilo HTTP ${response.status}.`
      );

      return unverifiedResponse(cleanId, verificationUrl);
    }

    const result: unknown = await response.json();

    if (!result || typeof result !== "object") {
      return unverifiedResponse(cleanId, verificationUrl);
    }

    const apiResult = result as Record<string, unknown>;

    if (
      apiResult.returnValue !== 0 ||
      !apiResult.receipt ||
      typeof apiResult.receipt !== "object"
    ) {
      console.warn("[Vexto API] OPD nepotvrdilo doklad.");

      return unverifiedResponse(cleanId, verificationUrl);
    }

    const receipt = apiResult.receipt as Record<string, unknown>;

    const organization =
      receipt.organization &&
      typeof receipt.organization === "object"
        ? (receipt.organization as Record<string, unknown>)
        : {};

    const rawAmount = Number(receipt.totalPrice);

    if (!Number.isFinite(rawAmount) || rawAmount < 0) {
      console.warn("[Vexto API] Doklad obsahuje neplatnú sumu.");

      return unverifiedResponse(cleanId, verificationUrl);
    }

    const vatSummary = Array.isArray(receipt.vatSummary)
      ? receipt.vatSummary
      : [];

    const vatAmounts = vatSummary.map((item: unknown) => {
      const vatItem =
        item && typeof item === "object"
          ? (item as Record<string, unknown>)
          : {};

      const vat =
        vatItem.vat && typeof vatItem.vat === "object"
          ? (vatItem.vat as Record<string, unknown>)
          : {};

      return {
        vatRate: Number(vat.vatRate ?? 0),
        vatAmount: Number(vatItem.vatAmount ?? 0),
        baseAmount: Number(vatItem.vatBase ?? 0),
      };
    });

    const parsedData = {
      uid: String(receipt.receiptId ?? cleanId),
      ico: String(organization.ico ?? receipt.ico ?? ""),
      dic: String(organization.dic ?? receipt.dic ?? ""),
      icDph: String(organization.icDph ?? receipt.icDph ?? ""),
      organizationName: String(organization.name ?? ""),
      issueDate: formatIssueDate(
        receipt.issueDate ?? receipt.createDate
      ),
      totalAmount: rawAmount,
      vatAmounts,
      verificationUrl,
      source: "opd_api",
      verificationStatus: "verified",
    };

    return NextResponse.json({
      success: true,
      status: "verified",
      data: parsedData,
    });
  } catch (error: unknown) {
    console.error(
      "[Vexto API] Chyba overovania:",
      error instanceof Error ? error.name : "neznáma chyba"
    );

    return NextResponse.json(
      { error: "Pri overovaní dokladu nastala chyba." },
      { status: 502 }
    );
  }
}
