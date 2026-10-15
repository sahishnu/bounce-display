import { useEffect, useMemo, useRef } from "react";
import { getElapsedMs, type DisplayConfig, type DisplayState } from "../lib/config";
import { generatePlan, type BrickBreakerPlan } from "../lib/brickBreaker/plan";
import { drawFrame } from "../lib/brickBreaker/render";

type Props = {
  config: DisplayConfig;
  state: DisplayState;
  /** Stage inner size in px (the box minus its border). */
  width: number;
  height: number;
  /** Overrides the live timer, for the admin scrubber. */
  scrubMs?: number | null;
  onPlan?: (plan: BrickBreakerPlan) => void;
};

export function BrickBreakerStage({ config, state, width, height, scrubMs, onPlan }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const plan = useMemo(
    () =>
      generatePlan({
        seed: state.gameSeed,
        durationMs: config.timerDurationSeconds * 1000,
        width,
        height,
        brickSizePercent: config.brickSizePercent,
        holeWidthPercent: config.holeWidthPercent,
        holeHeightPercent: config.holeHeightPercent,
        ballSizePercent: config.ballSizePercent,
      }),
    [
      state.gameSeed,
      config.timerDurationSeconds,
      width,
      height,
      config.brickSizePercent,
      config.holeWidthPercent,
      config.holeHeightPercent,
      config.ballSizePercent,
    ]
  );

  useEffect(() => {
    onPlan?.(plan);
  }, [plan, onPlan]);

  const live = useRef({ plan, config, state, scrubMs });
  live.current = { plan, config, state, scrubMs };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const area = width * height;
    const dpr = area > 4_000_000 ? 1 : Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let raf = 0;
    const loop = (now: number) => {
      const cur = live.current;
      const idle =
        cur.scrubMs == null &&
        cur.state.timerStartedAt == null &&
        cur.state.timerPausedRemainingMs == null;
      const elapsed = cur.scrubMs ?? getElapsedMs(cur.state, cur.config);
      drawFrame(ctx, cur.plan, elapsed, { nowMs: now, idle });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      className="brick-canvas"
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}
