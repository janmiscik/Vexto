import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type OcrResult = {
  organizationName: string;
  ico: string;
  dic: string;
  icDph: string;
  issueDate: string;
  totalAmount: number;
};

function parseImageData(value: string): { mimeType: string; base64: string } | null {
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) return null;
  return { mimeType, base64: match[2] };
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateOcrResult(value: unknown): OcrResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const textFields = ["organizationName", "ico", "dic", "icDph"] as const;
  if (textFields.some((key) => typeof data[key] !== "string")) return null;

  const amount = data.totalAmount;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0 || amount > 100_000_000) {
    return null;
  }

  const issueDate = data.issueDate;
  if (typeof issueDate !== "string" || (issueDate !== "" && !isValidDate(issueDate))) return null;

  const result: OcrResult = {
    organizationName: (data.organizationName as string).trim().slice(0, 200),
    ico: (data.ico as string).replace(/\s/g, "").slice(0, 20),
    dic: (data.dic as string).replace(/\s/g, "").slice(0, 20),
    icDph: (data.icDph as string).replace(/\s/g, "").slice(0, 30),
    issueDate,
    totalAmount: amount,
  };

  if (result.ico && !/^\d{8}$/.test(result.ico)) return null;
  return result;
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OCR služba nie je nakonfigurovaná" }, { status: 503 });
    }

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_IMAGE_BYTES * 1.5) {
      return NextResponse.json({ error: "Obrázok je príliš veľký (maximum 8 MB)" }, { status: 413 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Neplatné JSON telo požiadavky" }, { status: 400 });
    }

    const imageBase64 =
      body && typeof body === "object" && "imageBase64" in body
        ? (body as { imageBase64?: unknown }).imageBase64
        : undefined;
    if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
      return NextResponse.json({ error: "Neboli odoslané obrazové dáta" }, { status: 400 });
    }

    const image = parseImageData(imageBase64);
    if (!image) {
      return NextResponse.json({ error: "Nepodporovaný alebo neplatný formát obrázka. Použi JPEG, PNG alebo WebP." }, { status: 400 });
    }

    const estimatedBytes = Math.floor((image.base64.length * 3) / 4) - (image.base64.endsWith("==") ? 2 : image.base64.endsWith("=") ? 1 : 0);
    if (estimatedBytes <= 0 || estimatedBytes > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Obrázok je príliš veľký alebo prázdny (maximum 8 MB)" }, { status: 413 });
    }

    const prompt = `Si slovenský účtovný asistent. Analyzuj pokladničný doklad a vráť striktne JSON objekt v tejto schéme:
{
  "organizationName": "Názov firmy/predajne alebo prázdny reťazec",
  "ico": "IČO predajcu alebo prázdny reťazec",
  "dic": "DIČ alebo prázdny reťazec",
  "icDph": "IČ DPH alebo prázdny reťazec",
  "issueDate": "YYYY-MM-DD alebo prázdny reťazec",
  "totalAmount": 0.00
}
Nevymýšľaj chýbajúce údaje. Ak si nie si istý, použi prázdny reťazec; pri nečitateľnej sume použi 0. totalAmount musí byť číslo.`;

    const requestPayload = {
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: image.mimeType, data: image.base64 } }] }],
      generationConfig: { response_mime_type: "application/json", temperature: 0.1 },
    };

    const model = "gemini-3.8-flash";
    let resultData: OcrResult | null = null;
    let lastErrorMsg = "Služba nevrátila použiteľné údaje";

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            body: JSON.stringify(requestPayload),
            signal: AbortSignal.timeout(20000),
            cache: "no-store",
          }
        );

        if (!res.ok) {
          lastErrorMsg = `Externá OCR služba vrátila HTTP ${res.status}`;
          if ((res.status === 429 || res.status === 503) && attempt < 3) {
            await sleep(attempt * 2000);
            continue;
          }
          break;
        }

        const responseData: unknown = await res.json();
        const rawText =
          responseData && typeof responseData === "object"
            ? (responseData as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]?.content?.parts?.[0]?.text
            : undefined;
        if (!rawText) {
          lastErrorMsg = "OCR služba nevrátila textový výsledok";
          break;
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawText.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, ""));
        } catch {
          lastErrorMsg = "OCR služba vrátila neplatný JSON";
          break;
        }

        resultData = validateOcrResult(parsed);
        if (!resultData) {
          lastErrorMsg = "OCR výsledok neprešiel kontrolou údajov";
          break;
        }
        break;
      } catch (error) {
        lastErrorMsg = error instanceof Error && error.name === "TimeoutError"
          ? "OCR služba prekročila časový limit"
          : "Nepodarilo sa spojiť s OCR službou";
        if (attempt < 3) await sleep(attempt * 1000);
      }
    }

    if (!resultData) {
      return NextResponse.json({ error: lastErrorMsg }, { status: 502 });
    }

    return NextResponse.json({ success: true, data: resultData });
  } catch (error: unknown) {
    console.error("[Vexto OCR] Interná chyba:", error instanceof Error ? error.name : "neznáma chyba");
    return NextResponse.json({ error: "Pri spracovaní obrázka nastala interná chyba" }, { status: 500 });
  }
}
