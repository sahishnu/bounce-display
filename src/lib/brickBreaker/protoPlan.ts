/**
 * PROTOTYPE (throwaway): deterministic planner for N bodies sharing one brick grid.
 *
 * A body is either a circle (ball) or an axis-aligned rectangle (logo). Bodies are
 * planned event-by-event in time order: the body with the earliest clock picks its next
 * brick. A brick claimed by one body stays solid for the others until its break time, so
 * nobody flies through a standing brick. Bodies do not collide with each other.
 */
import {
  computeLayout,
  mulberry32,
  type Brick,
  type BrickBreakerParams,
  type BrickBreakerPlan,
  type PlanEvent,
  type Point,
} from "./plan";

export type ProtoParams = BrickBreakerParams & {
  bodyCount: number;
  shape: "circle" | "rect";
  /** Rect only: width / height. */
  aspect: number;
};

export type BodyPath = {
  points: Point[];
  /** times[i] = ms at which the body reaches points[i + 1]. */
  times: number[];
};

export type ProtoPlan = {
  /** Shared state (bricks, break times, merged events) in the shape render.ts expects. */
  base: BrickBreakerPlan;
  bodies: BodyPath[];
  hw: number;
  hh: number;
  round: boolean;
};

const EPS = 1e-7;
const CONES_DEG = [8, 16, 28, 45, 70];

type Rect = { x0: number; y0: number; x1: number; y1: number };
type Hit = { t: number; nx: number; ny: number; brick: number; corner: boolean };
type Candidate = Hit & { angle: number; cx: number; cy: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function distToRect(px: number, py: number, r: Rect): number {
  return Math.hypot(Math.max(r.x0 - px, 0, px - r.x1), Math.max(r.y0 - py, 0, py - r.y1));
}

function cast(
  px: number,
  py: number,
  dx: number,
  dy: number,
  rects: Rect[],
  solid: Uint8Array,
  W: number,
  H: number,
  hw: number,
  hh: number,
  round: boolean
): Hit {
  let best: Hit = { t: Infinity, nx: 0, ny: 0, brick: -1, corner: false };
  if (dx > EPS) {
    const t = (W - hw - px) / dx;
    if (t < best.t) best = { t, nx: -1, ny: 0, brick: -1, corner: false };
  } else if (dx < -EPS) {
    const t = (hw - px) / dx;
    if (t < best.t) best = { t, nx: 1, ny: 0, brick: -1, corner: false };
  }
  if (dy > EPS) {
    const t = (H - hh - py) / dy;
    if (t < best.t) best = { t, nx: 0, ny: -1, brick: -1, corner: false };
  } else if (dy < -EPS) {
    const t = (hh - py) / dy;
    if (t < best.t) best = { t, nx: 0, ny: 1, brick: -1, corner: false };
  }

  const ex = px + dx * best.t;
  const ey = py + dy * best.t;
  const minX = Math.min(px, ex) - hw;
  const maxX = Math.max(px, ex) + hw;
  const minY = Math.min(py, ey) - hh;
  const maxY = Math.max(py, ey) + hh;
  // Round bodies get true corners below; rect bodies treat the grown rectangle as sharp.
  const yTol = round ? 0 : hh;
  const xTol = round ? 0 : hw;

  for (let i = 0; i < rects.length; i++) {
    if (!solid[i]) continue;
    const rc = rects[i]!;
    if (rc.x1 < minX || rc.x0 > maxX || rc.y1 < minY || rc.y0 > maxY) continue;

    if (dx > EPS) {
      const t = (rc.x0 - hw - px) / dx;
      if (t > EPS && t < best.t) {
        const y = py + t * dy;
        if (y >= rc.y0 - yTol && y <= rc.y1 + yTol) best = { t, nx: -1, ny: 0, brick: i, corner: false };
      }
    } else if (dx < -EPS) {
      const t = (rc.x1 + hw - px) / dx;
      if (t > EPS && t < best.t) {
        const y = py + t * dy;
        if (y >= rc.y0 - yTol && y <= rc.y1 + yTol) best = { t, nx: 1, ny: 0, brick: i, corner: false };
      }
    }
    if (dy > EPS) {
      const t = (rc.y0 - hh - py) / dy;
      if (t > EPS && t < best.t) {
        const x = px + t * dx;
        if (x >= rc.x0 - xTol && x <= rc.x1 + xTol) best = { t, nx: 0, ny: -1, brick: i, corner: false };
      }
    } else if (dy < -EPS) {
      const t = (rc.y1 + hh - py) / dy;
      if (t > EPS && t < best.t) {
        const x = px + t * dx;
        if (x >= rc.x0 - xTol && x <= rc.x1 + xTol) best = { t, nx: 0, ny: 1, brick: i, corner: false };
      }
    }

    if (!round) continue;
    const r = hw;
    for (let k = 0; k < 4; k++) {
      const cx = k & 1 ? rc.x1 : rc.x0;
      const cy = k & 2 ? rc.y1 : rc.y0;
      const ox = px - cx;
      const oy = py - cy;
      const b = ox * dx + oy * dy;
      const c = ox * ox + oy * oy - r * r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t <= EPS || t >= best.t) continue;
      const hx = px + t * dx;
      const hy = py + t * dy;
      if (!(k & 1 ? hx > cx : hx < cx) || !(k & 2 ? hy > cy : hy < cy)) continue;
      best = { t, nx: (hx - cx) / r, ny: (hy - cy) / r, brick: i, corner: true };
    }
  }
  return best;
}

