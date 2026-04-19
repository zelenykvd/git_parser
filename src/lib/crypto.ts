import crypto from "crypto";
import { config } from "../config.js";

// AES-256-GCM. Key is derived once via scrypt from SETTINGS_ENCRYPTION_KEY.
// Format stored in DB: base64(salt(16) | iv(12) | tag(16) | ciphertext)

const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

function deriveKey(salt: Buffer): Buffer {
  return crypto.scryptSync(config.settings.encryptionKey, salt, KEY_LEN);
}

export function encryptSecret(plaintext: string): string {
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(salt);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, tag, ct]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  if (buf.length < SALT_LEN + IV_LEN + TAG_LEN) {
    throw new Error("Encrypted payload too short");
  }
  const salt = buf.subarray(0, SALT_LEN);
  const iv = buf.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = buf.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ct = buf.subarray(SALT_LEN + IV_LEN + TAG_LEN);

  const key = deriveKey(salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}

export function maskToken(token: string): string {
  if (token.length <= 8) return "****";
  // Bot tokens look like "123456789:ABCdef..." — keep the numeric id, mask the secret.
  const colonIdx = token.indexOf(":");
  if (colonIdx > 0) {
    const id = token.slice(0, colonIdx);
    const tail = token.slice(-4);
    return `${id}:****${tail}`;
  }
  return `****${token.slice(-4)}`;
}
