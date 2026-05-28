/**
 * Self-hosted OTA update system — checks GitHub raw URL for version.json
 * and allows downloading/installing APK from GitHub Releases.
 */

const VERSION_URL =
  "https://raw.githubusercontent.com/ppavithrasree/taskmates/main/public/version.json";

const LS_KEY = "taskmates_ota";

export interface VersionInfo {
  version: string;
  minVersion: string;
  releaseDate: string;
  releaseNotes: string;
  apkUrl: string;
}

interface OtaCache {
  lastCheck: number;
  dismissedAt?: number;
  latestVersion?: string;
}

const loadCache = (): OtaCache => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch {
    return { lastCheck: 0 };
  }
};

const saveCache = (cache: OtaCache) => {
  localStorage.setItem(LS_KEY, JSON.stringify(cache));
};

/** Current app version from build-time constant */
export const APP_VERSION = __APP_VERSION__;

/** Compare two semver strings — returns 1 if a > b, -1 if a < b, 0 if equal */
export const compareSemver = (a: string, b: string): number => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
};

export const checkForUpdate = async (): Promise<VersionInfo | null> => {
  try {
    const response = await fetch(VERSION_URL, { cache: "no-store" });
    if (!response.ok) return null;
    const info: VersionInfo = await response.json();
    const cache = loadCache();
    cache.lastCheck = Date.now();
    cache.latestVersion = info.version;
    saveCache(cache);
    // If remote version > current version, update available
    if (compareSemver(info.version, APP_VERSION) > 0) return info;
    return null;
  } catch {
    return null;
  }
};

export const isForceUpdateRequired = (remoteInfo: VersionInfo | null): boolean => {
  if (!remoteInfo) return false;
  // Force if current version < minVersion
  if (compareSemver(APP_VERSION, remoteInfo.minVersion) < 0) return true;
  // Force if user has been dismissing for 10+ days
  const cache = loadCache();
  if (cache.dismissedAt) {
    const daysSinceDismiss = (Date.now() - cache.dismissedAt) / 86_400_000;
    if (daysSinceDismiss >= 10) return true;
  }
  return false;
};

export const dismissUpdate = () => {
  const cache = loadCache();
  if (!cache.dismissedAt) cache.dismissedAt = Date.now();
  saveCache(cache);
};

export const clearDismiss = () => {
  const cache = loadCache();
  delete cache.dismissedAt;
  saveCache(cache);
};

export const downloadApk = async (url: string) => {
  try {
    // On Capacitor/Android, open the URL in the system browser to trigger download
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
  } catch {
    // Fallback for web
    window.open(url, "_blank");
  }
};
