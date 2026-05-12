import type { Group, User } from "@/types";

const IDENTITY_PREFIX = "taskmates_e2e_identity_";
const GROUP_KEY_PREFIX = "taskmates_group_key_";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type StoredIdentity = {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
};

type WrappedKeyPayload = {
  v: 1;
  epk: JsonWebKey;
  iv: string;
  ciphertext: string;
};

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

const groupKeyCacheKey = (userId: string, groupId: string) => `${GROUP_KEY_PREFIX}${userId}_${groupId}`;

const importPrivateIdentityKey = async (privateKey: JsonWebKey) =>
  crypto.subtle.importKey("jwk", privateKey, { name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);

const importPublicIdentityKey = async (publicKey: JsonWebKey) =>
  crypto.subtle.importKey("jwk", publicKey, { name: "ECDH", namedCurve: "P-256" }, true, []);

const deriveWrappingKey = async (privateKey: CryptoKey, publicKey: CryptoKey) =>
  crypto.subtle.deriveKey(
    { name: "ECDH", public: publicKey },
    privateKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

const importGroupKey = async (groupKey: string) =>
  crypto.subtle.importKey("raw", base64ToBytes(groupKey), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);

export const ensureEncryptionIdentity = async (userId: string) => {
  const storageKey = `${IDENTITY_PREFIX}${userId}`;
  const existing = localStorage.getItem(storageKey);
  if (existing) return JSON.parse(existing) as StoredIdentity;

  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  const identity: StoredIdentity = {
    publicKey: await crypto.subtle.exportKey("jwk", pair.publicKey),
    privateKey: await crypto.subtle.exportKey("jwk", pair.privateKey),
  };
  localStorage.setItem(storageKey, JSON.stringify(identity));
  return identity;
};

export const publicKeyString = (identity: StoredIdentity) => JSON.stringify(identity.publicKey);

export const generateGroupKey = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
};

export const getCachedGroupKey = (userId: string, groupId: string) => localStorage.getItem(groupKeyCacheKey(userId, groupId));

export const cacheGroupKey = (userId: string, groupId: string, groupKey: string) => {
  localStorage.setItem(groupKeyCacheKey(userId, groupId), groupKey);
};

export const clearCachedGroupKey = (userId: string, groupId: string) => {
  localStorage.removeItem(groupKeyCacheKey(userId, groupId));
};

export const encryptGroupKeyForUser = async (recipientPublicKey: string, groupKey: string) => {
  const recipientKey = await importPublicIdentityKey(JSON.parse(recipientPublicKey) as JsonWebKey);
  const ephemeralPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  const wrappingKey = await deriveWrappingKey(ephemeralPair.privateKey, recipientKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, encoder.encode(groupKey));
  const payload: WrappedKeyPayload = {
    v: 1,
    epk: await crypto.subtle.exportKey("jwk", ephemeralPair.publicKey),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
  return JSON.stringify(payload);
};

export const decryptGroupKeyForUser = async (userId: string, groupId: string, encryptedKey?: string) => {
  const cached = getCachedGroupKey(userId, groupId);
  if (cached) return cached;
  if (!encryptedKey) return null;
  const groupKey = await decryptWrappedKeyForUser(userId, encryptedKey);
  if (groupKey) cacheGroupKey(userId, groupId, groupKey);
  return groupKey;
};

export const decryptWrappedKeyForUser = async (userId: string, encryptedKey?: string) => {
  if (!encryptedKey) return null;
  const identityRaw = localStorage.getItem(`${IDENTITY_PREFIX}${userId}`);
  if (!identityRaw) return null;
  const identity = JSON.parse(identityRaw) as StoredIdentity;
  const payload = JSON.parse(encryptedKey) as WrappedKeyPayload;
  const privateKey = await importPrivateIdentityKey(identity.privateKey);
  const ephemeralPublic = await importPublicIdentityKey(payload.epk);
  const wrappingKey = await deriveWrappingKey(privateKey, ephemeralPublic);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(payload.iv) },
    wrappingKey,
    base64ToBytes(payload.ciphertext)
  );
  return decoder.decode(decrypted);
};

export const encryptMessageContent = async (groupKey: string, content: string) => {
  const key = await importGroupKey(groupKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(content));
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(encrypted)),
  };
};

export const decryptMessageContent = async (groupKey: string, iv: string, ciphertext: string) => {
  const key = await importGroupKey(groupKey);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, key, base64ToBytes(ciphertext));
  return decoder.decode(decrypted);
};

export const encryptedKeysForMembers = async (members: User[], groupKey: string, existing: Record<string, string> = {}) => {
  const encryptedKeys = { ...existing };
  for (const member of members) {
    if (!member.publicKey || encryptedKeys[member.id]) continue;
    encryptedKeys[member.id] = await encryptGroupKeyForUser(member.publicKey, groupKey);
  }
  return encryptedKeys;
};

export const canDecryptGroup = async (group: Group, userId: string) => {
  const key = await decryptGroupKeyForUser(userId, group.id, group.encryptedKeys?.[userId]).catch(() => null);
  return Boolean(key);
};
