/**
 * Deterministic brick-breaker plan.
 *
 * The whole game is a pure function of (seed, duration, stage size, brick/hole/ball
 * sizes). The generator lays out a brick grid with an empty rectangle in the middle,
 * then walks a ball through it bounce by bounce, always breaking one exposed brick per
 * hit. Geometry (the route) is chosen first; timing is assigned afterwards so the final
 * brick breaks exactly at `durationMs`.
 */

export type BrickBreakerParams = {
  seed: number;
  durationMs: number;
  /** Stage inner size in px. */
  width: number;
  height: number;
  /** Brick height as % of stage height. */
  brickSizePercent: number;
  holeWidthPercent: number;
  holeHeightPercent: number;
  /** Ball diameter as % of brick height. */
  ballSizePercent: number;
};

export type Brick = {
  id: number;
  col: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 1 = touching the hole; higher = further out. */
  layer: number;
};

export type Point = { x: number; y: number };

export type PlanEvent = {
  /** Elapsed ms at which the ball reaches `points[i + 1]`. */
  t: number;
  /** Brick id broken by this bounce, or -1 for a stage-edge bounce. */
  brick: number;
  /** Angle between a true mirror bounce and the actual outgoing direction. */
  deflectionDeg: number;
};

export type BrickBreakerPlan = {
  params: BrickBreakerParams;
  cols: number;
  rows: number;
  brickW: number;
  brickH: number;
  ballRadius: number;
  /** Bricks in the grid before pacing removed any. */
  capacity: number;
  bricks: Brick[];
  /** points[0] is the idle start; points[i + 1] is where events[i] happens. */
  points: Point[];
  events: PlanEvent[];
  /** Per brick id: elapsed ms at which it breaks. */
  breakTimes: Float64Array;
  /** Average ball speed in px/s. */
  speedPxPerSec: number;
};

export const MIN_BRICK_INTERVAL_S = 2;
export const MIN_BRICKS = 3;
export const BRICK_ASPECT = 2;
/** Largest speed change between consecutive segments. */
export const MAX_SPEED_STEP = 0.1;
const SPEED_MULT_MIN = 0.75;
const SPEED_MULT_MAX = 1.3;
/** Allowed deflection cones (degrees) tried in order before falling back. */
const CONES_DEG = [8, 16, 28, 45, 70];

const EPS = 1e-7;

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

type Layout = {
  cols: number;
  rows: number;
  brickW: number;
  brickH: number;
  holeCols: number;
  holeRows: number;
  holeC0: number;
  holeR0: number;
};

export function computeLayout(p: BrickBreakerParams): Layout {
  const targetH = p.height * (clamp(p.brickSizePercent, 2, 30) / 100);
  const rows = Math.max(5, Math.round(p.height / targetH));
  const brickH = p.height / rows;
  const cols = Math.max(5, Math.round(p.width / (brickH * BRICK_ASPECT)));
  const brickW = p.width / cols;

  const fitHole = (total: number, percent: number) => {
    let hole = clamp(Math.round((total * percent) / 100), 3, total - 2);
    if ((total - hole) % 2 !== 0) hole += hole + 1 <= total - 2 ? 1 : -1;
    return hole;
  };
  const holeCols = fitHole(cols, p.holeWidthPercent);
  const holeRows = fitHole(rows, p.holeHeightPercent);
  return {
    cols,
    rows,
    brickW,
    brickH,
    holeCols,
    holeRows,
    holeC0: (cols - holeCols) / 2,
    holeR0: (rows - holeRows) / 2,
  };
}

type Rect = { x0: number; y0: number; x1: number; y1: number };

type Hit = {
  t: number;
  nx: number;
  ny: number;
  brick: number;
  /** Contact is on a brick's rounded corner rather than a flat face. */
  corner: boolean;
};

type Candidate = {
  angle: number;
  t: number;
  nx: number;
  ny: number;
  brick: number;
  cx: number;
  cy: number;
};

function distToRect(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x0 - px, 0, px - r.x1);
  const dy = Math.max(r.y0 - py, 0, py - r.y1);
  return Math.hypot(dx, dy);
}

