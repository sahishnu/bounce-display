import { useCallback, useEffect, useState } from "react";
import { type DisplayConfig, loadConfig, onSync, saveConfig } from "../lib/config";

export function useDisplayConfig() {
  const [config, setConfig] = useState<DisplayConfig>(loadConfig);

  useEffect(() => onSync((type) => {
    if (type === "config") setConfig(loadConfig());
  }), []);

  const persist = useCallback((next: DisplayConfig) => {
    saveConfig(next);
    setConfig(next);
  }, []);

  const reload = useCallback(() => setConfig(loadConfig()), []);

  return { config, persist, reload };
}
