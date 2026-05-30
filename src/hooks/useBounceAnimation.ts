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

function randomSpawnPosition(
  boxW: number,
  boxH: number,
  logoW: number,
  logoH: number
): { x: number; y: number } {
  const maxX = Math.max(0, boxW - logoW);
  const maxY = Math.max(0, boxH - logoH);
  return {
    x: maxX > 0 ? Math.random() * maxX : 0,
    y: maxY > 0 ? Math.random() * maxY : 0,
  };
}

function randomVelocity(speed: { vx: number; vy: number }): { vx: number; vy: number } {
  const angle = Math.random() * Math.PI * 2;
  const speedMag = Math.hypot(speed.vx, speed.vy);
  return {
    vx: Math.cos(angle) * speedMag,
    vy: Math.sin(angle) * speedMag,
  };
}

function createBounceBody(
  boxW: number,
  boxH: number,
  logoW: number,
  logoH: number,
  speed: { vx: number; vy: number }
): BounceBody {
  const { x, y } = randomSpawnPosition(boxW, boxH, logoW, logoH);
  const { vx, vy } = randomVelocity(speed);
  return {
    x,
    y,
    vx,
    vy,
    w: logoW,
    h: logoH,
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

    const logoSizeFor = (
      logo: HTMLImageElement | undefined,
      boxW: number,
      boxH: number,
      imageScalePercent: number
    ) => {
      if (logo?.naturalWidth && logo.complete) {
        return getLogoSize(
          logo.naturalWidth,
          logo.naturalHeight,
          boxW,
          boxH,
          imageScalePercent
        );
      }
      return { width: 80, height: 80 };
    };

    const syncBodies = (
      count: number,
      boxW: number,
      boxH: number,
      logos: HTMLImageElement[],
      live: DisplayConfig
    ) => {
      const speed = getBounceVelocity(live.bounceSpeedPercent);
      const bodies = bodiesRef.current;
      while (bodies.length < count) {
        const i = bodies.length;
        const size = logoSizeFor(logos[i], boxW, boxH, live.imageScalePercent);
        bodies.push(createBounceBody(boxW, boxH, size.width, size.height, speed));
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

      syncBodies(count, boxW, boxH, logos, live);
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
