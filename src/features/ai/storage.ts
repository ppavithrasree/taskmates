import { AI_STORAGE_KEYS } from "./constants";

interface StoredSecret {
  iv: string;
  ciphertext: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (bytes: ArrayBuffer | Uint8Array) => {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...array));
};

const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const keyMaterialFor = async (userId: string) => {
  const material = `${location.origin}:${navigator.userAgent}:${userId}:taskmates-ai`;
  return crypto.subtle.importKey("raw", encoder.encode(material), "PBKDF2", false, ["deriveKey"]);
};

const cryptoKeyFor = async (userId: string) => {
  const material = await keyMaterialFor(userId);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: encoder.encode("taskmates-gemini-key"), iterations: 120_000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

export const loadAiEnabled = () => localStorage.getItem(AI_STORAGE_KEYS.enabled) === "true";

export const saveAiEnabled = (enabled: boolean) => {
  localStorage.setItem(AI_STORAGE_KEYS.enabled, String(enabled));
  window.dispatchEvent(new Event("taskmates-ai-settings"));
};

export const hasStoredGeminiKey = (userId?: string | null) => {
  if (!userId) return false;
  return Boolean(localStorage.getItem(`${AI_STORAGE_KEYS.key}:${userId}`));
};

export const saveGeminiKey = async (userId: string, key: string) => {
  const clean = key.trim();
  if (!clean) throw new Error("Paste a Gemini API key first.");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await cryptoKeyFor(userId);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, encoder.encode(clean));
  const payload: StoredSecret = { iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
  localStorage.setItem(`${AI_STORAGE_KEYS.key}:${userId}`, JSON.stringify(payload));
  window.dispatchEvent(new Event("taskmates-ai-settings"));
};

export const removeGeminiKey = (userId: string) => {
  localStorage.removeItem(`${AI_STORAGE_KEYS.key}:${userId}`);
  window.dispatchEvent(new Event("taskmates-ai-settings"));
};

export const loadGeminiKey = async (userId?: string | null) => {
  if (!userId) return null;
  const raw = localStorage.getItem(`${AI_STORAGE_KEYS.key}:${userId}`);
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as StoredSecret;
    const cryptoKey = await cryptoKeyFor(userId);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(payload.iv) },
      cryptoKey,
      fromBase64(payload.ciphertext)
    );
    return decoder.decode(plaintext);
  } catch {
    return null;
  }
};

export const loadProcessedMentions = (userId: string) => {
  try {
    return new Set(JSON.parse(localStorage.getItem(`${AI_STORAGE_KEYS.processedMentions}:${userId}`) ?? "[]") as string[]);
  } catch {
    return new Set<string>();
  }
};

export const saveProcessedMentions = (userId: string, ids: Set<string>) => {
  localStorage.setItem(`${AI_STORAGE_KEYS.processedMentions}:${userId}`, JSON.stringify([...ids].slice(-250)));
};
