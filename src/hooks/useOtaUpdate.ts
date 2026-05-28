import { useCallback, useEffect, useRef, useState } from "react";
import {
  APP_VERSION,
  checkForUpdate,
  dismissUpdate,
  downloadApk,
  isForceUpdateRequired,
  type VersionInfo,
} from "@/lib/otaUpdate";

const CHECK_INTERVAL_MS = 6 * 3600_000; // Re-check every 6 hours

export const useOtaUpdate = () => {
  const [updateInfo, setUpdateInfo] = useState<VersionInfo | null>(null);
  const [forceRequired, setForceRequired] = useState(false);
  const [checking, setChecking] = useState(false);
  const checkedRef = useRef(false);

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

  // Check on mount
  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    doCheck();
  }, [doCheck]);

  // Periodic re-check
  useEffect(() => {
    const id = setInterval(doCheck, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [doCheck]);

  const dismiss = useCallback(() => {
    dismissUpdate();
    setUpdateInfo(null);
  }, []);

  const download = useCallback(async () => {
    if (!updateInfo) return;
    await downloadApk(updateInfo.apkUrl);
  }, [updateInfo]);

  return {
    currentVersion: APP_VERSION,
    updateAvailable: Boolean(updateInfo),
    updateInfo,
    forceRequired,
    checking,
    checkForUpdate: doCheck,
    dismissUpdate: dismiss,
    downloadUpdate: download,
  };
};
