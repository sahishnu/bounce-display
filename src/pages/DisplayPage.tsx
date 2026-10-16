import { useEffect, useRef, useState } from "react";
import {
  getBrowserViewportSize,
  getRemainingMs,
  loadConfig,
  loadState,
  onDisplayViewportRequest,
  resolveLogoSrc,
  saveDisplayViewport,
  stageBorderStyle,
  timerStyle,
} from "../lib/config";
import { BrickBreakerStage } from "../components/BrickBreakerStage";
import { FlipClockTimer } from "../components/FlipClockTimer";
import { useDisplayConfig } from "../hooks/useDisplayConfig";
import { useDisplayState } from "../hooks/useDisplayState";
import { useBounceAnimation } from "../hooks/useBounceAnimation";
import "../styles/display.css";

export function DisplayPage() {
  const { config } = useDisplayConfig();
  const { state } = useDisplayState();
  const [remainingMs, setRemainingMs] = useState(() =>
    getRemainingMs(loadState(), loadConfig())
  );

  const stageRef = useRef<HTMLDivElement>(null);

  const bricks = config.skin === "brick-breaker";
  useBounceAnimation({ stageRef, config, enabled: !bricks });

  useEffect(() => {
    const tick = () => setRemainingMs(getRemainingMs(state, config));
    tick();
    const id = window.setInterval(tick, 200);
    return () => clearInterval(id);
  }, [state, config]);

  useEffect(() => {
    const report = () => saveDisplayViewport(getBrowserViewportSize());
    report();
    const offRequest = onDisplayViewportRequest(getBrowserViewportSize);
    window.addEventListener("resize", report);
    window.visualViewport?.addEventListener("resize", report);
    return () => {
      offRequest();
      window.removeEventListener("resize", report);
      window.visualViewport?.removeEventListener("resize", report);
    };
  }, []);

  const logoSrc = resolveLogoSrc(config);
  const reserveHours = config.timerDurationSeconds >= 3600;
  const chromaticClass = config.chromaticAberration ? " bounce-logo--chromatic" : "";
  const borderPx = Math.max(0, Math.round(config.borderWidth || 0));
  const innerWidth = Math.max(1, config.boxWidth - borderPx * 2);
  const innerHeight = Math.max(1, config.boxHeight - borderPx * 2);

  return (
    <div className="view-root" style={{ backgroundColor: config.backgroundColor }}>
      <div
        ref={stageRef}
        className={`bounce-stage${bricks ? " bounce-stage--bricks" : ""}`}
        style={{
          width: config.boxWidth,
          height: config.boxHeight,
          ...stageBorderStyle(config),
        }}
      >
        {bricks ? (
          <BrickBreakerStage
            config={config}
            state={state}
            width={innerWidth}
            height={innerHeight}
          />
        ) : (
          Array.from({ length: config.logoCount }, (_, i) => (
            <img
              key={`${logoSrc}-${i}`}
              className={`bounce-logo${chromaticClass}`}
              src={logoSrc}
              alt=""
            />
          ))
        )}
      </div>
      <FlipClockTimer
        ms={remainingMs}
        reserveHours={reserveHours}
        className={bricks ? "timer-display timer-display--behind" : "timer-display"}
        style={timerStyle(config)}
      />
    </div>
  );
}
