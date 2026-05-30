/** Squash intensity on wall impact (scale deviation from 1). */
const SQUASH_AMOUNT = 0.06;
/** How quickly squash springs back toward 1 (higher = snappier). */
const SCALE_RECOVERY = 0.24;
/** Peak chromatic split in px on impact. */
const CHROMATIC_HIT_PX = 11;
/** Chromatic decay per normalized frame (~60fps). */
const CHROMATIC_DECAY = 0.13;
/** Idle chromatic wobble amplitude in px when effect is on. */
const CHROMATIC_IDLE_PX = 3.2;

export const BOUNCE_NOISE_MIN = 0.01;
export const BOUNCE_NOISE_MAX = 0.05;

export type BounceBody = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  scaleX: number;
  scaleY: number;
  chromaticPx: number;
  /** Per-logo noise margin (0.01–0.05). */
  noiseFactor: number;
};

export function randomNoiseFactor(): number {
  return BOUNCE_NOISE_MIN + Math.random() * (BOUNCE_NOISE_MAX - BOUNCE_NOISE_MIN);
}

type WallHits = { x: boolean; y: boolean };

/**
 * One-shot variance when leaving a wall — breaks repeating lanes/corners.
 * Between bounces velocity stays constant (straight path).
 */
export function applyBounceVariance(
  vx: number,
  vy: number,
  noiseFactor: number,
  hits: WallHits,
  reducedMotion: boolean
): { vx: number; vy: number } {
  if (reducedMotion || noiseFactor <= 0 || (!hits.x && !hits.y)) return { vx, vy };

  let mag = Math.hypot(vx, vy);
  if (mag <= 0) return { vx, vy };

  mag *= 1 + (Math.random() - 0.5) * 2 * noiseFactor;

  let angle = Math.atan2(vy, vx);
  let angleDelta = (Math.random() - 0.5) * 2 * noiseFactor * Math.PI * 0.35;
  if (hits.x && hits.y) {
    angleDelta += (Math.random() - 0.5) * 2 * noiseFactor * Math.PI * 0.25;
  }

  const absVx = Math.abs(vx);
  const absVy = Math.abs(vy);
  const axisSlack = mag * noiseFactor * 2;
  const nearlyHorizontal =
    absVy <= axisSlack || absVy / Math.max(absVx, 1e-6) < 0.06;
  const nearlyVertical =
    absVx <= axisSlack || absVx / Math.max(absVy, 1e-6) < 0.06;
  if (nearlyHorizontal || nearlyVertical) {
    angleDelta += (Math.random() < 0.5 ? -1 : 1) * noiseFactor * 1.2;
  }

  angle += angleDelta;

  return {
    vx: Math.cos(angle) * mag,
    vy: Math.sin(angle) * mag,
  };
}

export type BounceStepOptions = {
  boxW: number;
  boxH: number;
  /** Elapsed time in 60fps frame units (1 ≈ 16.67ms). */
  dt: number;
  chromaticEnabled: boolean;
  reducedMotion: boolean;
  timeMs: number;
};

function lerpToward(current: number, target: number, factor: number, dt: number): number {
  const t = 1 - Math.pow(1 - factor, dt);
  return current + (target - current) * t;
}

function idleChromaticOffset(timeMs: number): number {
  const t = timeMs * 0.001;
  return (
    Math.sin(t * 4.2) * CHROMATIC_IDLE_PX * 0.55 +
    Math.sin(t * 6.8 + 1.1) * CHROMATIC_IDLE_PX * 0.45
  );
}

export function stepBounce(body: BounceBody, options: BounceStepOptions): BounceBody {
  const { boxW, boxH, dt, chromaticEnabled, reducedMotion, timeMs } = options;
  let { x, y, vx, vy, w, h, scaleX, scaleY, chromaticPx, noiseFactor } = body;

  x += vx * dt;
  y += vy * dt;

  let hitX = false;
  let hitY = false;

  if (x <= 0) {
    x = 0;
    vx = Math.abs(vx);
    hitX = true;
    if (!reducedMotion) {
      scaleX = 1 + SQUASH_AMOUNT;
      scaleY = 1 - SQUASH_AMOUNT * 0.5;
      if (chromaticEnabled) chromaticPx = CHROMATIC_HIT_PX;
    }
  } else if (x + w >= boxW) {
    x = boxW - w;
    vx = -Math.abs(vx);
    hitX = true;
    if (!reducedMotion) {
      scaleX = 1 + SQUASH_AMOUNT;
      scaleY = 1 - SQUASH_AMOUNT * 0.5;
      if (chromaticEnabled) chromaticPx = CHROMATIC_HIT_PX;
    }
  }

  if (y <= 0) {
    y = 0;
    vy = Math.abs(vy);
    hitY = true;
    if (!reducedMotion) {
      scaleY = 1 + SQUASH_AMOUNT;
      scaleX = 1 - SQUASH_AMOUNT * 0.5;
      if (chromaticEnabled) chromaticPx = CHROMATIC_HIT_PX;
    }
  } else if (y + h >= boxH) {
    y = boxH - h;
    vy = -Math.abs(vy);
    hitY = true;
    if (!reducedMotion) {
      scaleY = 1 + SQUASH_AMOUNT;
      scaleX = 1 - SQUASH_AMOUNT * 0.5;
      if (chromaticEnabled) chromaticPx = CHROMATIC_HIT_PX;
    }
  }

  if (hitX || hitY) {
    ({ vx, vy } = applyBounceVariance(vx, vy, noiseFactor, { x: hitX, y: hitY }, reducedMotion));
  }

  if (!reducedMotion) {
    scaleX = lerpToward(scaleX, 1, SCALE_RECOVERY, dt);
    scaleY = lerpToward(scaleY, 1, SCALE_RECOVERY, dt);
  } else {
    scaleX = 1;
    scaleY = 1;
  }

  if (chromaticEnabled && !reducedMotion) {
    chromaticPx = lerpToward(chromaticPx, 0, CHROMATIC_DECAY, dt);
    const idle = Math.abs(idleChromaticOffset(timeMs));
    chromaticPx = Math.max(chromaticPx, idle);
  } else {
    chromaticPx = 0;
  }

  return { x, y, vx, vy, w, h, scaleX, scaleY, chromaticPx, noiseFactor };
}

export function bounceTransform(body: BounceBody): string {
  const { x, y, scaleX, scaleY } = body;
  if (scaleX === 1 && scaleY === 1) {
    return `translate3d(${x}px, ${y}px, 0)`;
  }
  return `translate3d(${x}px, ${y}px, 0) scale(${scaleX}, ${scaleY})`;
}

export function chromaticFilter(px: number): string {
  if (px <= 0.05) return "";
  const r = px;
  const b = -px;
  return [
    `drop-shadow(${r}px 0 0 rgba(255, 55, 95, 0.82))`,
    `drop-shadow(${b}px 0 0 rgba(45, 210, 255, 0.82))`,
  ].join(" ");
}
