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
  console.log("[OTA Update] Checking for updates...");
  console.log("[OTA Update] VERSION_URL:", VERSION_URL);
  console.log("[OTA Update] Current APP_VERSION:", APP_VERSION);
  try {
    const response = await fetch(VERSION_URL, { cache: "no-store" });
    console.log("[OTA Update] fetch response status:", response.status);
    if (!response.ok) {
      console.warn("[OTA Update] Fetch failed, status not ok");
      return null;
    }
    const info: VersionInfo = await response.json();
    console.log("[OTA Update] Remote version info received:", info);
    const cache = loadCache();
    cache.lastCheck = Date.now();
    cache.latestVersion = info.version;
    saveCache(cache);
    // If remote version > current version, update available
    const comparison = compareSemver(info.version, APP_VERSION);
    console.log(`[OTA Update] Comparing remote version ${info.version} with local ${APP_VERSION}: comparison result = ${comparison}`);
    if (comparison > 0) {
      console.log("[OTA Update] Update is available!");
      return info;
    }
    console.log("[OTA Update] No update available.");
    return null;
  } catch (error) {
    console.error("[OTA Update] Error during check:", error);
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

export const downloadApk = async (url: string, onProgress?: (pct: number) => void) => {
  let progressListener: { remove: () => Promise<void> } | null = null;
  console.log("[OTA Update] downloadApk started for URL:", url);
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { FileOpener } = await import("@capacitor-community/file-opener");

    if (onProgress) {
      progressListener = await Filesystem.addListener("progress", (progress) => {
        if (progress.contentLength > 0) {
          const pct = Math.round((progress.bytes / progress.contentLength) * 100);
          console.log(`[OTA Update] Download progress: ${pct}% (${progress.bytes}/${progress.contentLength})`);
          onProgress(pct);
        }
      });
    }

    console.log("[OTA Update] Triggering Filesystem.downloadFile");
    const downloadResult = await Filesystem.downloadFile({
      url,
      path: "taskmates-update.apk",
      directory: Directory.Cache,
      progress: true,
      recursive: true,
    });

    console.log("[OTA Update] Filesystem.downloadFile complete, result:", downloadResult);

    if (!downloadResult.path) {
      throw new Error("Download completed but path is missing in result");
    }

    // On Android, we need the file:// URI to pass to FileOpener
    console.log("[OTA Update] Resolving URI for path:", downloadResult.path);
    const uriResult = await Filesystem.getUri({
      path: "taskmates-update.apk",
      directory: Directory.Cache,
    });
    console.log("[OTA Update] Resolved URI:", uriResult.uri);

    // Open APK to trigger Android install prompt
    console.log("[OTA Update] Opening APK with FileOpener");
    await FileOpener.open({
      filePath: uriResult.uri,
      contentType: "application/vnd.android.package-archive",
      openWithDefault: true,
    });
    console.log("[OTA Update] FileOpener.open successfully triggered");

    clearDismiss();
  } catch (err) {
    console.error("[OTA Update] APK download/install failed:", err);
    // Fallback — open browser if everything fails
    console.log("[OTA Update] Falling back to opening URL in browser");
    window.open(url, "_blank");
  } finally {
    if (progressListener) {
      try {
        await progressListener.remove();
        console.log("[OTA Update] Progress listener removed");
      } catch (e) {
        console.error("[OTA Update] Error removing progress listener:", e);
      }
    }
  }
};