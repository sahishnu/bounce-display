import { useEffect, useRef, useState } from "react";
import {
  formatTime,
  getBounceVelocity,
  getLogoSize,
  getRemainingMs,
  loadConfig,
  loadState,
  resolveLogoSrc,
  stageBorderStyle,
  timerStyle,
} from "../lib/config";
import { useDisplayConfig } from "../hooks/useDisplayConfig";
import { useDisplayState } from "../hooks/useDisplayState";
import "../styles/display.css";

export function DisplayPage() {
  const { config } = useDisplayConfig();
  const { state } = useDisplayState();
  const [timerText, setTimerText] = useState(() =>
    formatTime(getRemainingMs(loadState(), loadConfig()))
  );

  const stageRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const tick = () => setTimerText(formatTime(getRemainingMs(state, config)));
    tick();
    const id = window.setInterval(tick, 200);
    return () => clearInterval(id);
  }, [state, config]);

  useEffect(() => {
    const stage = stageRef.current;
    const logo = logoRef.current;
    if (!stage || !logo) return;

    cancelAnimationFrame(animRef.current);

    let x = 20;
    let y = 20;
    const initial = getBounceVelocity(config.bounceSpeedPercent);
    let vx = initial.vx;
    let vy = initial.vy;
    let w = 80;
    let h = 80;

    const loop = () => {
      const boxW = stage.clientWidth;
      const boxH = stage.clientHeight;
      const live = loadConfig();
      const scalePercent = live.imageScalePercent;
      const speed = getBounceVelocity(live.bounceSpeedPercent);
      vx = Math.sign(vx || 1) * speed.vx;
      vy = Math.sign(vy || 1) * speed.vy;

      if (logo.naturalWidth && logo.complete) {
        const size = getLogoSize(
          logo.naturalWidth,
          logo.naturalHeight,
          boxW,
          boxH,
          scalePercent
        );
        w = size.width;
        h = size.height;
      }

      x += vx;
      y += vy;

      if (x <= 0) {
        x = 0;
        vx = Math.abs(vx);
      } else if (x + w >= boxW) {
        x = boxW - w;
        vx = -Math.abs(vx);
      }

      if (y <= 0) {
        y = 0;
        vy = Math.abs(vy);
      } else if (y + h >= boxH) {
        y = boxH - h;
        vy = -Math.abs(vy);
      }

      logo.style.width = `${w}px`;
      logo.style.height = `${h}px`;
      logo.style.transform = `translate(${x}px, ${y}px)`;

      animRef.current = requestAnimationFrame(loop);
    };

    const start = () => {
      cancelAnimationFrame(animRef.current);
      animRef.current = requestAnimationFrame(loop);
    };

    logo.onload = start;
    if (logo.complete) start();

    return () => cancelAnimationFrame(animRef.current);
  }, [
    config.boxWidth,
    config.boxHeight,
    config.imageScalePercent,
    config.bounceSpeedPercent,
    config.imageDataUrl,
  ]);

  const logoSrc = resolveLogoSrc(config);

  return (
    <div className="view-root" style={{ backgroundColor: config.backgroundColor }}>
      <div
        ref={stageRef}
        className="bounce-stage"
        style={{
          width: config.boxWidth,
          height: config.boxHeight,
          ...stageBorderStyle(config),
        }}
      >
        <img
          ref={logoRef}
          className="bounce-logo"
          src={logoSrc}
          alt=""
          key={logoSrc}
        />
      </div>
      <p className="timer-display" style={timerStyle(config)}>
        {timerText}
      </p>
    </div>
  );
}