/** Sweep a circle of radius `r` from (px, py) along unit (dx, dy). */
function cast(
  px: number,
  py: number,
  dx: number,
  dy: number,
  rects: Rect[],
  alive: Uint8Array,
  width: number,
  height: number,
  r: number
): Hit {
  let best: Hit = { t: Infinity, nx: 0, ny: 0, brick: -1, corner: false };

  if (dx > EPS) {
    const t = (width - r - px) / dx;
    if (t < best.t) best = { t, nx: -1, ny: 0, brick: -1, corner: false };
  } else if (dx < -EPS) {
    const t = (r - px) / dx;
    if (t < best.t) best = { t, nx: 1, ny: 0, brick: -1, corner: false };
  }
  if (dy > EPS) {
    const t = (height - r - py) / dy;
    if (t < best.t) best = { t, nx: 0, ny: -1, brick: -1, corner: false };
  } else if (dy < -EPS) {
    const t = (r - py) / dy;
    if (t < best.t) best = { t, nx: 0, ny: 1, brick: -1, corner: false };
  }

  const reach = best.t;
  const ex = px + dx * reach;
  const ey = py + dy * reach;
  const minX = Math.min(px, ex) - r;
  const maxX = Math.max(px, ex) + r;
  const minY = Math.min(py, ey) - r;
  const maxY = Math.max(py, ey) + r;

  for (let i = 0; i < rects.length; i++) {
    if (!alive[i]) continue;
    const rc = rects[i]!;
    if (rc.x1 < minX || rc.x0 > maxX || rc.y1 < minY || rc.y0 > maxY) continue;

    // Flat faces (rectangle grown by r along each axis).
    if (dx > EPS) {
      const t = (rc.x0 - r - px) / dx;
      if (t > EPS && t < best.t) {
        const y = py + t * dy;
        if (y >= rc.y0 && y <= rc.y1) best = { t, nx: -1, ny: 0, brick: i, corner: false };
      }
    } else if (dx < -EPS) {
      const t = (rc.x1 + r - px) / dx;
      if (t > EPS && t < best.t) {
        const y = py + t * dy;
        if (y >= rc.y0 && y <= rc.y1) best = { t, nx: 1, ny: 0, brick: i, corner: false };
      }
    }
    if (dy > EPS) {
      const t = (rc.y0 - r - py) / dy;
      if (t > EPS && t < best.t) {
        const x = px + t * dx;
        if (x >= rc.x0 && x <= rc.x1) best = { t, nx: 0, ny: -1, brick: i, corner: false };
      }
    } else if (dy < -EPS) {
      const t = (rc.y1 + r - py) / dy;
      if (t > EPS && t < best.t) {
        const x = px + t * dx;
        if (x >= rc.x0 && x <= rc.x1) best = { t, nx: 0, ny: 1, brick: i, corner: false };
      }
    }

    // Rounded corners.
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
      const outX = k & 1 ? hx > cx : hx < cx;
      const outY = k & 2 ? hy > cy : hy < cy;
      if (!outX || !outY) continue;
      best = { t, nx: (hx - cx) / r, ny: (hy - cy) / r, brick: i, corner: true };
    }
  }
  return best;
}

function angleDiffDeg(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs((d * 180) / Math.PI);
}

