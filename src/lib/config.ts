import type { CSSProperties } from "react";

export const DEFAULT_LOGO_URL = "/SYM_Logo.png";

export type DisplayConfig = {
  backgroundColor: string;
  textColor: string;
  timerFontSize: number;
  boxWidth: number;
  boxHeight: number;
  imageScalePercent: number;
  borderWidth: number;
  borderColor: string;
  timerDurationSeconds: number;
  imageDataUrl: string | null;
};

export type DisplayState = {
  timerStartedAt: number | null;
  timerPausedRemainingMs: number | null;
};

export const DEFAULT_CONFIG: DisplayConfig = {
  backgroundColor: "#000000",
  textColor: "#ffffff",
  timerFontSize: 96,
  boxWidth: 640,
  boxHeight: 360,
  imageScalePercent: 40,
  borderWidth: 2,
  borderColor: "#ffffff",
  timerDurationSeconds: 300,
  imageDataUrl: null,
};

export const DEFAULT_STATE: DisplayState = {
  timerStartedAt: null,
  timerPausedRemainingMs: null,
};

const STORAGE_KEY = "bounce-display-config";
const STATE_KEY = "bounce-display-state";
const CHANNEL_NAME = "bounce-display-sync";

export function resolveLogoSrc(config: DisplayConfig): string {
  return config.imageDataUrl || DEFAULT_LOGO_URL;
}

export function loadConfig(): DisplayConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: DisplayConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  notifyChange("config");
}

export function loadState(): DisplayState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveState(state: DisplayState): void {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
  notifyChange("state");
}

function notifyChange(type: "config" | "state"): void {
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type });
    channel.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
  window.dispatchEvent(new CustomEvent("bounce-display-update", { detail: { type } }));
}

export function onSync(callback: (type: "config" | "state") => void): () => void {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (e) => callback(e.data?.type ?? "config");
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent<{ type: "config" | "state" }>).detail;
    callback(detail?.type ?? "config");
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback("config");
    if (e.key === STATE_KEY) callback("state");
  };
  window.addEventListener("bounce-display-update", onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    channel.close();
    window.removeEventListener("bounce-display-update", onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

export function timerStyle(config: DisplayConfig, scale = 1): CSSProperties {
  const base = Math.max(12, Math.round(config.timerFontSize || DEFAULT_CONFIG.timerFontSize));
  const factor = Math.max(0.05, scale);
  return {
    color: config.textColor,
    fontSize: `${Math.round(base * factor)}px`,
  };
}

export function stageBorderStyle(config: DisplayConfig): CSSProperties {
  const width = Math.max(0, Math.round(config.borderWidth || 0));
  if (width <= 0) return { border: "none" };
  return { border: `${width}px solid ${config.borderColor || DEFAULT_CONFIG.borderColor}` };
}

export function fitBoxInViewport(
  boxW: number,
  boxH: number,
  viewportW: number,
  viewportH: number
): number {
  if (!boxW || !boxH || !viewportW || !viewportH) return 1;
  return Math.min(viewportW / boxW, viewportH / boxH, 1);
}

export function getLogoSize(
  naturalWidth: number,
  naturalHeight: number,
  boxW: number,
  boxH: number,
  imageScalePercent: number
): { width: number; height: number } {
  if (!naturalWidth || !naturalHeight) {
    return { width: 80, height: 80 };
  }
  const pct = Math.min(100, Math.max(5, imageScalePercent)) / 100;
  const maxW = boxW * pct;
  const maxH = boxH * pct;
  const scale = Math.min(maxW / naturalWidth, maxH / naturalHeight);
  return {
    width: naturalWidth * scale,
    height: naturalHeight * scale,
  };
}

export function getRemainingMs(state: DisplayState, config: DisplayConfig): number {
  const durationMs = config.timerDurationSeconds * 1000;
  if (state.timerPausedRemainingMs != null) {
    return Math.max(0, state.timerPausedRemainingMs);
  }
  if (state.timerStartedAt == null) {
    return durationMs;
  }
  const elapsed = Date.now() - state.timerStartedAt;
  return Math.max(0, durationMs - elapsed);
}

export function formatTime(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function durationToMinSec(totalSeconds: number): { minutes: number; seconds: number } {
  const s = Math.max(1, Math.floor(totalSeconds));
  return { minutes: Math.floor(s / 60), seconds: s % 60 };
}

export function minSecToDuration(minutes: number, seconds: number): number {
  const m = Math.max(0, Math.floor(Number(minutes) || 0));
  const sec = Math.min(59, Math.max(0, Math.floor(Number(seconds) || 0)));
  return Math.max(1, m * 60 + sec);
}

export function getBrowserViewportSize(): { width: number; height: number } {
  const vv = window.visualViewport;
  return {
    width: Math.round(vv?.width ?? window.innerWidth),
    height: Math.round(vv?.height ?? window.innerHeight),
  };
}

export function clampScale(value: number): number {
  return Math.min(100, Math.max(5, Math.round(Number(value) || DEFAULT_CONFIG.imageScalePercent)));
}

export function normalizeConfig(partial: Partial<DisplayConfig>): DisplayConfig {
  return {
    backgroundColor: partial.backgroundColor ?? DEFAULT_CONFIG.backgroundColor,
    textColor: partial.textColor ?? DEFAULT_CONFIG.textColor,
    timerFontSize: Math.min(
      600,
      Math.max(12, Math.round(Number(partial.timerFontSize) || DEFAULT_CONFIG.timerFontSize))
    ),
    boxWidth: Math.max(100, Number(partial.boxWidth) || DEFAULT_CONFIG.boxWidth),
    boxHeight: Math.max(100, Number(partial.boxHeight) || DEFAULT_CONFIG.boxHeight),
    borderWidth: Math.min(48, Math.max(0, Math.round(Number(partial.borderWidth) || 0))),
    borderColor: partial.borderColor ?? DEFAULT_CONFIG.borderColor,
    imageScalePercent: clampScale(partial.imageScalePercent ?? DEFAULT_CONFIG.imageScalePercent),
    timerDurationSeconds: Math.max(
      1,
      Number(partial.timerDurationSeconds) || DEFAULT_CONFIG.timerDurationSeconds
    ),
    imageDataUrl: partial.imageDataUrl ?? null,
  };
}
