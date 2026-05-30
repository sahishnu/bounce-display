import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AdminPreview } from "../components/AdminPreview";
import { useDisplayConfig } from "../hooks/useDisplayConfig";
import { useDisplayState } from "../hooks/useDisplayState";
import {
  clampBounceSpeed,
  clampScale,
  durationToMinSec,
  formatTime,
  getRemainingMs,
  minSecToDuration,
  getBrowserViewportSize,
  normalizeConfig,
  type DisplayConfig,
} from "../lib/config";
import "../styles/admin.css";

const PRESETS = [
  { w: 640, h: 360, label: "640×360" },
  { w: 960, h: 540, label: "960×540" },
  { w: 1280, h: 720, label: "1280×720" },
  { w: 1920, h: 1080, label: "1920×1080" },
  { w: 3584, h: 1536, label: "3584×1536" },
];

export function AdminPage() {
  const { config: storedConfig, persist } = useDisplayConfig();
  const { state, persist: persistState } = useDisplayState();
  const [draft, setDraft] = useState<DisplayConfig>(storedConfig);
  const [showToast, setShowToast] = useState(false);
  const [viewportLabel, setViewportLabel] = useState(() => {
    const { width, height } = getBrowserViewportSize();
    return `${width}×${height}`;
  });
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suppressSyncRef = useRef(false);

  useEffect(() => {
    if (!suppressSyncRef.current) setDraft(storedConfig);
  }, [storedConfig]);

  useEffect(() => {
    const updateViewportLabel = () => {
      const { width, height } = getBrowserViewportSize();
      setViewportLabel(`${width}×${height}`);
    };
    updateViewportLabel();
    window.addEventListener("resize", updateViewportLabel);
    window.visualViewport?.addEventListener("resize", updateViewportLabel);
    return () => {
      window.removeEventListener("resize", updateViewportLabel);
      window.visualViewport?.removeEventListener("resize", updateViewportLabel);
    };
  }, []);

  const apply = useCallback(
    (next: DisplayConfig) => {
      const normalized = normalizeConfig(next);
      setDraft(normalized);
      suppressSyncRef.current = true;
      persist(normalized);
      suppressSyncRef.current = false;
      setShowToast(true);
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => setShowToast(false), 1500);
    },
    [persist]
  );

  const scheduleApply = useCallback(
    (next: DisplayConfig) => {
      setDraft(next);
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => apply(next), 150);
    },
    [apply]
  );

  const patch = useCallback(
    (partial: Partial<DisplayConfig>) => {
      scheduleApply({ ...draft, ...partial });
    },
    [draft, scheduleApply]
  );

  const patchImmediate = useCallback(
    (partial: Partial<DisplayConfig>) => {
      apply({ ...draft, ...partial });
    },
    [draft, apply]
  );

  const matchBrowserSize = () => {
    const { width, height } = getBrowserViewportSize();
    patchImmediate({ boxWidth: width, boxHeight: height });
  };

  const timerLive = formatTime(getRemainingMs(state, storedConfig));
  const paused = state.timerPausedRemainingMs != null;
  const running = state.timerStartedAt != null && !paused;

  const handleStart = () => {
    apply(draft);
    persistState({ timerStartedAt: Date.now(), timerPausedRemainingMs: null });
  };

  const handlePauseResume = () => {
    if (paused) {
      const durationMs = storedConfig.timerDurationSeconds * 1000;
      const remaining = state.timerPausedRemainingMs!;
      persistState({
        timerStartedAt: Date.now() - (durationMs - remaining),
        timerPausedRemainingMs: null,
      });
    } else {
      persistState({
        timerStartedAt: null,
        timerPausedRemainingMs: getRemainingMs(state, storedConfig),
      });
    }
  };

  const handleReset = () => {
    persistState({ timerStartedAt: null, timerPausedRemainingMs: null });
  };

  const handleUpload = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      patchImmediate({ ...draft, imageDataUrl: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const { minutes, seconds } = durationToMinSec(draft.timerDurationSeconds);

  return (
    <div className="admin-body">
      <div className="admin-layout">
        <header className="admin-header">
          <div>
            <h1>Bounce Display</h1>
            <p className="subtitle">Changes apply to the screen automatically.</p>
          </div>
          <Link className="btn-link btn-secondary" to="/" target="_blank" rel="noreferrer">
            Open display ↗
          </Link>
        </header>

        <section className="card playback-card">
          <h2>Timer</h2>
          <p className="timer-live" aria-live="polite">
            {timerLive}
          </p>
          <p className="timer-status">
            {paused
              ? "Paused"
              : running
                ? "Running"
                : "Ready — press Start when the display is open"}
          </p>
          <div className="btn-row playback-actions">
            <button type="button" className="btn-primary btn-lg" onClick={handleStart}>
              Start
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={!running && !paused}
              onClick={handlePauseResume}
            >
              {paused ? "Resume" : "Pause"}
            </button>
            <button type="button" className="btn-ghost" onClick={handleReset}>
              Reset
            </button>
          </div>
        </section>

        <AdminPreview config={draft} state={state} />

        <div className="controls-card">
          <section className="card">
            <h2>Logo</h2>
            <div className="field">
              <label htmlFor="imageFile">Upload image</label>
              <input
                id="imageFile"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  handleUpload(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => patchImmediate({ ...draft, imageDataUrl: null })}
            >
              Reset to default logo
            </button>

            <div className="field logo-size-field">
              <label htmlFor="imageScaleNumber">Logo size (% of bounce area)</label>
              <input
                id="imageScaleNumber"
                className="scale-number-full"
                type="number"
                min={5}
                max={100}
                step={1}
                value={draft.imageScalePercent}
                onChange={(e) =>
                  patch({ ...draft, imageScalePercent: clampScale(Number(e.target.value)) })
                }
              />
              <input
                id="imageScale"
                type="range"
                min={5}
                max={100}
                step={1}
                value={draft.imageScalePercent}
                onChange={(e) =>
                  patch({ ...draft, imageScalePercent: clampScale(Number(e.target.value)) })
                }
                aria-label="Logo size"
              />
              <p className="field-hint">
                Same sizing as on the display — % of the bounce box width and height.
              </p>
            </div>

            <div className="field logo-size-field">
              <label htmlFor="bounceSpeedNumber">Logo speed (%)</label>
              <input
                id="bounceSpeedNumber"
                className="scale-number-full"
                type="number"
                min={10}
                max={300}
                step={5}
                value={draft.bounceSpeedPercent}
                onChange={(e) =>
                  patch({ ...draft, bounceSpeedPercent: clampBounceSpeed(Number(e.target.value)) })
                }
              />
              <input
                id="bounceSpeed"
                type="range"
                min={10}
                max={300}
                step={5}
                value={draft.bounceSpeedPercent}
                onChange={(e) =>
                  patch({ ...draft, bounceSpeedPercent: clampBounceSpeed(Number(e.target.value)) })
                }
                aria-label="Logo speed"
              />
              <p className="field-hint">40% is the default. Higher = faster bounce.</p>
            </div>

            <div className="field field-toggle">
              <label className="toggle-label" htmlFor="chromaticAberration">
                <input
                  id="chromaticAberration"
                  type="checkbox"
                  checked={draft.chromaticAberration}
                  onChange={(e) =>
                    patchImmediate({ ...draft, chromaticAberration: e.target.checked })
                  }
                />
                Chromatic aberration
              </label>
              <p className="field-hint">
                RGB split on wall hits with a subtle color drift while the logo moves.
              </p>
            </div>
          </section>

          <section className="card">
            <h2>Bounce area</h2>
            <div className="field-row">
              <div className="field">
                <label htmlFor="boxWidth">Width (px)</label>
                <input
                  id="boxWidth"
                  type="number"
                  min={100}
                  value={draft.boxWidth}
                  onChange={(e) => patch({ ...draft, boxWidth: Number(e.target.value) })}
                />
              </div>
              <div className="field">
                <label htmlFor="boxHeight">Height (px)</label>
                <input
                  id="boxHeight"
                  type="number"
                  min={100}
                  value={draft.boxHeight}
                  onChange={(e) => patch({ ...draft, boxHeight: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="borderWidth">Border thickness (px)</label>
              <input
                id="borderWidth"
                type="number"
                min={0}
                max={48}
                step={1}
                value={draft.borderWidth}
                onChange={(e) => patch({ ...draft, borderWidth: Number(e.target.value) })}
              />
              <p className="field-hint">Set to 0 to hide the border.</p>
            </div>
            <div className="preset-row">
              <span className="preset-label">Presets:</span>
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="btn-preset"
                  onClick={() => patchImmediate({ ...draft, boxWidth: p.w, boxHeight: p.h })}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn-match-window" onClick={matchBrowserSize}>
              Match this window ({viewportLabel})
            </button>
            <p className="field-hint">
              Open admin on the display screen in fullscreen, then tap this to size the bounce
              border to the browser.
            </p>
          </section>

          <section className="card">
            <h2>Colors</h2>
            <div className="field-row">
              <div className="field">
                <label htmlFor="backgroundColor">Background</label>
                <input
                  id="backgroundColor"
                  type="color"
                  value={draft.backgroundColor}
                  onChange={(e) => patch({ ...draft, backgroundColor: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="textColor">Timer text</label>
                <input
                  id="textColor"
                  type="color"
                  value={draft.textColor}
                  onChange={(e) => patch({ ...draft, textColor: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="timerFontSize">Timer font size (px)</label>
              <input
                id="timerFontSize"
                type="number"
                min={12}
                max={600}
                step={1}
                value={draft.timerFontSize}
                onChange={(e) => patch({ ...draft, timerFontSize: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor="borderColor">Border</label>
              <input
                id="borderColor"
                type="color"
                value={draft.borderColor}
                onChange={(e) => patch({ ...draft, borderColor: e.target.value })}
              />
            </div>
          </section>

          <section className="card">
            <h2>Countdown length</h2>
            <div className="field-row">
              <div className="field">
                <label htmlFor="timerMinutes">Minutes</label>
                <input
                  id="timerMinutes"
                  type="number"
                  min={0}
                  value={minutes}
                  onChange={(e) =>
                    patch({
                      ...draft,
                      timerDurationSeconds: minSecToDuration(
                        Number(e.target.value),
                        seconds
                      ),
                    })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="timerSeconds">Seconds</label>
                <input
                  id="timerSeconds"
                  type="number"
                  min={0}
                  max={59}
                  value={seconds}
                  onChange={(e) =>
                    patch({
                      ...draft,
                      timerDurationSeconds: minSecToDuration(
                        minutes,
                        Number(e.target.value)
                      ),
                    })
                  }
                />
              </div>
            </div>
            <p className="field-hint">
              Used when you press Start. Reset the timer after changing the length.
            </p>
          </section>

          {showToast ? <p className="save-toast">Applied to display</p> : null}
        </div>
      </div>
    </div>
  );
}
