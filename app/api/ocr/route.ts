
import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

import {
  MAX_IMAGE_BYTES,
  parseImageData,
  getImageSize,
} from "@/lib/ocr/validation";

import {
  recognizeReceipt,
  OcrServiceError,
} from "@/lib/ocr/gemini";

export async function POST(request: Request) {
  try {
    // Overenie prihlásenia používateľa
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: "Na použitie OCR sa musíte prihlásiť.",
        },
        { status: 401 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error: "OCR služba nie je nakonfigurovaná.",
        },
        { status: 503 }
      );
    }

    const contentLength = Number(
      request.headers.get("content-length") || 0
    );

    if (contentLength > MAX_IMAGE_BYTES * 1.5) {
      return NextResponse.json(
        {
          error:
            "Obrázok je príliš veľký (maximum 8 MB).",
        },
        { status: 413 }
      );
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: "Neplatné JSON telo požiadavky.",
        },
        { status: 400 }
      );
    }

    const imageBase64 =
      body &&
      typeof body === "object" &&
      "imageBase64" in body
        ? (
            body as {
              imageBase64?: unknown;
            }
          ).imageBase64
        : undefined;

    if (
      typeof imageBase64 !== "string" ||
      !imageBase64
    ) {
      return NextResponse.json(
        {
          error: "Neboli odoslané obrazové dáta.",
        },
        { status: 400 }
      );
    }

    const image = parseImageData(imageBase64);

    if (!image) {
      return NextResponse.json(
        {
          error:
            "Nepodporovaný alebo neplatný formát obrázka. Použi JPEG, PNG alebo WebP.",
        },
        { status: 400 }
      );
    }

    const imageSize = getImageSize(image.base64);

    if (
      imageSize <= 0 ||
      imageSize > MAX_IMAGE_BYTES
    ) {
      return NextResponse.json(
        {
          error:
            "Obrázok je príliš veľký alebo prázdny (maximum 8 MB).",
        },
        { status: 413 }
      );
    }

    const result = await recognizeReceipt(
      image,
      apiKey
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: unknown) {
    if (error instanceof OcrServiceError) {
      return NextResponse.json(
        {
          error: error.message,
        },
        { status: error.status }
      );
    }

    console.error(
      "[Vexto OCR] Interná chyba:",
      error instanceof Error
        ? error.name
        : "neznáma chyba"
    );

    return NextResponse.json(
      {
        error:
          "Pri spracovaní obrázka nastala interná chyba.",
      },
      { status: 500 }
    );
  }
}
