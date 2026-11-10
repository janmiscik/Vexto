
import {
  validateOcrResult,
  type OcrResult,
  type ParsedImage,
} from "./validation";

const MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.8-flash",
];

const REQUEST_TIMEOUT_MS = 20_000;

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export class OcrServiceError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "OcrServiceError";
  }
}

const PROMPT = `Si slovenský účtovný asistent. Analyzuj pokladničný doklad a vráť striktne JSON objekt v tejto schéme:
{
  "organizationName": "Názov firmy/predajne alebo prázdny reťazec",
  "ico": "IČO predajcu alebo prázdny reťazec",
  "dic": "DIČ alebo prázdny reťazec",
  "icDph": "IČ DPH alebo prázdny reťazec",
  "issueDate": "YYYY-MM-DD alebo prázdny reťazec",
  "totalAmount": 0.00
}
Nevymýšľaj chýbajúce údaje. Ak si nie si istý, použi prázdny reťazec; pri nečitateľnej sume použi 0. totalAmount musí byť číslo.`;

function extractText(responseData: unknown): string | null {
  if (
    !responseData ||
    typeof responseData !== "object"
  ) {
    return null;
  }

  const data = responseData as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ text?: string }>;
      };
    }>;
  };

  return (
    data.candidates?.[0]?.content?.parts?.[0]?.text ??
    null
  );
}

function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(
      text
        .replace(/^\s*```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
    );
  } catch {
    return null;
  }
}

export async function recognizeReceipt(
  image: ParsedImage,
  apiKey: string
): Promise<OcrResult> {
  const requestPayload = {
    contents: [
      {
        parts: [
          { text: PROMPT },
          {
            inline_data: {
              mime_type: image.mimeType,
              data: image.base64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      response_mime_type: "application/json",
      temperature: 0.1,
    },
  };

  let lastError = new OcrServiceError(
    "OCR služba momentálne nedokázala spracovať obrázok.",
    502
  );

  for (let index = 0; index < MODELS.length; index++) {
    const model = MODELS[index];

    let response: Response;

    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(requestPayload),
          signal: AbortSignal.timeout(
            REQUEST_TIMEOUT_MS
          ),
          cache: "no-store",
        }
      );
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        (
          error.name === "TimeoutError" ||
          error.name === "AbortError"
        );

      lastError = new OcrServiceError(
        timedOut
          ? "AI služba neodpovedá včas. Skús to znova o chvíľu."
          : "Nepodarilo sa spojiť s AI službou.",
        timedOut ? 504 : 502
      );

      if (index < MODELS.length - 1) {
        await sleep(1000);
        continue;
      }

      break;
    }

    if (!response.ok) {
      if (
        response.status === 503 ||
        response.status === 429
      ) {
        lastError = new OcrServiceError(
          response.status === 503
            ? "AI služba je momentálne preťažená. Skús to znova o chvíľu."
            : "AI služba momentálne dosiahla limit požiadaviek. Skús to neskôr.",
          response.status
        );

        if (index < MODELS.length - 1) {
          await sleep(1000);
          continue;
        }

        break;
      }

      throw new OcrServiceError(
        `AI služba vrátila chybu HTTP ${response.status}.`,
        502
      );
    }

    let responseData: unknown;

    try {
      responseData = await response.json();
    } catch {
      lastError = new OcrServiceError(
        "AI služba vrátila neplatnú odpoveď.",
        502
      );

      if (index < MODELS.length - 1) {
        continue;
      }

      break;
    }

    const rawText = extractText(responseData);

    if (!rawText) {
      lastError = new OcrServiceError(
        "AI služba nevrátila textový výsledok.",
        502
      );

      if (index < MODELS.length - 1) {
        continue;
      }

      break;
    }

    const parsed = parseJson(rawText);
    const result = parsed
      ? validateOcrResult(parsed)
      : null;

    if (!result) {
      lastError = new OcrServiceError(
        "Rozpoznané údaje neprešli kontrolou. Skús kvalitnejšiu fotografiu.",
        422
      );

      if (index < MODELS.length - 1) {
        continue;
      }

      break;
    }

    return result;
  }

  throw lastError;
}
