import { useCallback, useEffect, useState } from "react";
import { type DisplayState, loadState, onSync, saveState } from "../lib/config";

export function useDisplayState() {
  const [state, setState] = useState<DisplayState>(loadState);

  useEffect(() => onSync((type) => {
    if (type === "state") setState(loadState());
  }), []);

  const persist = useCallback((next: DisplayState) => {
    saveState(next);
    setState(next);
  }, []);

  const reload = useCallback(() => setState(loadState()), []);

  return { state, persist, reload };
}
