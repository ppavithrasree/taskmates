import type { GroupMessage, User } from "@/types";

const PRIVATE_KEY_PREFIX = "taskmates_private_key_v1_";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const toBase64 = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));
const fromBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const supportsCrypto = () => Boolean(globalThis.crypto?.subtle);

export const ensureUserEncryptionKeys = async (user: User): Promise<{ publicKey?: string; changed: boolean }> => {
  if (!supportsCrypto()) return { publicKey: user.publicKey, changed: false };
  const privateKey = localStorage.getItem(`${PRIVATE_KEY_PREFIX}${user.id}`);
  if (privateKey && user.publicKey) return { publicKey: user.publicKey, changed: false };

  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );

  const [publicJwk, privateJwk] = await Promise.all([
    crypto.subtle.exportKey("jwk", keyPair.publicKey),
    crypto.subtle.exportKey("jwk", keyPair.privateKey),
  ]);
  localStorage.setItem(`${PRIVATE_KEY_PREFIX}${user.id}`, JSON.stringify(privateJwk));
  return { publicKey: JSON.stringify(publicJwk), changed: true };
};

const importPublicKey = async (publicKey: string) =>
  crypto.subtle.importKey("jwk", JSON.parse(publicKey), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);

const importPrivateKey = async (userId: string) => {
  const raw = localStorage.getItem(`${PRIVATE_KEY_PREFIX}${userId}`);
  if (!raw || !supportsCrypto()) return null;
  return crypto.subtle.importKey("jwk", JSON.parse(raw), { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
};

export const encryptGroupMessageContent = async (
  content: string,
  members: User[]
): Promise<Pick<GroupMessage, "content" | "encryptedContent" | "encryptedKeys" | "encryptionVersion">> => {
  const membersWithKeys = members.filter((member) => member.publicKey);
  if (!supportsCrypto() || membersWithKeys.length !== members.length) {
    return { content };
  }

  const aesKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoder.encode(content));
  const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
  const encryptedKeys: Record<string, string> = {};

  await Promise.all(membersWithKeys.map(async (member) => {
    const publicKey = await importPublicKey(member.publicKey!);
    const encryptedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, rawAesKey);
    encryptedKeys[member.id] = toBase64(encryptedKey);
  }));

  return {
    content: "",
    encryptedContent: `${toBase64(iv)}.${toBase64(cipher)}`,
    encryptedKeys,
    encryptionVersion: 1,
  };
};

export const decryptGroupMessageContent = async (message: GroupMessage, userId: string): Promise<string> => {
  if (!message.encryptedContent || !message.encryptedKeys?.[userId]) return message.content;
  const privateKey = await importPrivateKey(userId);
  if (!privateKey) return "Encrypted message";

  try {
    const [ivBase64, cipherBase64] = message.encryptedContent.split(".");
    const rawAesKey = await crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, fromBase64(message.encryptedKeys[userId]));
    const aesKey = await crypto.subtle.importKey("raw", rawAesKey, { name: "AES-GCM" }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(ivBase64) }, aesKey, fromBase64(cipherBase64));
    return decoder.decode(plain);
  } catch {
    return "Encrypted message";
  }
};
