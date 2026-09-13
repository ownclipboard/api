import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { env } from "../../env";

/**
 * AES-256-GCM encryption for secrets stored at rest (e.g. users' owns3 api keys).
 * The key is derived from the app SECRET_KEY, so rotating SECRET_KEY invalidates
 * every stored secret.
 *
 * Format: base64(iv) . base64(authTag) . base64(ciphertext)
 */
const KEY = createHash("sha256").update(env.SECRET_KEY).digest();

export function encryptSecret(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", KEY, iv);
    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [iv, tag, encrypted].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string): string {
    const [iv, tag, encrypted] = payload.split(".").map((p) => Buffer.from(p, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
