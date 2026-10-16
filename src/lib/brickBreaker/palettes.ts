export type BrickPaletteId =
  | "rainbow"
  | "fall"
  | "autumn"
  | "winter"
  | "fiery-ocean"
  | "olive-garden"
  | "forest"
  | "beach"
  | "dark-sunset"
  | "black-gold"
  | "golden-twilight"
  | "mono";

type Palette = {
  label: string;
  /** Hex colours from the top row to the bottom row, blended in between. */
  stops: readonly string[];
};

export const BRICK_PALETTES: Record<BrickPaletteId, Palette> = {
  rainbow: {
    label: "Rainbow",
    stops: ["#e63333", "#e6e633", "#33e633", "#33e6e6", "#3333e6", "#e633e6"],
  },
  fall: { label: "Fall", stops: ["#5f0f40", "#9a031e", "#fb8b24", "#e36414", "#0f4c5c"] },
  autumn: {
    label: "Autumn harvest",
    stops: ["#ede0d4", "#e6ccb2", "#ddb892", "#b08968", "#7f5539", "#9c6644"],
  },
  winter: {
    label: "Winter",
    stops: ["#000060", "#003e8c", "#0077b6", "#0096c7", "#00b4d8", "#48cae4", "#90e0ef", "#caf0f8"],
  },
  "fiery-ocean": {
    label: "Fiery ocean",
    stops: ["#780000", "#c1121f", "#fdf0d5", "#003049", "#669bbc"],
  },
  "olive-garden": {
    label: "Olive garden",
    stops: ["#606c38", "#283618", "#fefae0", "#dda15e", "#bc6c25"],
  },
  forest: { label: "Forest", stops: ["#132a13", "#31572c", "#4f772d", "#90a955", "#ecf39e"] },
  beach: { label: "Beach", stops: ["#264653", "#2a9d8f", "#e9c46a", "#f4a261", "#e76f51"] },
  "dark-sunset": {
    label: "Dark sunset",
    stops: ["#335c67", "#fff3b0", "#e09f3e", "#9e2a2b", "#540b0e"],
  },
  "black-gold": {
    label: "Black & gold",
    stops: ["#000000", "#14213d", "#fca311", "#e5e5e5", "#ffffff"],
  },
  "golden-twilight": {
    label: "Golden twilight",
    stops: ["#000814", "#001d3d", "#003566", "#ffc300", "#ffd60a"],
  },
  mono: { label: "Mono", stops: ["#c3c8cc", "#979ea6", "#707a84", "#50575d"] },
};

export const DEFAULT_BRICK_PALETTE: BrickPaletteId = "rainbow";

export function isBrickPaletteId(value: unknown): value is BrickPaletteId {
  return typeof value === "string" && value in BRICK_PALETTES;
}

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** CSS gradient across a palette's stops, for swatch previews. */
export function paletteGradient(palette: BrickPaletteId): string {
  return `linear-gradient(90deg, ${BRICK_PALETTES[palette].stops.join(", ")})`;
}

/** Brick colour for `row` of `rows`. `lightBoost` (percent) brightens break fragments. */
export function brickColor(
  palette: BrickPaletteId,
  row: number,
  rows: number,
  lightBoost = 0
): string {
  const { stops } = BRICK_PALETTES[palette];
  const f = (row / Math.max(1, rows - 1)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f));
  const k = f - i;
  const a = parseHex(stops[i]!);
  const b = parseHex(stops[i + 1]!);
  const white = Math.min(1, lightBoost / 50);
  const ch = (j: number) => {
    const v = a[j]! + (b[j]! - a[j]!) * k;
    return Math.round(v + (255 - v) * white);
  };
  return `rgb(${ch(0)} ${ch(1)} ${ch(2)})`;
}
