import { useEffect, useRef, useState } from "react";
import {
  formatTime,
  getRemainingMs,
  loadConfig,
  loadState,
  resolveLogoSrc,
  stageBorderStyle,
  timerStyle,
} from "../lib/config";
import { useDisplayConfig } from "../hooks/useDisplayConfig";
import { useDisplayState } from "../hooks/useDisplayState";
import { useBounceAnimation } from "../hooks/useBounceAnimation";
import "../styles/display.css";

export function DisplayPage() {
  const { config } = useDisplayConfig();
  const { state } = useDisplayState();
  const [timerText, setTimerText] = useState(() =>
    formatTime(getRemainingMs(loadState(), loadConfig()))
  );

  const stageRef = useRef<HTMLDivElement>(null);
  const logoRef = useRef<HTMLImageElement>(null);

  useBounceAnimation({ stageRef, logoRef, config });

  useEffect(() => {
    const tick = () => setTimerText(formatTime(getRemainingMs(state, config)));
    tick();
    const id = window.setInterval(tick, 200);
    return () => clearInterval(id);
  }, [state, config]);

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
          className={`bounce-logo${config.chromaticAberration ? " bounce-logo--chromatic" : ""}`}
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
