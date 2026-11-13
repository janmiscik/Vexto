import { createClient } from "@/lib/supabase/client";

const BUCKET = "receipt-images";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

async function authenticatedStorage() {
  const supabase = createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error("Používateľ nie je prihlásený.");
  return { supabase, userId: user.id };
}

function belongsToUser(path: string, userId: string): boolean {
  return path.startsWith(`${userId}/`) &&
    /^[-\w]+\/[-\w]+\.(?:jpg|jpeg|png|webp)$/.test(path);
}

/** Uploads a receipt image only into the authenticated user's folder. */
export async function uploadReceiptImage(receiptId: string, file: File): Promise<string> {
  const { supabase, userId } = await authenticatedStorage();
  if (!/^[a-zA-Z0-9_-]{1,256}$/.test(receiptId)) {
    throw new Error("Neplatné ID dokladu.");
  }
  const extension = ALLOWED_TYPES.get(file.type);
  if (!extension) throw new Error("Povolené sú iba fotografie JPG, PNG a WebP.");
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
    throw new Error("Fotografia musí mať veľkosť najviac 8 MB.");
  }
  const path = `${userId}/${receiptId}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Returns an error rather than throwing to preserve the caller's behavior. */
export async function removeReceiptImage(path: string) {
  try {
    const { supabase, userId } = await authenticatedStorage();
    if (!belongsToUser(path, userId)) {
      return new Error("Fotografia nepatrí prihlásenému používateľovi.");
    }
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    return error;
  } catch (error) {
    return error instanceof Error ? error : new Error("Nepodarilo sa overiť prístup k fotografii.");
  }
}

/** Generates a short-lived signed URL only for a path in the user's folder. */
export async function getReceiptImageSignedUrl(path: string) {
  try {
    const { supabase, userId } = await authenticatedStorage();
    if (!belongsToUser(path, userId)) {
      return { url: null, error: new Error("Fotografia nepatrí prihlásenému používateľovi.") };
    }
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
    return { url: error ? null : (data?.signedUrl ?? null), error };
  } catch (error) {
    return { url: null, error: error instanceof Error ? error : new Error("Nepodarilo sa overiť prístup k fotografii.") };
  }
}
