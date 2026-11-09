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

    // 1. Zoznam modelov z Google AI účtu
    const listRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const listData = await listRes.json();

    if (!listRes.ok || !listData.models) {
      throw new Error(listData.error?.message || "Nepodarilo sa načítať dostupné modely");
    }

    // Filtrujeme LEN modely, ktoré podporujú 'generateContent' a NIE SÚ čisto hlasové (tts)
    const visionModels: string[] = listData.models
      .filter((m: any) => {
        const name = m.name.toLowerCase();
        const supportsGen = m.supportedGenerationMethods?.includes("generateContent");
        const isNotTts = !name.includes("tts") && !name.includes("audio");
        return supportsGen && isNotTts;
      })
      .map((m: any) => m.name.replace("models/", ""));

    console.log("[Vexto OCR] Vhodné obrazové modely:", visionModels);

    // Zoradenie podľa vhodnosti: flash modely ako prvé, potom pro modely
    const sortedModels = visionModels.sort((a, b) => {
      const getScore = (name: string) => {
        let score = 0;
        if (name === "gemini-3.8-flash") score += 50;
        else if (name.includes("3.8-pro")) score += 40;
        else if (name.includes("flash")) score += 30;
        else if (name.includes("pro")) score += 20;
        return score;
      };
      return getScore(b) - getScore(a);
    });

    const prompt = `Si slovenský účtovný asistent. Analyzuj tento pokladničný doklad a vráť striktne iba JSON objekt:
{
  "organizationName": "Názov firmy/predajne",
  "ico": "IČO predajcu",
  "dic": "DIČ",
  "icDph": "IČ DPH",
  "issueDate": "YYYY-MM-DD",
  "totalAmount": 0.00
}
Hodnota totalAmount musí byť číslo (float). Ak údaj chýba, vráť prázdny reťazec alebo 0.`;

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
      },
    };

    let resultData = null;
    let lastErrorMsg = "";

    // Skúsime prvé 3 najlepšie obrazové modely
    for (const model of sortedModels.slice(0, 3)) {
      console.log(`[Vexto OCR] Odosielam požiadavku na: ${model}`);
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestPayload),
            signal: AbortSignal.timeout(18000),
          }
        );

        const data = await res.json();

        if (!res.ok) {
          lastErrorMsg = data.error?.message || `HTTP ${res.status}`;
          console.warn(`[Vexto OCR] ${model} vrátil kód ${res.status}:`, lastErrorMsg);
          // Pri 503 (vyťaženie) pokračujeme hneď ďalším modelom v poradí (napr. Pro)
          continue;
        }

        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const sanitized = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
          resultData = JSON.parse(sanitized);
          console.log(`[Vexto OCR] Úspešne spracované cez model: ${model}`);
          break;
        }
      } catch (err: any) {
        lastErrorMsg = err.message;
        console.warn(`[Vexto OCR] Chyba siete pre ${model}:`, err.message);
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