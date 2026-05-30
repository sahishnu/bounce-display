import { useEffect, useRef, useState } from "react";
import {
  getRemainingMs,
  loadConfig,
  loadState,
  resolveLogoSrc,
  stageBorderStyle,
  timerStyle,
} from "../lib/config";
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

  useBounceAnimation({ stageRef, config });

  useEffect(() => {
    const tick = () => setRemainingMs(getRemainingMs(state, config));
    tick();
    const id = window.setInterval(tick, 200);
    return () => clearInterval(id);
  }, [state, config]);

  const logoSrc = resolveLogoSrc(config);
  const reserveHours = config.timerDurationSeconds >= 3600;
  const chromaticClass = config.chromaticAberration ? " bounce-logo--chromatic" : "";

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
        {Array.from({ length: config.logoCount }, (_, i) => (
          <img
            key={`${logoSrc}-${i}`}
            className={`bounce-logo${chromaticClass}`}
            src={logoSrc}
            alt=""
          />
        ))}
      </div>
      <FlipClockTimer
        ms={remainingMs}
        reserveHours={reserveHours}
        className="timer-display"
        style={timerStyle(config)}
      />
    </div>
  );
}