export function generatePlan(params: BrickBreakerParams): BrickBreakerPlan {
  const { width, height } = params;
  const durationMs = Math.max(1, params.durationMs);
  const rng = mulberry32(params.seed);
  const layout = computeLayout(params);
  const { cols, rows, brickW, brickH, holeCols, holeRows, holeC0, holeR0 } = layout;
  const r = (brickH * clamp(params.ballSizePercent, 10, 80)) / 100 / 2;

  // Grid minus the hole.
  const all: Brick[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const inHole =
        col >= holeC0 && col < holeC0 + holeCols && row >= holeR0 && row < holeR0 + holeRows;
      if (inHole) continue;
      const dxCells = Math.max(holeC0 - col, col - (holeC0 + holeCols - 1), 0);
      const dyCells = Math.max(holeR0 - row, row - (holeR0 + holeRows - 1), 0);
      all.push({
        id: -1,
        col,
        row,
        x: col * brickW,
        y: row * brickH,
        w: brickW,
        h: brickH,
        layer: Math.max(dxCells, dyCells),
      });
    }
  }
  const capacity = all.length;

  // Pacing: never break faster than one brick per MIN_BRICK_INTERVAL_S on average.
  // Surplus bricks are dropped from the outermost layers, which nothing sits behind.
  const target = clamp(
    Math.floor(durationMs / 1000 / MIN_BRICK_INTERVAL_S),
    Math.min(MIN_BRICKS, capacity),
    capacity
  );
  let kept = all;
  if (target < capacity) {
    const shuffled = all
      .map((b) => ({ b, k: rng() }))
      .sort((a, c) => c.b.layer - a.b.layer || a.k - c.k);
    const dropped = new Set(shuffled.slice(0, capacity - target).map((s) => s.b));
    kept = all.filter((b) => !dropped.has(b));
  }
  const bricks = kept.map((b, i) => ({ ...b, id: i }));
  const rects: Rect[] = bricks.map((b) => ({ x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h }));
  const alive = new Uint8Array(bricks.length).fill(1);
  let aliveCount = bricks.length;

  const start: Point = { x: width / 2, y: height / 2 };
  const margin = 0.3 * r;
  const clearance = 1.15 * r;
  const minLen = 2 * r;

  let px = start.x;
  let py = start.y;

  type Mode = "brick" | "wall";

  const evaluate = (
    angle: number,
    mode: Mode,
    strict: boolean
  ): Candidate | null => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const hit = cast(px, py, dx, dy, rects, alive, width, height, r);
    if (!Number.isFinite(hit.t)) return null;
    if (strict && hit.t < minLen) return null;
    const cx = px + dx * hit.t;
    const cy = py + dy * hit.t;
    const cand: Candidate = {
      angle,
      t: hit.t,
      nx: hit.nx,
      ny: hit.ny,
      brick: hit.brick,
      cx,
      cy,
    };

    if (mode === "wall") {
      if (hit.brick >= 0) return null;
      // Stay clear of stage corners where two walls meet.
      const nearX = Math.min(cx - r, width - r - cx);
      const nearY = Math.min(cy - r, height - r - cy);
      if (nearX < r && nearY < r) return null;
      return cand;
    }

    if (hit.brick < 0) return null;
    if (!strict) return cand;
    if (hit.corner) return null;

    const rc = rects[hit.brick]!;
    const along = hit.nx !== 0 ? cy : cx;
    const lo = hit.nx !== 0 ? rc.y0 : rc.x0;
    const hi = hit.nx !== 0 ? rc.y1 : rc.x1;
    if (along < lo + margin || along > hi - margin) return null;

    // Reject near-simultaneous contact with a second brick.
    for (let j = 0; j < rects.length; j++) {
      if (j === hit.brick || !alive[j]) continue;
      const o = rects[j]!;
      if (o.x1 < cx - 2 * r || o.x0 > cx + 2 * r || o.y1 < cy - 2 * r || o.y0 > cy + 2 * r) {
        continue;
      }
      if (distToRect(cx, cy, o) < clearance) return null;
    }
    return cand;
  };

  const pick = (cands: Candidate[]): Candidate | null => {
    if (cands.length === 0) return null;
    const weights = cands.map((c) => Math.sqrt(c.t));
    let total = 0;
    for (const w of weights) total += w;
    let roll = rng() * total;
    for (let i = 0; i < cands.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) return cands[i]!;
    }
    return cands[cands.length - 1]!;
  };

  const sample = (
    centre: number,
    coneRad: number,
    count: number,
    mode: Mode,
    strict: boolean
  ): Candidate | null => {
    const found: Candidate[] = [];
    for (let i = 0; i < count; i++) {
      const frac = ((i + rng()) / count) * 2 - 1;
      const cand = evaluate(centre + frac * coneRad, mode, strict);
      if (cand) found.push(cand);
    }
    return pick(found);
  };

  const points: Point[] = [start];
  const rawEvents: { brick: number; deflectionDeg: number; len: number }[] = [];
  let mirror: number | null = null;
  let wallStreak = 0;
  let guard = 0;
  const guardMax = 60 * bricks.length + 2000;

  while (aliveCount > 0) {
    if (++guard > guardMax) {
      throw new Error("brick-breaker planner failed to converge");
    }
    let chosen: Candidate | null = null;

    if (mirror !== null) {
      for (const cone of CONES_DEG) {
        chosen = sample(mirror, (cone * Math.PI) / 180, 100, "brick", true);
        if (chosen) break;
      }
      if (!chosen && wallStreak < 2) {
        chosen = sample(mirror, (28 * Math.PI) / 180, 60, "wall", true);
      }
    }
    const spin = mirror ?? rng() * Math.PI * 2;
    if (!chosen) chosen = sample(spin, Math.PI, 360, "brick", true);
    if (!chosen) chosen = sample(spin, Math.PI, 720, "brick", false);
    if (!chosen) throw new Error("brick-breaker planner found no reachable brick");

    const deflectionDeg = mirror === null ? 0 : angleDiffDeg(chosen.angle, mirror);
    if (chosen.brick >= 0) {
      alive[chosen.brick] = 0;
      aliveCount--;
      wallStreak = 0;
    } else {
      wallStreak++;
    }
    rawEvents.push({ brick: chosen.brick, deflectionDeg, len: chosen.t });
    points.push({ x: chosen.cx, y: chosen.cy });

    const dx = Math.cos(chosen.angle);
    const dy = Math.sin(chosen.angle);
    const dot = dx * chosen.nx + dy * chosen.ny;
    mirror = Math.atan2(dy - 2 * dot * chosen.ny, dx - 2 * dot * chosen.nx);
    px = chosen.cx;
    py = chosen.cy;
  }

  // Timing: per-segment speed multipliers wander by at most MAX_SPEED_STEP per bounce,
  // then one uniform scale makes the total equal the duration exactly.
  const mult: number[] = [];
  let m = 1;
  for (let i = 0; i < rawEvents.length; i++) {
    m = clamp(m * (1 + (rng() * 2 - 1) * MAX_SPEED_STEP), SPEED_MULT_MIN, SPEED_MULT_MAX);
    mult.push(m);
  }
  let weighted = 0;
  rawEvents.forEach((e, i) => {
    weighted += e.len / mult[i]!;
  });
  const speed = weighted / (durationMs / 1000);

  const events: PlanEvent[] = [];
  const breakTimes = new Float64Array(bricks.length).fill(Infinity);
  let elapsed = 0;
  rawEvents.forEach((e, i) => {
    elapsed += (e.len / (speed * mult[i]!)) * 1000;
    const t = i === rawEvents.length - 1 ? durationMs : elapsed;
    events.push({ t, brick: e.brick, deflectionDeg: e.deflectionDeg });
    if (e.brick >= 0) breakTimes[e.brick] = t;
  });

  return {
    params: { ...params, durationMs },
    cols,
    rows,
    brickW,
    brickH,
    ballRadius: r,
    capacity,
    bricks,
    points,
    events,
    breakTimes,
    speedPxPerSec: speed,
  };
}

