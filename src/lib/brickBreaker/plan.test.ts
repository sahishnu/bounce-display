import { describe, expect, it } from "vitest";
import {
  generatePlan,
  getBallPosition,
  MAX_SPEED_STEP,
  type BrickBreakerParams,
  type BrickBreakerPlan,
} from "./plan";

const STAGES = [
  { width: 640, height: 360 },
  { width: 1920, height: 1080 },
  { width: 3584, height: 1536 },
];
const DURATIONS_S = [10, 60, 300, 600, 900, 3600, 7200];
const SEEDS = [1, 2, 3, 7, 42];

function params(
  seed: number,
  durationS: number,
  stage: { width: number; height: number }
): BrickBreakerParams {
  return {
    seed,
    durationMs: durationS * 1000,
    ...stage,
    brickSizePercent: 6,
    holeWidthPercent: 50,
    holeHeightPercent: 40,
    ballSizePercent: 40,
  };
}

function allPlans(): BrickBreakerPlan[] {
  const plans: BrickBreakerPlan[] = [];
  for (const stage of STAGES) {
    for (const d of DURATIONS_S) {
      for (const seed of SEEDS) plans.push(generatePlan(params(seed, d, stage)));
    }
  }
  return plans;
}

const plans = allPlans();

describe("generatePlan", () => {
  it("is deterministic for the same inputs", () => {
    const a = generatePlan(params(5, 600, STAGES[1]!));
    const b = generatePlan(params(5, 600, STAGES[1]!));
    expect(JSON.stringify(a.events)).toBe(JSON.stringify(b.events));
    expect(JSON.stringify(a.points)).toBe(JSON.stringify(b.points));
  });

  it("varies with the seed", () => {
    const a = generatePlan(params(1, 600, STAGES[1]!));
    const b = generatePlan(params(2, 600, STAGES[1]!));
    expect(JSON.stringify(a.points)).not.toBe(JSON.stringify(b.points));
  });

  it("breaks every brick exactly once", () => {
    for (const plan of plans) {
      const hit = plan.events.filter((e) => e.brick >= 0).map((e) => e.brick);
      expect(new Set(hit).size).toBe(hit.length);
      expect(hit.length).toBe(plan.bricks.length);
    }
  });

  it("breaks the last brick at exactly the end of the timer", () => {
    for (const plan of plans) {
      const last = plan.events[plan.events.length - 1]!;
      expect(last.brick).toBeGreaterThanOrEqual(0);
      expect(last.t).toBe(plan.params.durationMs);
      expect(Math.max(...plan.breakTimes)).toBe(plan.params.durationMs);
    }
  });

  it("has strictly increasing event times", () => {
    for (const plan of plans) {
      let prev = 0;
      for (const e of plan.events) {
        expect(e.t).toBeGreaterThan(prev);
        prev = e.t;
      }
    }
  });

  it("limits speed change between consecutive segments", () => {
    for (const plan of plans) {
      let prevSpeed: number | null = null;
      let prevT = 0;
      plan.events.forEach((e, i) => {
        const a = plan.points[i]!;
        const b = plan.points[i + 1]!;
        const speed = Math.hypot(b.x - a.x, b.y - a.y) / ((e.t - prevT) / 1000);
        if (prevSpeed !== null) {
          const ratio = speed / prevSpeed;
          expect(ratio).toBeLessThanOrEqual(1 + MAX_SPEED_STEP + 1e-6);
          expect(ratio).toBeGreaterThanOrEqual(1 - MAX_SPEED_STEP - 1e-6);
        }
        prevSpeed = speed;
        prevT = e.t;
      });
    }
  });

  it("keeps the ball out of bricks that are still standing", () => {
    for (const plan of plans) {
      const r = plan.ballRadius;
      const { width, height } = plan.params;
      let violations = 0;
      for (let i = 0; i < plan.events.length; i++) {
        const a = plan.points[i]!;
        const b = plan.points[i + 1]!;
        const prevT = i > 0 ? plan.events[i - 1]!.t : 0;
        // Bricks broken before this segment started are gone; everything else is solid.
        const standing = plan.bricks.filter((br) => plan.breakTimes[br.id]! > prevT);
        for (let s = 0; s <= 12; s++) {
          const f = s / 12;
          const x = a.x + (b.x - a.x) * f;
          const y = a.y + (b.y - a.y) * f;
          if (x < r - 1e-3 || x > width - r + 1e-3 || y < r - 1e-3 || y > height - r + 1e-3) {
            violations++;
          }
          for (const brick of standing) {
            const dx = Math.max(brick.x - x, 0, x - (brick.x + brick.w));
            const dy = Math.max(brick.y - y, 0, y - (brick.y + brick.h));
            if (Math.hypot(dx, dy) < r - 0.05) violations++;
          }
        }
      }
      expect(violations).toBe(0);
    }
  });

  it("keeps the idle start inside the hole", () => {
    for (const plan of plans) {
      const start = getBallPosition(plan, 0);
      expect(start.x).toBeCloseTo(plan.params.width / 2);
      expect(start.y).toBeCloseTo(plan.params.height / 2);
    }
  });

  it("mostly stays within a small deflection of a true bounce", () => {
    let total = 0;
    let within16 = 0;
    let within45 = 0;
    let walls = 0;
    for (const plan of plans) {
      for (const e of plan.events) {
        total++;
        if (e.deflectionDeg <= 16) within16++;
        if (e.deflectionDeg <= 45) within45++;
        if (e.brick < 0) walls++;
      }
    }
    expect(within16 / total).toBeGreaterThan(0.78);
    expect(within45 / total).toBeGreaterThan(0.9);
    expect(walls / total).toBeLessThan(0.12);
  });

  it("paces roughly one brick per two seconds or slower", () => {
    for (const plan of plans) {
      const avg = plan.params.durationMs / 1000 / plan.bricks.length;
      expect(avg).toBeGreaterThanOrEqual(2 - 1e-9);
    }
  });
});

describe("getBallPosition", () => {
  const plan = generatePlan(params(3, 600, STAGES[1]!));

  it("is continuous across bounces", () => {
    for (const e of plan.events.slice(0, 40)) {
      const before = getBallPosition(plan, e.t - 0.01);
      const after = getBallPosition(plan, e.t + 0.01);
      expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(5);
    }
  });

  it("rests at the final contact after the end", () => {
    const end = getBallPosition(plan, plan.params.durationMs + 5000);
    const last = plan.points[plan.points.length - 1]!;
    expect(end).toEqual(last);
  });
});
