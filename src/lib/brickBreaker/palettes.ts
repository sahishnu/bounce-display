export type BrickPaletteId = "rainbow" | "sunset" | "ocean" | "neon" | "forest" | "mono";

/** Hues are blended numerically, so keep each palette's hues on one side of the 0/360 wrap. */
type Stop = readonly [h: number, s: number, l: number];

type Palette = {
  label: string;
  /** Colours from the top row to the bottom row, blended in between. */
  stops: readonly Stop[];
};

export const BRICK_PALETTES: Record<BrickPaletteId, Palette> = {
  rainbow: {
    label: "Rainbow",
    stops: [[0, 78, 55], [60, 78, 55], [120, 78, 55], [180, 78, 55], [240, 78, 55], [300, 78, 55]],
  },
  sunset: { label: "Sunset", stops: [[48, 95, 58], [22, 92, 56], [-10, 82, 54], [-60, 60, 46]] },
  ocean: { label: "Ocean", stops: [[170, 70, 58], [195, 80, 52], [220, 75, 50], [250, 65, 45]] },
  neon: { label: "Neon", stops: [[320, 100, 60], [280, 100, 62], [190, 100, 55], [150, 100, 52]] },
  forest: { label: "Forest", stops: [[90, 55, 55], [130, 50, 45], [160, 55, 38], [190, 45, 35]] },
  mono: { label: "Mono", stops: [[210, 8, 78], [210, 8, 62], [210, 8, 48], [210, 8, 34]] },
};

export const DEFAULT_BRICK_PALETTE: BrickPaletteId = "rainbow";

export function isBrickPaletteId(value: unknown): value is BrickPaletteId {
  return typeof value === "string" && value in BRICK_PALETTES;
}

/** Brick colour for `row` of `rows`. `lightBoost` brightens break fragments. */
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
  const a = stops[i]!;
  const b = stops[i + 1]!;
  const mix = (x: number, y: number) => x + (y - x) * k;
  return `hsl(${mix(a[0], b[0]).toFixed(0)} ${mix(a[1], b[1]).toFixed(0)}% ${(mix(a[2], b[2]) + lightBoost).toFixed(0)}%)`;
}
