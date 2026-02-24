const ENCRYPTED_VALUE_VERSION = "v1";
const AES_GCM_IV_BYTES = 12;
const AES_256_KEY_BYTES = 32;

export type SecretCryptoEnv = {
  CREDENTIALS_ENCRYPTION_KEY: string;
};

let cachedKey: CryptoKey | null = null;
let cachedRawKey: string | null = null;

export async function encryptSecret(env: SecretCryptoEnv, plaintext: string): Promise<string> {
  const key = await getCryptoKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const cipher = new Uint8Array(cipherBuffer);

  return [ENCRYPTED_VALUE_VERSION, toBase64(iv), toBase64(cipher)].join(":");
}

export async function decryptSecret(env: SecretCryptoEnv, encryptedValue: string): Promise<string> {
  const parts = encryptedValue.split(":");
  if (parts.length !== 3 || parts[0] !== ENCRYPTED_VALUE_VERSION) {
    throw new Error("Unsupported encrypted secret format");
  }

  const key = await getCryptoKey(env);
  const iv = fromBase64(parts[1]);
  const cipher = fromBase64(parts[2]);

  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(cipher),
  );
  return new TextDecoder().decode(plainBuffer);
}

async function getCryptoKey(env: SecretCryptoEnv): Promise<CryptoKey> {
  const rawKey = env.CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!rawKey) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY is required");
  }

  if (cachedKey && cachedRawKey === rawKey) {
    return cachedKey;
  }

  const keyBytes = fromBase64(rawKey);
  if (keyBytes.byteLength !== AES_256_KEY_BYTES) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }

  const key = await crypto.subtle.importKey("raw", toArrayBuffer(keyBytes), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);

  cachedKey = key;
  cachedRawKey = rawKey;
  return key;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