export function generateProtoPlan(params: ProtoParams): ProtoPlan {
  const { width: W, height: H } = params;
  const durationMs = Math.max(1, params.durationMs);
  const rng = mulberry32(params.seed);
  const layout = computeLayout(params);
  const { cols, rows, brickW, brickH, holeCols, holeRows, holeC0, holeR0 } = layout;

  const round = params.shape === "circle";
  const baseSize = (brickH * clamp(params.ballSizePercent, 10, 200)) / 100;
  const hh = round ? baseSize / 2 : baseSize / 2;
  const hw = round ? baseSize / 2 : (baseSize * params.aspect) / 2;

  const all: Brick[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (col >= holeC0 && col < holeC0 + holeCols && row >= holeR0 && row < holeR0 + holeRows) {
        continue;
      }
      const dxC = Math.max(holeC0 - col, col - (holeC0 + holeCols - 1), 0);
      const dyC = Math.max(holeR0 - row, row - (holeR0 + holeRows - 1), 0);
      all.push({
        id: -1, col, row, x: col * brickW, y: row * brickH, w: brickW, h: brickH,
        layer: Math.max(dxC, dyC),
      });
    }
  }
  const capacity = all.length;

  // Same pacing rule as the single-ball game (one brick per 2 s on average).
  const target = clamp(Math.floor(durationMs / 2000), Math.min(3, capacity), capacity);
  let kept = all;
  if (target < capacity) {
    const shuffled = all.map((b) => ({ b, k: rng() })).sort((a, c) => c.b.layer - a.b.layer || a.k - c.k);
    const dropped = new Set(shuffled.slice(0, capacity - target).map((s) => s.b));
    kept = all.filter((b) => !dropped.has(b));
  }
  const bricks = kept.map((b, i) => ({ ...b, id: i }));
  const rects: Rect[] = bricks.map((b) => ({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h }));
  // Unscaled break time (distance units); Infinity = not yet claimed.
  const breakDist = new Float64Array(bricks.length).fill(Infinity);
  const solid = new Uint8Array(bricks.length);
  let unclaimed = bricks.length;

  const margin = 0.3 * Math.min(hw, hh);
  const clearance = 1.15 * hw;
  const minLen = 2 * Math.min(hw, hh);

  type Body = {
    px: number; py: number; t: number; mirror: number | null; wallStreak: number; done: boolean;
    points: Point[]; dist: number[];
  };
  const spacing = Math.max(hw, hh) * 2.6;
  const bodies: Body[] = Array.from({ length: Math.max(1, params.bodyCount) }, (_, i) => {
    const x = W / 2 + (i - (params.bodyCount - 1) / 2) * spacing;
    return { px: x, py: H / 2, t: 0, mirror: null, wallStreak: 0, done: false, points: [{ x, y: H / 2 }], dist: [] };
  });

  type Mode = "brick" | "wall";
  let body = bodies[0]!;

  const evaluate = (angle: number, mode: Mode, strict: boolean): Candidate | null => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const hit = cast(body.px, body.py, dx, dy, rects, solid, W, H, hw, hh, round);
    if (!Number.isFinite(hit.t)) return null;
    if (strict && hit.t < minLen) return null;
    const cx = body.px + dx * hit.t;
    const cy = body.py + dy * hit.t;
    const cand: Candidate = { ...hit, angle, cx, cy };

    if (mode === "wall") {
      if (hit.brick >= 0) return null;
      if (Math.min(cx - hw, W - hw - cx) < hw && Math.min(cy - hh, H - hh - cy) < hh) return null;
      return cand;
    }
    if (hit.brick < 0 || breakDist[hit.brick] !== Infinity) return null;
    if (!strict) return cand;
    if (hit.corner) return null;

    const rc = rects[hit.brick]!;
    const along = hit.nx !== 0 ? cy : cx;
    const lo = hit.nx !== 0 ? rc.y0 : rc.x0;
    const hi = hit.nx !== 0 ? rc.y1 : rc.x1;
    if (along < lo + margin || along > hi - margin) return null;

    for (let j = 0; j < rects.length; j++) {
      if (j === hit.brick || !solid[j]) continue;
      const o = rects[j]!;
      if (round) {
        if (distToRect(cx, cy, o) < clearance) return null;
      } else if (
        o.x0 < cx + hw - 0.02 * hh && o.x1 > cx - hw + 0.02 * hh &&
        o.y0 < cy + hh - 0.02 * hh && o.y1 > cy - hh + 0.02 * hh
      ) {
        return null;
      }
    }
    return cand;
  };

  const sample = (centre: number, cone: number, count: number, mode: Mode, strict: boolean) => {
    const found: Candidate[] = [];
    for (let i = 0; i < count; i++) {
      const c = evaluate(centre + (((i + rng()) / count) * 2 - 1) * cone, mode, strict);
      if (c) found.push(c);
    }
    if (found.length === 0) return null;
    const weights = found.map((c) => Math.sqrt(c.t));
    let roll = rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < found.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) return found[i]!;
    }
    return found[found.length - 1]!;
  };

  const events: { distT: number; brick: number }[] = [];
  let guard = 0;
  const guardMax = 80 * bricks.length + 4000;

  while (unclaimed > 0) {
    if (++guard > guardMax) throw new Error("proto planner failed to converge");
    const live = bodies.filter((b) => !b.done);
    if (live.length === 0) throw new Error("proto planner: every body is stuck");
    body = live.reduce((a, b) => (b.t < a.t ? b : a));
    for (let i = 0; i < bricks.length; i++) solid[i] = breakDist[i] > body.t ? 1 : 0;

    let chosen: Candidate | null = null;
    if (body.mirror !== null) {
      for (const cone of CONES_DEG) {
        chosen = sample(body.mirror, (cone * Math.PI) / 180, 100, "brick", true);
        if (chosen) break;
      }
      if (!chosen && body.wallStreak < 2) {
        chosen = sample(body.mirror, (28 * Math.PI) / 180, 60, "wall", true);
      }
    }
    const spin = body.mirror ?? rng() * Math.PI * 2;
    if (!chosen) chosen = sample(spin, Math.PI, 360, "brick", true);
    if (!chosen) chosen = sample(spin, Math.PI, 720, "brick", false);
    if (!chosen) {
      body.done = true;
      continue;
    }

    body.t += chosen.t;
    if (chosen.brick >= 0) {
      breakDist[chosen.brick] = body.t;
      unclaimed--;
      body.wallStreak = 0;
    } else {
      body.wallStreak++;
    }
    events.push({ distT: body.t, brick: chosen.brick });
    body.points.push({ x: chosen.cx, y: chosen.cy });
    body.dist.push(body.t);

    const dx = Math.cos(chosen.angle);
    const dy = Math.sin(chosen.angle);
    const dot = dx * chosen.nx + dy * chosen.ny;
    body.mirror = Math.atan2(dy - 2 * dot * chosen.ny, dx - 2 * dot * chosen.nx);
    body.px = chosen.cx;
    body.py = chosen.cy;
  }

  // Scale so the last brick breaks exactly at durationMs.
  let maxT = 0;
  for (const d of breakDist) if (Number.isFinite(d) && d > maxT) maxT = d;
  const k = durationMs / maxT;
  const breakTimes = new Float64Array(bricks.length);
  for (let i = 0; i < bricks.length; i++) breakTimes[i] = breakDist[i]! * k;

  const merged: PlanEvent[] = events
    .map((e) => ({ t: e.distT * k, brick: e.brick, deflectionDeg: 0 }))
    .sort((a, b) => a.t - b.t);

  const base: BrickBreakerPlan = {
    params: { ...params, durationMs },
    cols, rows, brickW, brickH,
    ballRadius: hh,
    capacity, bricks,
    points: [{ x: W / 2, y: H / 2 }],
    events: merged,
    breakTimes,
    speedPxPerSec: maxT / (durationMs / 1000),
  };

  return {
    base,
    bodies: bodies.map((b) => ({ points: b.points, times: b.dist.map((d) => d * k) })),
    hw,
    hh,
    round,
  };
}

/** Body centre at `elapsedMs`; rests at its start before 0 and at its last point after. */
export function bodyPosition(path: BodyPath, elapsedMs: number): Point {
  const { points, times } = path;
  if (times.length === 0 || elapsedMs <= 0) return points[0]!;
  if (elapsedMs >= times[times.length - 1]!) return points[points.length - 1]!;
  let lo = 0;
  let hi = times.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times[mid]! > elapsedMs) hi = mid;
    else lo = mid + 1;
  }
  const t0 = lo === 0 ? 0 : times[lo - 1]!;
  const f = (elapsedMs - t0) / (times[lo]! - t0 || 1);
  const a = points[lo]!;
  const b = points[lo + 1]!;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}
