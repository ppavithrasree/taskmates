import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import {
  APP_VERSION,
  checkForUpdate,
  dismissUpdate,
  downloadApk,
  isForceUpdateRequired,
  type VersionInfo,
} from "@/lib/otaUpdate";

export const useOtaUpdate = () => {
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);
  const [forceRequired, setForceRequired] = useState(false);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  const doCheck = useCallback(async () => {
    setChecking(true);
    try {
      const info = await checkForUpdate();
      setUpdateInfo(info);
      setForceRequired(isForceUpdateRequired(info));
    } catch {
      /* silent */
    } finally {
      setChecking(false);
    }
  }, []);

  // Check on first mount
  useEffect(() => {
    doCheck();
  }, [doCheck]);

  // Check every time user brings app to foreground
  useEffect(() => {
    const listener = App.addListener("appStateChange", ({ isActive }) => {
      if (isActive) doCheck(); // fired when app comes to foreground
    });
    return () => {
      listener.then((l) => l.remove());
    };
  }, [doCheck]);

  const dismiss = useCallback(() => {
    dismissUpdate();
    setUpdateInfo(null);
  }, []);

  const download = useCallback(async () => {
    if (!updateInfo) return;
    setDownloading(true);
    setDownloadProgress(0);
    try {
      await downloadApk(updateInfo.apkUrl, (pct) => {
        setDownloadProgress(pct);
      });
    } finally {
      setDownloading(false);
    }
  }, [updateInfo]);

  return {
    currentVersion: APP_VERSION,
    updateAvailable: Boolean(updateInfo),
    updateInfo,
    forceRequired,
    checking,
    downloading,
    downloadProgress,
    checkForUpdate: doCheck,
    dismissUpdate: dismiss,
    downloadUpdate: download,
  };
};