/**
 * PROTOTYPE (throwaway): logo-as-ball and multi-ball variants of the brick breaker.
 * Visit /proto. Not wired into the real display or admin.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLogo } from "../lib/brickBreaker/logoSprite";
import { loadConfig, resolveLogoSrc } from "../lib/config";
import { drawBricks } from "../lib/brickBreaker/render";
import {
  bodyPosition,
  generateProtoPlan,
  type ProtoParams,
  type ProtoPlan,
} from "../lib/brickBreaker/protoPlan";

const W = 640;
const H = 360;
const LEAD_IN_MS = 1200;
const HOLD_MS = 2500;
const FADE_MS = 500;
const TRAIL_STEPS = 8;
const TRAIL_STEP_MS = 30;

type StageProps = {
  title: string;
  blurb: string;
  params: ProtoParams;
  logo: HTMLCanvasElement | null;
  hues: number[];
};

function ProtoStage({ title, blurb, params, logo, hues }: StageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const plan: ProtoPlan | null = useMemo(() => {
    try {
      setError(null);
      return generateProtoPlan(params);
    } catch (e) {
      setError(String(e));
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)]);

  const live = useRef({ plan, logo });
  live.current = { plan, logo };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const t0 = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const { plan: p, logo: sprite } = live.current;
      raf = requestAnimationFrame(loop);
      if (!p) return;
      const dur = p.base.params.durationMs;
      const cycle = LEAD_IN_MS + dur + HOLD_MS;
      const local = (now - t0) % cycle;
      const elapsed = local - LEAD_IN_MS;
      draw(ctx, p, elapsed, now, sprite, hues);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [hues, nonce]);

  return (
    <section className="proto-card">
      <h2>{title}</h2>
      <p>{blurb}</p>
      <div className="proto-stage" style={{ width: W, height: H }}>
        <canvas ref={canvasRef} style={{ width: W, height: H, display: "block" }} />
      </div>
      <div className="proto-meta">
        {error ? (
          <span className="proto-err">{error}</span>
        ) : plan ? (
          <span>
            {plan.base.bricks.length} bricks · {plan.bodies.length} {plan.round ? "ball" : "logo"}
            {plan.bodies.length > 1 ? "s" : ""} · ~{Math.round(plan.base.speedPxPerSec)} px/s each
          </span>
        ) : null}
        <button onClick={() => setNonce((n) => n + 1)}>Restart</button>
      </div>
    </section>
  );
}

function draw(
  ctx: CanvasRenderingContext2D,
  p: ProtoPlan,
  elapsed: number,
  nowMs: number,
  sprite: HTMLCanvasElement | null,
  hues: number[]
) {
  drawBricks(ctx, p.base, elapsed);
  const idle = elapsed <= 0;

  p.bodies.forEach((body, i) => {
    const lastT = body.times[body.times.length - 1] ?? 0;
    // Each body fades out once it has broken its last brick.
    const alpha = elapsed > lastT ? 1 - (elapsed - lastT) / FADE_MS : 1;
    if (alpha <= 0) return;
    const pos = bodyPosition(body, elapsed);
    const bob = idle ? Math.sin(nowMs / 650 + i) * p.hh * 1.1 : 0;
    const x = pos.x;
    const y = pos.y + bob;
    const hue = hues[i % hues.length]!;

    if (!idle && elapsed < lastT) {
      for (let k = TRAIL_STEPS; k >= 1; k--) {
        const t = elapsed - k * TRAIL_STEP_MS;
        if (t <= 0) continue;
        const q = bodyPosition(body, t);
        const f = 1 - k / (TRAIL_STEPS + 1);
        ctx.globalAlpha = (p.round ? 0.32 : 0.12) * f * alpha;
        if (p.round) {
          ctx.fillStyle = `hsl(${hue} 90% 75%)`;
          ctx.beginPath();
          ctx.arc(q.x, q.y, p.hh * (0.45 + 0.5 * f), 0, Math.PI * 2);
          ctx.fill();
        } else if (sprite) {
          ctx.drawImage(sprite, q.x - p.hw, q.y - p.hh, p.hw * 2, p.hh * 2);
        }
      }
    }

    ctx.globalAlpha = alpha;
    if (p.round) {
      const r = p.hh;
      const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3.2);
      glow.addColorStop(0, `hsla(${hue} 90% 75% / 0.45)`);
      glow.addColorStop(1, `hsla(${hue} 90% 75% / 0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();
      const body2 = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
      body2.addColorStop(0, "#ffffff");
      body2.addColorStop(1, `hsl(${hue} 90% 80%)`);
      ctx.fillStyle = body2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (sprite) {
      ctx.shadowColor = "rgba(255,255,255,0.55)";
      ctx.shadowBlur = p.hh * 1.2;
      ctx.drawImage(sprite, x - p.hw, y - p.hh, p.hw * 2, p.hh * 2);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  });
}

export function ProtoPage() {
  const [duration, setDuration] = useState(90);
  const [seed, setSeed] = useState(7);
  const [balls, setBalls] = useState(4);
  const [logoSize, setLogoSize] = useState(100);

  const logoSrc = useMemo(() => resolveLogoSrc(loadConfig()), []);
  const brickH = H * 0.06;
  const logoPx = brickH * (logoSize / 100);
  const sprite = useLogo(logoSrc, logoPx);

  const common = {
    seed,
    durationMs: duration * 1000,
    width: W,
    height: H,
    brickSizePercent: 6,
    holeWidthPercent: 50,
    holeHeightPercent: 40,
  };
  const logoParams: ProtoParams = {
    ...common, ballSizePercent: logoSize, bodyCount: 1, shape: "rect", aspect: sprite?.aspect ?? 2.5,
  };
  const multiParams: ProtoParams = {
    ...common, ballSizePercent: 40, bodyCount: balls, shape: "circle", aspect: 1,
  };
  const hues = useMemo(() => [200, 330, 50, 130, 270, 20], []);

  return (
    <div className="proto-root">
      <style>{css}</style>
      <header>
        <h1>Brick breaker prototypes</h1>
        <label>
          Timer {duration}s
          <input type="range" min={10} max={300} value={duration} onChange={(e) => setDuration(+e.target.value)} />
        </label>
        <label>
          Seed {seed}
          <input type="range" min={1} max={50} value={seed} onChange={(e) => setSeed(+e.target.value)} />
        </label>
        <label>
          Balls {balls}
          <input type="range" min={2} max={6} value={balls} onChange={(e) => setBalls(+e.target.value)} />
        </label>
        <label>
          Logo size {logoSize}%
          <input type="range" min={40} max={140} value={logoSize} onChange={(e) => setLogoSize(+e.target.value)} />
        </label>
      </header>
      <div className="proto-grid">
        <ProtoStage
          title="A. Logo instead of the ball"
          blurb="The logo is a rectangular body: it bounces off brick faces with its real width and height."
          params={logoParams}
          logo={sprite?.canvas ?? null}
          hues={hues}
        />
        <ProtoStage
          title="B. Multiple balls"
          blurb="Balls share the grid and split the bricks between them. Each drops out after its last brick."
          params={multiParams}
          logo={null}
          hues={hues}
        />
      </div>
    </div>
  );
}

const css = `
.proto-root { min-height: 100vh; background: #0b0b10; color: #e8e8ef; font: 14px system-ui, sans-serif; padding: 20px; }
.proto-root header { display: flex; gap: 20px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
.proto-root h1 { font-size: 18px; margin: 0 12px 0 0; }
.proto-root label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; opacity: .85; }
.proto-grid { display: flex; gap: 28px; flex-wrap: wrap; }
.proto-card h2 { font-size: 15px; margin: 0 0 4px; }
.proto-card p { margin: 0 0 10px; max-width: 640px; opacity: .7; font-size: 13px; }
.proto-stage { background: #000; border: 1px solid #333; }
.proto-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 12px; opacity: .8; }
.proto-meta button { background: #2a2a38; color: inherit; border: 1px solid #444; border-radius: 4px; padding: 3px 10px; cursor: pointer; }
.proto-err { color: #ff7a7a; }
`;
