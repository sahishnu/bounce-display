import { useEffect, useMemo, useRef } from "react";
import {
  getElapsedMs,
  resolveLogoSrc,
  type DisplayConfig,
  type DisplayState,
} from "../lib/config";
import type { BrickBreakerPlan } from "../lib/brickBreaker/plan";
import { useLogo, type Sprite } from "../lib/brickBreaker/logoSprite";
import { bodyPosition, generateProtoPlan, type ProtoPlan } from "../lib/brickBreaker/protoPlan";
import { drawBricks } from "../lib/brickBreaker/render";

const LOGO_FADE_MS = 500;
const TRAIL_STEPS = 8;
const TRAIL_STEP_MS = 30;
const DEFAULT_ASPECT = 2.5;

function drawLogo(
  ctx: CanvasRenderingContext2D,
  plan: ProtoPlan,
  sprite: Sprite | null,
  elapsedMs: number,
  nowMs: number,
  idle: boolean
): void {
  if (!sprite) return;
  const body = plan.bodies[0]!;
  const { hw, hh } = plan;
  const durationMs = plan.base.params.durationMs;
  const alpha = elapsedMs >= durationMs ? 1 - (elapsedMs - durationMs) / LOGO_FADE_MS : 1;
  if (alpha <= 0) return;

  const pos = bodyPosition(body, elapsedMs);
  const x = pos.x;
  const y = pos.y + (idle ? Math.sin(nowMs / 650) * hh * 1.1 : 0);

  if (!idle && elapsedMs > 0 && elapsedMs < durationMs) {
    for (let k = TRAIL_STEPS; k >= 1; k--) {
      const t = elapsedMs - k * TRAIL_STEP_MS;
      if (t <= 0) continue;
      const q = bodyPosition(body, t);
      ctx.globalAlpha = 0.12 * (1 - k / (TRAIL_STEPS + 1)) * alpha;
      ctx.drawImage(sprite.canvas, q.x - hw, q.y - hh, hw * 2, hh * 2);
    }
  }

  ctx.globalAlpha = alpha;
  ctx.shadowColor = "rgba(255,255,255,0.55)";
  ctx.shadowBlur = hh * 1.2;
  ctx.drawImage(sprite.canvas, x - hw, y - hh, hw * 2, hh * 2);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;
}

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
  const logoSrc = resolveLogoSrc(config);
  const brickH = height * (config.brickSizePercent / 100);
  const sprite = useLogo(logoSrc, (brickH * config.ballSizePercent) / 100);
  const aspect = sprite?.aspect ?? DEFAULT_ASPECT;

  const plan = useMemo(
    () =>
      generateProtoPlan({
        seed: state.gameSeed,
        durationMs: config.timerDurationSeconds * 1000,
        width,
        height,
        brickSizePercent: config.brickSizePercent,
        holeWidthPercent: config.holeWidthPercent,
        holeHeightPercent: config.holeHeightPercent,
        ballSizePercent: config.ballSizePercent,
        bodyCount: 1,
        shape: "rect",
        aspect,
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
      aspect,
    ]
  );

  useEffect(() => {
    onPlan?.(plan.base);
  }, [plan, onPlan]);

  const live = useRef({ plan, config, state, scrubMs, sprite });
  live.current = { plan, config, state, scrubMs, sprite };

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
      drawBricks(ctx, cur.plan.base, elapsed, cur.config.brickPalette);
      drawLogo(ctx, cur.plan, cur.sprite, elapsed, now, idle);
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
