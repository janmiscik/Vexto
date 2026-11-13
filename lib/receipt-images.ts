import { createClient } from "@/lib/supabase/client";

const BUCKET = "receipt-images";

/** Uploads an original receipt image to the authenticated user's private folder. */
export async function uploadReceiptImage(receiptId: string, file: File): Promise<string> {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error("Používateľ nie je prihlásený.");

  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${user.id}/${receiptId}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return path;
}

/** Returns the storage error so the caller can preserve its existing warning behavior. */
export async function removeReceiptImage(path: string) {
  const { error } = await createClient().storage.from(BUCKET).remove([path]);
  return error;
}

/** Generates a short-lived URL; the bucket remains private. */
export async function getReceiptImageSignedUrl(path: string) {
  const { data, error } = await createClient().storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  return { url: error ? null : (data?.signedUrl ?? null), error };
}
