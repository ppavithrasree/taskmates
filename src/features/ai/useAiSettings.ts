import { useEffect, useState } from "react";
import { hasStoredGeminiKey, loadAiEnabled } from "./storage";

export const useAiSettings = (userId?: string | null) => {
  const [enabled, setEnabled] = useState(() => loadAiEnabled());
  const [hasKey, setHasKey] = useState(() => hasStoredGeminiKey(userId));

  useEffect(() => {
    const refresh = () => {
      setEnabled(loadAiEnabled());
      setHasKey(hasStoredGeminiKey(userId));
    };
    refresh();
    window.addEventListener("taskmates-ai-settings", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("taskmates-ai-settings", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [userId]);

  return { enabled, hasKey };
};
