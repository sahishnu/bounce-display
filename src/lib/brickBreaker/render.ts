import { getBallPosition, type BrickBreakerPlan } from "./plan";

const BREAK_FX_MS = 650;
const FINAL_FX_MS = 1500;
const FLASH_MS = 180;
const BALL_FADE_MS = 500;
const TRAIL_STEPS = 10;
const TRAIL_STEP_MS = 28;

export type FrameOptions = {
  /** Wall-clock ms, used only for the idle float. */
  nowMs: number;
  /** Timer has not started: the ball floats at the centre of the hole. */
  idle: boolean;
};

/** Deterministic 0..1 value from two integers. */
function hash(a: number, b: number): number {
  let h = Math.imul(a + 1, 374761393) ^ Math.imul(b + 1, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function brickColor(row: number, rows: number, light = 55): string {
  const hue = (row / Math.max(1, rows - 1)) * 300;
  return `hsl(${hue.toFixed(0)} 78% ${light}%)`;
}

function firstEventAfter(plan: BrickBreakerPlan, t: number): number {
  const { events } = plan;
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid]!.t > t) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Clears the canvas, then draws standing bricks and break effects. */
export function drawBricks(
  ctx: CanvasRenderingContext2D,
  plan: BrickBreakerPlan,
  elapsedMs: number
): void {
  const { width, height } = plan.params;
  const { brickW, brickH, rows, events } = plan;
  ctx.clearRect(0, 0, width, height);

  // Standing bricks.
  const inset = Math.max(1, Math.min(brickW, brickH) * 0.04);
  for (const b of plan.bricks) {
    if (elapsedMs >= plan.breakTimes[b.id]!) continue;
    const x = b.x + inset;
    const y = b.y + inset;
    const w = b.w - inset * 2;
    const h = b.h - inset * 2;
    if (w <= 0 || h <= 0) continue;
    ctx.fillStyle = brickColor(b.row, rows);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, Math.min(w, h) * 0.12);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(x + w * 0.06, y + h * 0.08, w * 0.88, h * 0.16);
  }

  // Break effects: flash plus fragments, bigger for the final brick.
  const lastIdx = events.length - 1;
  const fxStart = firstEventAfter(plan, elapsedMs - FINAL_FX_MS);
  for (let i = fxStart; i < events.length; i++) {
    const e = events[i]!;
    if (e.t > elapsedMs) break;
    if (e.brick < 0) continue;
    const isFinal = i === lastIdx;
    const life = isFinal ? FINAL_FX_MS : BREAK_FX_MS;
    const age = elapsedMs - e.t;
    if (age >= life) continue;
    const b = plan.bricks[e.brick]!;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const fade = 1 - age / life;

    if (age < FLASH_MS) {
      const k = 1 - age / FLASH_MS;
      ctx.fillStyle = `rgba(255,255,255,${(0.9 * k).toFixed(3)})`;
      const grow = (isFinal ? 0.5 : 0.12) * (1 - k) * b.h;
      ctx.fillRect(b.x - grow, b.y - grow, b.w + grow * 2, b.h + grow * 2);
    }

    const count = isFinal ? 40 : 7;
    const power = isFinal ? 2.6 : 1;
    const seconds = age / 1000;
    for (let k = 0; k < count; k++) {
      const angle = hash(b.id, k) * Math.PI * 2;
      const speed = (0.9 + hash(b.id, k + 101) * 2.2) * brickH * power;
      const x = cx + Math.cos(angle) * speed * seconds * 1.6;
      const y = cy + Math.sin(angle) * speed * seconds * 1.6 + brickH * 2.2 * seconds * seconds;
      const size = brickH * (isFinal ? 0.2 : 0.13) * (0.6 + hash(b.id, k + 202) * 0.8);
      ctx.globalAlpha = Math.max(0, fade);
      ctx.fillStyle = brickColor(b.row, rows, 62);
      ctx.fillRect(x - size / 2, y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  plan: BrickBreakerPlan,
  elapsedMs: number,
  { nowMs, idle }: FrameOptions
): void {
  const { ballRadius: r } = plan;
  const durationMs = plan.params.durationMs;
  drawBricks(ctx, plan, elapsedMs);

  // Ball.
  let alpha = 1;
  if (elapsedMs >= durationMs) alpha = 1 - (elapsedMs - durationMs) / BALL_FADE_MS;
  if (alpha <= 0) return;

  const base = getBallPosition(plan, elapsedMs);
  const bob = idle ? Math.sin(nowMs / 650) * r * 1.1 : 0;
  const bx = base.x;
  const by = base.y + bob;

  if (!idle && elapsedMs > 0 && elapsedMs < durationMs) {
    for (let k = TRAIL_STEPS; k >= 1; k--) {
      const t = elapsedMs - k * TRAIL_STEP_MS;
      if (t <= 0) continue;
      const p = getBallPosition(plan, t);
      const f = 1 - k / (TRAIL_STEPS + 1);
      ctx.globalAlpha = 0.32 * f * alpha;
      ctx.fillStyle = "#9fdcff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * (0.45 + 0.5 * f), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = alpha;
  const glow = ctx.createRadialGradient(bx, by, r * 0.5, bx, by, r * 3.2);
  glow.addColorStop(0, "rgba(170,225,255,0.45)");
  glow.addColorStop(1, "rgba(170,225,255,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(bx, by, r * 3.2, 0, Math.PI * 2);
  ctx.fill();

  const body = ctx.createRadialGradient(bx - r * 0.3, by - r * 0.35, r * 0.1, bx, by, r);
  body.addColorStop(0, "#ffffff");
  body.addColorStop(1, "#bfe6ff");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}
