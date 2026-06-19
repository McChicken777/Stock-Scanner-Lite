import crypto from "node:crypto";

// Symmetric encryption for secrets stored at rest (e.g. per-company SMTP passwords).
// Key is derived from a server secret — set EMAIL_ENC_KEY (or SESSION_SECRET) in prod.
const keySource =
  process.env.EMAIL_ENC_KEY ||
  process.env.SESSION_SECRET ||
  "fabriflow-insecure-dev-key-change-me";
const KEY = crypto.createHash("sha256").update(keySource).digest(); // 32 bytes

/** Encrypt a UTF-8 string → "iv:tag:ciphertext" (all base64). */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/** Decrypt a value produced by encryptSecret. Returns null if it can't be decrypted. */
export function decryptSecret(enc: string | null | undefined): string | null {
  if (!enc) return null;
  try {
    const [ivB64, tagB64, ctB64] = enc.split(":");
    if (!ivB64 || !tagB64 || !ctB64) return null;
    const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    const pt = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]);
    return pt.toString("utf8");
  } catch {
    return null;
  }
}
