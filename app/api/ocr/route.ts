import { NextResponse } from "next/server";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Chýba GEMINI_API_KEY v súbore .env.local" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { imageBase64 } = body;

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return NextResponse.json(
        { error: "Neboli odoslané žiadne obrazové dáta" },
        { status: 400 }
      );
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/[a-z]+;base64,/, "");

    const prompt = `Si slovenský účtovný asistent. Analyzuj tento pokladničný doklad a vráť striktne iba JSON objekt:
{
  "organizationName": "Názov firmy/predajne",
  "ico": "IČO predajcu",
  "dic": "DIČ",
  "icDph": "IČ DPH",
  "issueDate": "YYYY-MM-DD",
  "totalAmount": 0.00
}
Hodnota totalAmount musí byť číslo (float). Ak údaj nevieš nájsť, nastav prázdny reťazec alebo 0.`;

    const requestPayload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: "image/jpeg",
                data: cleanBase64,
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

    // Používame len Flash modely, ktoré majú povolenú bezplatnú kvótu
    const model = "gemini-3.8-flash";
    let resultData = null;
    let lastErrorMsg = "";

    // 3 pokusy s odstupom (pri preťažení 503 alebo 429)
    for (let attempt = 1; attempt <= 3; attempt++) {
      console.log(`[Vexto OCR] Odosielam na ${model} (pokus ${attempt}/3)...`);
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestPayload),
            signal: AbortSignal.timeout(20000),
          }
        );

        const data = await res.json();

        if (!res.ok) {
          lastErrorMsg = data.error?.message || `HTTP ${res.status}`;
          console.warn(`[Vexto OCR] Pokus ${attempt} zlyhal (${res.status}):`, lastErrorMsg);

          // 503 (vyťaženie) alebo 429 (rate limit) -> počkáme a skúsime znovu
          if (res.status === 503 || res.status === 429) {
            const waitTime = attempt * 2000; // 2s, potom 4s
            console.log(`[Vexto OCR] Čakám ${waitTime}ms pred ďalším pokusom...`);
            await sleep(waitTime);
            continue;
          }
          break;
        }

        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const sanitized = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
          resultData = JSON.parse(sanitized);
          console.log(`[Vexto OCR] Úspech na pokus ${attempt}!`, resultData);
          break;
        }
      } catch (err: any) {
        lastErrorMsg = err.message || "Timeout siete";
        console.warn(`[Vexto OCR] Sieťová chyba pokusu ${attempt}:`, lastErrorMsg);
        await sleep(1500);
      }
    }

    if (!resultData) {
      return NextResponse.json(
        { error: `OCR zlyhalo: ${lastErrorMsg}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, data: resultData });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Chyba pri spracovaní fotky";
    console.error("[Vexto OCR Global Error]:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}