/** Ball centre at `elapsedMs`. Before the start it rests; after the end it stays put. */
export function getBallPosition(plan: BrickBreakerPlan, elapsedMs: number): Point {
  const { events, points } = plan;
  if (elapsedMs <= 0) return points[0]!;
  const last = events[events.length - 1]!;
  if (elapsedMs >= last.t) return points[points.length - 1]!;

  let lo = 0;
  let hi = events.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (events[mid]!.t > elapsedMs) hi = mid;
    else lo = mid + 1;
  }
  const t0 = lo === 0 ? 0 : events[lo - 1]!.t;
  const t1 = events[lo]!.t;
  const f = t1 > t0 ? (elapsedMs - t0) / (t1 - t0) : 1;
  const a = points[lo]!;
  const b = points[lo + 1]!;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

export function isBrickAlive(plan: BrickBreakerPlan, id: number, elapsedMs: number): boolean {
  return elapsedMs < plan.breakTimes[id]!;
}

export function summarizePlan(plan: BrickBreakerPlan) {
  const count = plan.bricks.length;
  return {
    brickCount: count,
    capacity: plan.capacity,
    avgIntervalSec: plan.params.durationMs / 1000 / Math.max(1, count),
    speedPxPerSec: plan.speedPxPerSec,
  };
}
