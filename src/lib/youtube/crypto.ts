import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

function encryptionKey() {
  const encoded = process.env.TOKEN_ENCRYPTION_KEY;
  if (!encoded || !/^[A-Za-z0-9+/]{43}=$/.test(encoded)) throw new Error("Token encryption key is not configured");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("Token encryption key is invalid");
  return key;
}

export function encryptToken(token: string) {
  if (!token || token.length > 4096) throw new Error("Invalid token length");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptToken(value: string) {
  const parts = value.split(".");
  if (parts.length !== 3 || parts.some((part) => !/^[A-Za-z0-9_-]+$/.test(part))) throw new Error("Invalid encrypted token");
  const [iv, tag, ciphertext] = parts.map((part) => Buffer.from(part, "base64url"));
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw new Error("Invalid encrypted token");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export function sameSecret(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (!left.length || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function tokenEncryptionConfigured() {
  try {
    encryptionKey();
    return true;
  } catch {
    return false;
  }
}
