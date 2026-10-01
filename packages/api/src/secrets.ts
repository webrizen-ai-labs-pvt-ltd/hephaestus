/**
 * Encrypts small secrets (payment gateway keys) at rest with AES-256-GCM.
 * Output: base64url(iv) + "." + base64url(ciphertext+tag).
 */
export interface SecretBox {
  encrypt(plain: string): Promise<string>;
  decrypt(sealed: string): Promise<string>;
  /** Stable, unguessable token for a value (e.g. an invoice's client link). */
  sign(value: string): Promise<string>;
}

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, "base64url"));

export function createSecretBox(secret: string): SecretBox {
  const keyPromise = crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(`hephaestus-secrets:${secret}`))
    .then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));

  const macKey = crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(`hephaestus-links:${secret}`))
    .then((raw) => crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]));

  return {
    async sign(value) {
      return b64(new Uint8Array(await crypto.subtle.sign("HMAC", await macKey, new TextEncoder().encode(value))));
    },
    async encrypt(plain) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyPromise, new TextEncoder().encode(plain));
      return `${b64(iv)}.${b64(new Uint8Array(ct))}`;
    },
    async decrypt(sealed) {
      const [iv, ct] = sealed.split(".");
      if (!iv || !ct) throw new Error("Malformed secret");
      const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, await keyPromise, unb64(ct));
      return new TextDecoder().decode(plain);
    },
  };
}

export async function sha256Hex(value: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(d).toString("hex");
}

export function randomToken(bytes = 32) {
  return b64(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function hmacSha256Hex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))).toString("hex");
}

/** Constant-time comparison of two hex/ASCII strings. */
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
