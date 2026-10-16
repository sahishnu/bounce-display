import { useEffect, useState } from "react";

export type Sprite = { canvas: HTMLCanvasElement; aspect: number };

/** Loads the logo, crops transparent padding, and pre-scales it (the PNG is 13667px wide). */
export function useLogo(src: string, targetHeight: number): Sprite | null {
  const [sprite, setSprite] = useState<Sprite | null>(null);
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const probeW = 800;
      const probeH = Math.round((img.naturalHeight / img.naturalWidth) * probeW);
      const probe = document.createElement("canvas");
      probe.width = probeW;
      probe.height = probeH;
      const pctx = probe.getContext("2d", { willReadFrequently: true })!;
      pctx.drawImage(img, 0, 0, probeW, probeH);
      const data = pctx.getImageData(0, 0, probeW, probeH).data;
      let x0 = probeW, y0 = probeH, x1 = 0, y1 = 0;
      for (let y = 0; y < probeH; y++) {
        for (let x = 0; x < probeW; x++) {
          if (data[(y * probeW + x) * 4 + 3]! > 24) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      if (x1 <= x0 || y1 <= y0) return;
      const k = img.naturalWidth / probeW;
      const sx = x0 * k, sy = y0 * k, sw = (x1 - x0 + 1) * k, sh = (y1 - y0 + 1) * k;
      const h = Math.max(8, Math.round(targetHeight * 3));
      const w = Math.round((sw / sh) * h);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
      setSprite({ canvas: c, aspect: sw / sh });
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src, targetHeight]);
  return sprite;
}
