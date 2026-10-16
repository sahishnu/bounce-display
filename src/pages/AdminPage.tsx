import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AdminPreview } from "../components/AdminPreview";
import { FlipClockTimer } from "../components/FlipClockTimer";
import { useDisplayConfig } from "../hooks/useDisplayConfig";
import { useDisplayState } from "../hooks/useDisplayState";
import { BRICK_PALETTES, type BrickPaletteId } from "../lib/brickBreaker/palettes";
import {
  clampBounceSpeed,
  clampLogoCount,
  clampScale,
  LOGO_COUNT_MAX,
  durationToMinSec,
  getRemainingMs,
  minSecToDuration,
  loadDisplayViewport,
  normalizeConfig,
  onSync,
  requestDisplayViewport,
  rollGameSeed,
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

type TabId = "timer" | "appearance" | "screen";

const TABS: { id: TabId; label: string; sub: string }[] = [
  { id: "timer", label: "Timer", sub: "Length & text" },
  { id: "appearance", label: "Appearance", sub: "Skin options & logo" },
  { id: "screen", label: "Screen", sub: "Size & colors" },
];

const SKINS: { id: DisplayConfig["skin"]; label: string; hint: string }[] = [
  { id: "logos", label: "Bouncing logos", hint: "Logos bounce around the border." },
  {
    id: "brick-breaker",
    label: "Brick breaker",
    hint: "An automatic game that clears the last brick exactly at zero.",
  },
];

export function AdminPage() {
  const { config: storedConfig, persist } = useDisplayConfig();
  const { state, persist: persistState } = useDisplayState();
  const [draft, setDraft] = useState<DisplayConfig>(storedConfig);
  const [showToast, setShowToast] = useState(false);
  const formatViewportLabel = (size: { width: number; height: number } | null) =>
    size ? `${size.width}×${size.height}` : "display not open";

  const [viewportLabel, setViewportLabel] = useState(() =>
    formatViewportLabel(loadDisplayViewport())
  );
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const suppressSyncRef = useRef(false);

  useEffect(() => {
    if (!suppressSyncRef.current) setDraft(storedConfig);
  }, [storedConfig]);

  useEffect(() => {
    const updateViewportLabel = () => {
      setViewportLabel(formatViewportLabel(loadDisplayViewport()));
    };
    updateViewportLabel();
    return onSync((type) => {
      if (type === "viewport") updateViewportLabel();
    });
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

  const matchDisplaySize = async () => {
    const size = (await requestDisplayViewport()) ?? loadDisplayViewport();
    if (!size) return;
    setViewportLabel(formatViewportLabel(size));
    patchImmediate({ boxWidth: size.width, boxHeight: size.height });
  };

  const timerRemainingMs = getRemainingMs(state, storedConfig);
  const reserveHours = storedConfig.timerDurationSeconds >= 3600;
  const paused = state.timerPausedRemainingMs != null;
  const running = state.timerStartedAt != null && !paused;

  const handleStart = () => {
    apply(draft);
    persistState({
      timerStartedAt: Date.now(),
      timerPausedRemainingMs: null,
      gameSeed: rollGameSeed(),
    });
  };

  const handlePauseResume = () => {
    if (paused) {
      const durationMs = storedConfig.timerDurationSeconds * 1000;
      const remaining = state.timerPausedRemainingMs!;
      persistState({
        timerStartedAt: Date.now() - (durationMs - remaining),
        timerPausedRemainingMs: null,
        gameSeed: state.gameSeed,
      });
    } else {
      persistState({
        timerStartedAt: null,
        timerPausedRemainingMs: getRemainingMs(state, storedConfig),
        gameSeed: state.gameSeed,
      });
    }
  };

  const handleReset = () => {
    persistState({
      timerStartedAt: null,
      timerPausedRemainingMs: null,
      gameSeed: state.gameSeed,
    });
  };

  const handleUpload = (file: File | undefined, key: "imageDataUrl" = "imageDataUrl") => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      patchImmediate({ ...draft, [key]: reader.result as string });
    };
    reader.readAsDataURL(file);
  };

  const { minutes, seconds } = durationToMinSec(draft.timerDurationSeconds);
  const [tab, setTab] = useState<TabId>("timer");
  const status = paused ? "Paused" : running ? "Running" : "Ready";
  const statusClass = paused ? "paused" : running ? "running" : "ready";

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.id === tab);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else return;
    e.preventDefault();
    setTab(TABS[next].id);
    document.getElementById(`tab-${TABS[next].id}`)?.focus();
  };

  return (
    <div className="admin-body">
      <div className="admin-layout">
        <header className="admin-header">
          <div>
            <h1>Bounce Display</h1>
            <p className="subtitle">Settings apply to the display as you change them.</p>
          </div>
          <Link className="btn-link btn-secondary" to="/" target="_blank" rel="noreferrer">
            Open display ↗
          </Link>
        </header>

        <div className="admin-grid">
          <div className="admin-stage">
            <section className="card playback-card" aria-label="Timer controls">
              <div className="playback-top">
                <h2>Now playing</h2>
                <span className={`status-pill status-${statusClass}`}>{status}</span>
              </div>
              <FlipClockTimer
                ms={timerRemainingMs}
                reserveHours={reserveHours}
                className="timer-live"
              />
              <div className="btn-row playback-actions">
                <button type="button" className="btn-primary btn-lg" onClick={handleStart}>
                  {running || paused ? "Restart" : "Start"}
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
              {!running && !paused ? (
                <p className="field-hint">Open the display first, then press Start.</p>
              ) : null}
            </section>

            <AdminPreview config={draft} state={state} />
          </div>

          <div className="admin-settings">
            <div className="skin-bar" role="radiogroup" aria-label="Display skin">
              <span className="skin-bar-label">Skin</span>
              {SKINS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={draft.skin === s.id}
                  className="skin-option"
                  title={s.hint}
                  onClick={() => patchImmediate({ ...draft, skin: s.id })}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="tabs" role="tablist" aria-label="Settings" onKeyDown={onTabKeyDown}>
              {TABS.map((t) => (
                <button
                  key={t.id}
                  id={`tab-${t.id}`}
                  type="button"
                  role="tab"
                  className="tab"
                  aria-selected={tab === t.id}
                  aria-controls={`panel-${t.id}`}
                  tabIndex={tab === t.id ? 0 : -1}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  <span className="tab-sub">{t.sub}</span>
                </button>
              ))}
            </div>

            <div
              className="tab-panel"
              role="tabpanel"
              id={`panel-${tab}`}
              aria-labelledby={`tab-${tab}`}
            >
              {tab === "timer" ? (
                <>
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

                  <section className="card">
                    <h2>Timer text</h2>
                    <div className="field-row">
                      <div className="field">
                        <label htmlFor="timerFontSize">Font size (px)</label>
                        <input
                          id="timerFontSize"
                          type="number"
                          min={12}
                          max={600}
                          step={1}
                          value={draft.timerFontSize}
                          onChange={(e) =>
                            patch({ ...draft, timerFontSize: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div className="field">
                        <label htmlFor="textColor">Color</label>
                        <input
                          id="textColor"
                          type="color"
                          value={draft.textColor}
                          onChange={(e) => patch({ ...draft, textColor: e.target.value })}
                        />
                      </div>
                    </div>
                  </section>
                </>
              ) : null}

              {tab === "appearance" ? (
                <>
                  {draft.skin === "brick-breaker" ? (
                    <section className="card">
                      <h2>Brick breaker</h2>
                      <div className="field">
                        <label htmlFor="brickPalette">Brick colors</label>
                        <select
                          id="brickPalette"
                          value={draft.brickPalette}
                          onChange={(e) =>
                            patchImmediate({
                              ...draft,
                              brickPalette: e.target.value as BrickPaletteId,
                            })
                          }
                        >
                          {(Object.keys(BRICK_PALETTES) as BrickPaletteId[]).map((id) => (
                            <option key={id} value={id}>
                              {BRICK_PALETTES[id].label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="brickSize">Brick size (% of stage height)</label>
                        <input
                          id="brickSize"
                          type="number"
                          min={2}
                          max={30}
                          step={0.5}
                          value={draft.brickSizePercent}
                          onChange={(e) =>
                            patch({ ...draft, brickSizePercent: Number(e.target.value) })
                          }
                        />
                        <p className="field-hint">
                          Smaller bricks mean more of them. Each brick takes at least about 2
                          seconds, so short timers use fewer bricks.
                        </p>
                      </div>
                      <div className="field-row">
                        <div className="field">
                          <label htmlFor="holeWidth">Hole width (%)</label>
                          <input
                            id="holeWidth"
                            type="number"
                            min={10}
                            max={90}
                            value={draft.holeWidthPercent}
                            onChange={(e) =>
                              patch({ ...draft, holeWidthPercent: Number(e.target.value) })
                            }
                          />
                        </div>
                        <div className="field">
                          <label htmlFor="holeHeight">Hole height (%)</label>
                          <input
                            id="holeHeight"
                            type="number"
                            min={10}
                            max={90}
                            value={draft.holeHeightPercent}
                            onChange={(e) =>
                              patch({ ...draft, holeHeightPercent: Number(e.target.value) })
                            }
                          />
                        </div>
                      </div>
                      <div className="field">
                        <label htmlFor="ballSize">Logo size (% of brick height)</label>
                        <input
                          id="ballSize"
                          type="number"
                          min={10}
                          max={200}
                          value={draft.ballSizePercent}
                          onChange={(e) =>
                            patch({ ...draft, ballSizePercent: Number(e.target.value) })
                          }
                        />
                      </div>
                      <div className="field-toggle">
                        <button
                          type="button"
                          className="btn-ghost btn-sm"
                          onClick={() => persistState({ ...state, gameSeed: rollGameSeed() })}
                        >
                          Re-roll game
                        </button>
                        <p className="field-hint">
                          Picks a new random game. Starting the timer also rolls a new one; pause
                          and resume keep the current game.
                        </p>
                      </div>
                    </section>
                  ) : null}

                  {draft.skin === "logos" ? (
                    <section className="card">
                      <h2>Bouncing logos</h2>
                      <div className="field">
                        <span className="field-label">Logo count</span>
                        <div className="stepper" role="group" aria-label="Logo count">
                          <button
                            type="button"
                            className="stepper-btn"
                            aria-label="Remove logo"
                            disabled={draft.logoCount <= 1}
                            onClick={() =>
                              patchImmediate({
                                ...draft,
                                logoCount: clampLogoCount(draft.logoCount - 1),
                              })
                            }
                          >
                            −
                          </button>
                          <span className="stepper-value" aria-live="polite">
                            {draft.logoCount}
                          </span>
                          <button
                            type="button"
                            className="stepper-btn"
                            aria-label="Add logo"
                            disabled={draft.logoCount >= LOGO_COUNT_MAX}
                            onClick={() =>
                              patchImmediate({
                                ...draft,
                                logoCount: clampLogoCount(draft.logoCount + 1),
                              })
                            }
                          >
                            +
                          </button>
                        </div>
                        <p className="field-hint">
                          Up to {LOGO_COUNT_MAX} logos bounce independently on the display.
                        </p>
                      </div>

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
                            patch({
                              ...draft,
                              imageScalePercent: clampScale(Number(e.target.value)),
                            })
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
                            patch({
                              ...draft,
                              imageScalePercent: clampScale(Number(e.target.value)),
                            })
                          }
                          aria-label="Logo size"
                        />
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
                            patch({
                              ...draft,
                              bounceSpeedPercent: clampBounceSpeed(Number(e.target.value)),
                            })
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
                            patch({
                              ...draft,
                              bounceSpeedPercent: clampBounceSpeed(Number(e.target.value)),
                            })
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
                  ) : null}

                  <section className="card">
                    <h2>Logo image</h2>
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
                  </section>
                </>
              ) : null}

              {tab === "screen" ? (
                <>
                  <section className="card">
                    <h2>Screen size</h2>
                    <button
                      type="button"
                      className="btn-match-window"
                      onClick={() => void matchDisplaySize()}
                    >
                      Match display screen ({viewportLabel})
                    </button>
                    <p className="field-hint">
                      Open the display fullscreen on your projector monitor, then tap this to size
                      the bounce border to that window.
                    </p>
                    <div className="preset-row">
                      <span className="preset-label">Presets:</span>
                      {PRESETS.map((p) => (
                        <button
                          key={p.label}
                          type="button"
                          className="btn-preset"
                          onClick={() =>
                            patchImmediate({ ...draft, boxWidth: p.w, boxHeight: p.h })
                          }
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <div className="field-row field-spaced">
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
                  </section>

                  <section className="card">
                    <h2>Border</h2>
                    <div className="field">
                      <label htmlFor="borderWidth">Thickness (px)</label>
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
                    <div className="field">
                      <label htmlFor="borderColor">Color</label>
                      <input
                        id="borderColor"
                        type="color"
                        value={draft.borderColor}
                        disabled={draft.borderTransparent}
                        onChange={(e) => patch({ ...draft, borderColor: e.target.value })}
                      />
                    </div>
                    <div className="field field-toggle">
                      <label className="toggle-label" htmlFor="borderTransparent">
                        <input
                          id="borderTransparent"
                          type="checkbox"
                          checked={draft.borderTransparent}
                          onChange={(e) =>
                            patchImmediate({ ...draft, borderTransparent: e.target.checked })
                          }
                        />
                        Transparent border
                      </label>
                      <p className="field-hint">
                        Keeps border thickness but hides the stroke on the display.
                      </p>
                    </div>
                  </section>

                  <section className="card">
                    <h2>Background</h2>
                    <div className="field">
                      <label htmlFor="backgroundColor">Color</label>
                      <input
                        id="backgroundColor"
                        type="color"
                        value={draft.backgroundColor}
                        onChange={(e) => patch({ ...draft, backgroundColor: e.target.value })}
                      />
                    </div>
                  </section>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <p className={`save-toast${showToast ? " visible" : ""}`} role="status">
          ✓ Applied to display
        </p>
      </div>
    </div>
  );
}
