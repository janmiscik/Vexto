
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type OcrResult = {
  organizationName: string;
  ico: string;
  dic: string;
  icDph: string;
  issueDate: string;
  totalAmount: number;
};

export type ParsedImage = {
  mimeType: string;
  base64: string;
};

export function parseImageData(
  value: string
): ParsedImage | null {
  const match = value.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i
  );

  if (!match) return null;

  const mimeType = match[1].toLowerCase();

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return null;
  }

  return {
    mimeType,
    base64: match[2],
  };
}

export function getImageSize(base64: string): number {
  return (
    Math.floor((base64.length * 3) / 4) -
    (base64.endsWith("==")
      ? 2
      : base64.endsWith("=")
        ? 1
        : 0)
  );
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

export function validateOcrResult(
  value: unknown
): OcrResult | null {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return null;
  }

  const data = value as Record<string, unknown>;

  const textFields = [
    "organizationName",
    "ico",
    "dic",
    "icDph",
  ] as const;

  if (
    textFields.some(
      (key) => typeof data[key] !== "string"
    )
  ) {
    return null;
  }

  const amount = data.totalAmount;

  if (
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    amount > 100_000_000
  ) {
    return null;
  }

  const issueDate = data.issueDate;

  if (
    typeof issueDate !== "string" ||
    (issueDate !== "" && !isValidDate(issueDate))
  ) {
    return null;
  }

  const result: OcrResult = {
    organizationName: (
      data.organizationName as string
    ).trim().slice(0, 200),

    ico: (data.ico as string)
      .replace(/\s/g, "")
      .slice(0, 20),

    dic: (data.dic as string)
      .replace(/\s/g, "")
      .slice(0, 20),

    icDph: (data.icDph as string)
      .replace(/\s/g, "")
      .slice(0, 30),

    issueDate,
    totalAmount: amount,
  };

  if (result.ico && !/^\d{8}$/.test(result.ico)) {
    return null;
  }

  return result;
}
