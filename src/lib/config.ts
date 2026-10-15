import type { CSSProperties } from "react";

export const DEFAULT_LOGO_URL = "/SYM_Logo.png";

export type DisplaySkin = "logos" | "brick-breaker";

export type DisplayConfig = {
  skin: DisplaySkin;
  /** Brick height as % of the stage height (brick-breaker skin). */
  brickSizePercent: number;
  holeWidthPercent: number;
  holeHeightPercent: number;
  /** Ball diameter as % of brick height. */
  ballSizePercent: number;
  backgroundColor: string;
  textColor: string;
  timerFontSize: number;
  boxWidth: number;
  boxHeight: number;
  imageScalePercent: number;
  /** 10–300; 100 = default bounce speed. */
  bounceSpeedPercent: number;
  /** RGB split on wall hits plus subtle idle drift. */
  chromaticAberration: boolean;
  /** Number of bouncing logos (1–12). */
  logoCount: number;
  borderWidth: number;
  borderColor: string;
  borderTransparent: boolean;
  timerDurationSeconds: number;
  imageDataUrl: string | null;
};

export type DisplayState = {
  timerStartedAt: number | null;
  timerPausedRemainingMs: number | null;
  /** Seeds the brick-breaker plan; rolled on each fresh start, kept through pause/resume. */
  gameSeed: number;
};

export const DEFAULT_CONFIG: DisplayConfig = {
  skin: "logos",
  brickSizePercent: 6,
  holeWidthPercent: 50,
  holeHeightPercent: 40,
  ballSizePercent: 40,
  backgroundColor: "#000000",
  textColor: "#ffffff",
  timerFontSize: 96,
  boxWidth: 640,
  boxHeight: 360,
  imageScalePercent: 40,
  bounceSpeedPercent: 40,
  chromaticAberration: false,
  logoCount: 1,
  borderWidth: 2,
  borderColor: "#ffffff",
  borderTransparent: false,
  timerDurationSeconds: 300,
  imageDataUrl: null,
};

export const DEFAULT_STATE: DisplayState = {
  timerStartedAt: null,
  timerPausedRemainingMs: null,
  gameSeed: 1,
};

export function rollGameSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0 || 1;
}

const STORAGE_KEY = "bounce-display-config";
const STATE_KEY = "bounce-display-state";
const VIEWPORT_KEY = "bounce-display-viewport";
const CHANNEL_NAME = "bounce-display-sync";

export type ViewportSize = { width: number; height: number };

type SyncMessage =
  | { type: "config" | "state" }
  | { type: "viewport" }
  | { type: "viewport-request" }
  | { type: "viewport-response"; width: number; height: number };

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

function notifyChange(type: SyncMessage["type"]): void {
  try {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type });
    channel.close();
  } catch {
    /* BroadcastChannel unavailable */
  }
  window.dispatchEvent(new CustomEvent("bounce-display-update", { detail: { type } }));
}

export function loadDisplayViewport(): ViewportSize | null {
  try {
    const raw = localStorage.getItem(VIEWPORT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ViewportSize>;
    const width = Math.round(Number(parsed.width));
    const height = Math.round(Number(parsed.height));
    if (!width || !height) return null;
    return { width, height };
  } catch {
    return null;
  }
}

export function saveDisplayViewport(size: ViewportSize): void {
  const normalized = {
    width: Math.round(size.width),
    height: Math.round(size.height),
  };
  localStorage.setItem(VIEWPORT_KEY, JSON.stringify(normalized));
  notifyChange("viewport");
}

export function requestDisplayViewport(timeoutMs = 500): Promise<ViewportSize | null> {
  return new Promise((resolve) => {
    let channel: BroadcastChannel | undefined;
    const finish = (size: ViewportSize | null) => {
      clearTimeout(timer);
      channel?.close();
      resolve(size);
    };
    const timer = window.setTimeout(() => finish(loadDisplayViewport()), timeoutMs);
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (e: MessageEvent<SyncMessage>) => {
        if (e.data?.type !== "viewport-response") return;
        finish({
          width: Math.round(e.data.width),
          height: Math.round(e.data.height),
        });
      };
      channel.postMessage({ type: "viewport-request" });
    } catch {
      finish(loadDisplayViewport());
    }
  });
}

export function onSync(callback: (type: SyncMessage["type"]) => void): () => void {
  const channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (e: MessageEvent<SyncMessage>) => {
    const type = e.data?.type;
    if (type === "config" || type === "state" || type === "viewport") {
      callback(type);
    }
  };
  const onCustom = (e: Event) => {
    const detail = (e as CustomEvent<{ type: SyncMessage["type"] }>).detail;
    const type = detail?.type;
    if (type === "config" || type === "state" || type === "viewport") {
      callback(type);
    }
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) callback("config");
    if (e.key === STATE_KEY) callback("state");
    if (e.key === VIEWPORT_KEY) callback("viewport");
  };
  window.addEventListener("bounce-display-update", onCustom);
  window.addEventListener("storage", onStorage);
  return () => {
    channel.close();
    window.removeEventListener("bounce-display-update", onCustom);
    window.removeEventListener("storage", onStorage);
  };
}

