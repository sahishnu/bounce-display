import { useEffect, useRef, type RefObject } from "react";
import {
  bounceTransform,
  chromaticFilter,
  randomNoiseFactor,
  stepBounce,
  type BounceBody,
} from "../lib/bouncePhysics";
import {
  getBounceVelocity,
  getLogoSize,
  loadConfig,
  type DisplayConfig,
} from "../lib/config";

type Options = {
  stageRef: RefObject<HTMLDivElement | null>;
  config: DisplayConfig;
};

function createBounceBody(index: number, speed: { vx: number; vy: number }): BounceBody {
  const cols = 3;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const angle = Math.random() * Math.PI * 2;
  const speedMag = Math.hypot(speed.vx, speed.vy);
  return {
    x: 20 + col * 44,
    y: 20 + row * 44,
    vx: Math.cos(angle) * speedMag,
    vy: Math.sin(angle) * speedMag,
    w: 80,
    h: 80,
    scaleX: 1,
    scaleY: 1,
    chromaticPx: 0,
    noiseFactor: randomNoiseFactor(),
  };
}

export function useBounceAnimation({ stageRef, config }: Options): void {
  const animRef = useRef(0);
  const bodiesRef = useRef<BounceBody[]>([]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    cancelAnimationFrame(animRef.current);
    bodiesRef.current = [];

    let lastTime = performance.now();
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncBodies = (count: number) => {
      const speed = getBounceVelocity(loadConfig().bounceSpeedPercent);
      const bodies = bodiesRef.current;
      while (bodies.length < count) {
        bodies.push(createBounceBody(bodies.length, speed));
      }
      bodies.length = count;
    };

    const loop = (now: number) => {
      const rawDt = (now - lastTime) / (1000 / 60);
      lastTime = now;
      const dt = Math.min(3, Math.max(0.25, rawDt));

      const boxW = stage.clientWidth;
      const boxH = stage.clientHeight;
      const live = loadConfig();
      const speed = getBounceVelocity(live.bounceSpeedPercent);
      const logos = Array.from(stage.querySelectorAll<HTMLImageElement>(".bounce-logo"));
      const count = Math.min(live.logoCount, logos.length);

      syncBodies(count);
      const bodies = bodiesRef.current;
      const chromaticClass = "bounce-logo--chromatic";

      for (let i = 0; i < count; i++) {
        const logo = logos[i]!;
        let body = bodies[i]!;

        const targetMag = Math.hypot(speed.vx, speed.vy);
        const currentMag = Math.hypot(body.vx, body.vy);
        if (currentMag > 0) {
          body.vx = (body.vx / currentMag) * targetMag;
          body.vy = (body.vy / currentMag) * targetMag;
        } else {
          const angle = Math.random() * Math.PI * 2;
          body.vx = Math.cos(angle) * targetMag;
          body.vy = Math.sin(angle) * targetMag;
        }

        if (logo.naturalWidth && logo.complete) {
          const size = getLogoSize(
            logo.naturalWidth,
            logo.naturalHeight,
            boxW,
            boxH,
            live.imageScalePercent
          );
          body.w = size.width;
          body.h = size.height;
        }

        body = stepBounce(body, {
          boxW,
          boxH,
          dt,
          chromaticEnabled: live.chromaticAberration,
          reducedMotion: motionQuery.matches,
          timeMs: now,
        });
        bodies[i] = body;

        logo.style.width = `${body.w}px`;
        logo.style.height = `${body.h}px`;
        logo.style.transform = bounceTransform(body);
        logo.style.filter = live.chromaticAberration ? chromaticFilter(body.chromaticPx) : "";
        logo.classList.toggle(chromaticClass, live.chromaticAberration);
      }

      animRef.current = requestAnimationFrame(loop);
    };

    const start = () => {
      lastTime = performance.now();
      cancelAnimationFrame(animRef.current);
      animRef.current = requestAnimationFrame(loop);
    };

    start();

    return () => cancelAnimationFrame(animRef.current);
  }, [
    stageRef,
    config.boxWidth,
    config.boxHeight,
    config.imageScalePercent,
    config.bounceSpeedPercent,
    config.imageDataUrl,
    config.chromaticAberration,
    config.logoCount,
  ]);
}
