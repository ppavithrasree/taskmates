const SECRET_KEY = "secret_key_123";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

let cachedCryptoKey: Promise<CryptoKey> | null = null;

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const getCryptoKey = () => {
  if (!cachedCryptoKey) {
    cachedCryptoKey = crypto.subtle
      .digest("SHA-256", encoder.encode(SECRET_KEY))
      .then((digest) => crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]));
  }
  return cachedCryptoKey;
};

export const encryptGroupMessageForStorage = async (content: string) => {
  const key = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(content));
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
};

export const decryptGroupMessageFromStorage = async (ciphertext: string, iv: string) => {
  const key = await getCryptoKey();
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, key, base64ToBytes(ciphertext));
  return decoder.decode(decrypted);
};