/** Subscribe to viewport requests (display tab) and respond with live size. */
export function onDisplayViewportRequest(
  getSize: () => ViewportSize
): () => void {
  let channel: BroadcastChannel | undefined;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (e: MessageEvent<SyncMessage>) => {
      if (e.data?.type !== "viewport-request") return;
      const size = getSize();
      channel?.postMessage({
        type: "viewport-response",
        width: size.width,
        height: size.height,
      });
    };
  } catch {
    /* BroadcastChannel unavailable */
  }
  return () => channel?.close();
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
  const color = config.borderTransparent
    ? "transparent"
    : config.borderColor || DEFAULT_CONFIG.borderColor;
  return { border: `${width}px solid ${color}` };
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

/** Elapsed ms since the timer began; unlike getRemainingMs it keeps counting past the end. */
export function getElapsedMs(state: DisplayState, config: DisplayConfig): number {
  const durationMs = config.timerDurationSeconds * 1000;
  if (state.timerPausedRemainingMs != null) {
    return Math.max(0, durationMs - state.timerPausedRemainingMs);
  }
  if (state.timerStartedAt == null) return 0;
  return Math.max(0, Date.now() - state.timerStartedAt);
}

export type TimerDigitSlot = {
  id: string;
  char: string;
  kind: "digit" | "separator";
};

/** Fixed-width flip-clock slots (padded digits, stable colon positions). */
export function getTimerDigitSlots(ms: number, reserveHours: boolean): TimerDigitSlot[] {
  const totalSeconds = Math.ceil(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const showHours = reserveHours || h > 0;
  const slots: TimerDigitSlot[] = [];

  const pushDigits = (str: string, prefix: string) => {
    for (let i = 0; i < str.length; i++) {
      slots.push({ id: `${prefix}-${i}`, char: str[i]!, kind: "digit" });
    }
  };
  const pushSep = (id: string) => {
    slots.push({ id, char: ":", kind: "separator" });
  };

  if (showHours) {
    pushDigits(String(h).padStart(2, "0"), "h");
    pushSep("sep-h");
  }
  pushDigits(String(m).padStart(2, "0"), "m");
  pushSep("sep-m");
  pushDigits(String(s).padStart(2, "0"), "s");

  return slots;
}

export function formatTime(ms: number, reserveHours?: boolean): string {
  return getTimerDigitSlots(ms, reserveHours ?? false)
    .map((slot) => slot.char)
    .join("");
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

/** Pixel velocity per frame at 100% speed (50% default ≈ 0.55 / 0.45). */
export const BOUNCE_SPEED_BASE = { vx: 1.1, vy: 0.9 };

export function clampScale(value: number): number {
  return Math.min(100, Math.max(5, Math.round(Number(value) || DEFAULT_CONFIG.imageScalePercent)));
}

export function clampBounceSpeed(value: number): number {
  return Math.min(300, Math.max(10, Math.round(Number(value) || DEFAULT_CONFIG.bounceSpeedPercent)));
}

export const LOGO_COUNT_MAX = 12;

export function clampLogoCount(value: number): number {
  return Math.min(
    LOGO_COUNT_MAX,
    Math.max(1, Math.round(Number(value) || DEFAULT_CONFIG.logoCount))
  );
}

export function getBounceVelocity(speedPercent: number): { vx: number; vy: number } {
  const factor = clampBounceSpeed(speedPercent) / 100;
  return {
    vx: BOUNCE_SPEED_BASE.vx * factor,
    vy: BOUNCE_SPEED_BASE.vy * factor,
  };
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  return Math.min(max, Math.max(min, Number.isFinite(n) && n > 0 ? n : fallback));
}

export function normalizeConfig(partial: Partial<DisplayConfig>): DisplayConfig {
  return {
    skin: partial.skin === "brick-breaker" ? "brick-breaker" : "logos",
    brickSizePercent: clampNumber(partial.brickSizePercent, DEFAULT_CONFIG.brickSizePercent, 2, 30),
    holeWidthPercent: clampNumber(partial.holeWidthPercent, DEFAULT_CONFIG.holeWidthPercent, 10, 90),
    holeHeightPercent: clampNumber(
      partial.holeHeightPercent,
      DEFAULT_CONFIG.holeHeightPercent,
      10,
      90
    ),
    ballSizePercent: clampNumber(partial.ballSizePercent, DEFAULT_CONFIG.ballSizePercent, 10, 80),
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
    borderTransparent: Boolean(
      partial.borderTransparent ?? DEFAULT_CONFIG.borderTransparent
    ),
    imageScalePercent: clampScale(partial.imageScalePercent ?? DEFAULT_CONFIG.imageScalePercent),
    bounceSpeedPercent: clampBounceSpeed(
      partial.bounceSpeedPercent ?? DEFAULT_CONFIG.bounceSpeedPercent
    ),
    chromaticAberration: Boolean(
      partial.chromaticAberration ?? DEFAULT_CONFIG.chromaticAberration
    ),
    logoCount: clampLogoCount(partial.logoCount ?? DEFAULT_CONFIG.logoCount),
    timerDurationSeconds: Math.max(
      1,
      Number(partial.timerDurationSeconds) || DEFAULT_CONFIG.timerDurationSeconds
    ),
    imageDataUrl: partial.imageDataUrl ?? null,
  };
}
