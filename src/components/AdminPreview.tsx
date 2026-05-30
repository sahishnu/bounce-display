import { useEffect, useRef, useState } from "react";
import {
  type DisplayConfig,
  fitBoxInViewport,
  formatTime,
  getLogoSize,
  getRemainingMs,
  resolveLogoSrc,
  stageBorderStyle,
  timerStyle,
} from "../lib/config";
import type { DisplayState } from "../lib/config";

type Props = {
  config: DisplayConfig;
  state: DisplayState;
};

type LogoNatural = { src: string; width: number; height: number };

export function AdminPreview({ config, state }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const [fit, setFit] = useState(1);
  const [logoLayout, setLogoLayout] = useState({ width: 0, height: 0, x: 0, y: 0 });
  const [meta, setMeta] = useState("");
  const naturalRef = useRef<LogoNatural>({ src: "", width: 0, height: 0 });
  const [logoSrc, setLogoSrc] = useState(() => resolveLogoSrc(config));

  const { boxWidth: boxW, boxHeight: boxH, imageScalePercent } = config;
  const timerText = formatTime(getRemainingMs(state, config));

  useEffect(() => {
    naturalRef.current = { src: "", width: 0, height: 0 };
    setLogoSrc(resolveLogoSrc(config));
  }, [config.imageDataUrl]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () => {
      const viewportW = viewport.clientWidth;
      const viewportH = viewport.clientHeight;
      setFit(fitBoxInViewport(boxW, boxH, viewportW, viewportH));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [boxW, boxH]);

  useEffect(() => {
    const src = logoSrc;
    const cached = naturalRef.current;
    if (cached.src === src && cached.width > 0) {
      applyLogo(cached.width, cached.height);
      return;
    }

    const img = logoRef.current;
    if (!img) return;

    const onLoad = () => {
      if (img.naturalWidth > 0) {
        naturalRef.current = { src, width: img.naturalWidth, height: img.naturalHeight };
        applyLogo(img.naturalWidth, img.naturalHeight);
      }
    };

    if (img.complete && img.naturalWidth > 0) onLoad();
    else img.onload = onLoad;
  }, [logoSrc, boxW, boxH, imageScalePercent]);

  function applyLogo(naturalW: number, naturalH: number) {
    const size = getLogoSize(naturalW, naturalH, boxW, boxH, imageScalePercent);
    setLogoLayout({
      width: size.width,
      height: size.height,
      x: Math.round((boxW - size.width) / 2),
      y: Math.round((boxH - size.height) / 2),
    });
    setMeta(
      `Bounce ${boxW}×${boxH} · Logo ${Math.round(size.width)}×${Math.round(size.height)}px (${imageScalePercent}% cap)`
    );
  }

  return (
    <section className="card preview-card">
      <h2>Preview</h2>
      <div className="preview-frame" style={{ backgroundColor: config.backgroundColor }}>
        <div ref={viewportRef} className="preview-viewport">
          <div className="preview-scaler" style={{ transform: `scale(${fit})` }}>
            <div
              className="preview-stage"
              style={{
                width: boxW,
                height: boxH,
                ...stageBorderStyle(config),
              }}
            >
              <img
                ref={logoRef}
                className="preview-logo"
                src={logoSrc}
                alt=""
                style={{
                  width: logoLayout.width,
                  height: logoLayout.height,
                  transform: `translate(${logoLayout.x}px, ${logoLayout.y}px)`,
                }}
              />
            </div>
          </div>
        </div>
        <p className="preview-timer" style={timerStyle(config, fit)}>
          {timerText}
        </p>
      </div>
      {meta ? <p className="preview-meta">{meta}</p> : null}
      <p className="field-hint">
        Scaled preview of the bounce area and logo — matches the display proportions.
      </p>
    </section>
  );
}
