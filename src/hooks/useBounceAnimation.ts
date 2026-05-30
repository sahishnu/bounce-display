import { useEffect, useRef, type RefObject } from "react";
import {
  bounceTransform,
  chromaticFilter,
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
  logoRef: RefObject<HTMLImageElement | null>;
  config: DisplayConfig;
};

export function useBounceAnimation({ stageRef, logoRef, config }: Options): void {
  const animRef = useRef(0);

  useEffect(() => {
    const stage = stageRef.current;
    const logo = logoRef.current;
    if (!stage || !logo) return;

    cancelAnimationFrame(animRef.current);

    const initial = getBounceVelocity(config.bounceSpeedPercent);
    let body: BounceBody = {
      x: 20,
      y: 20,
      vx: initial.vx,
      vy: initial.vy,
      w: 80,
      h: 80,
      scaleX: 1,
      scaleY: 1,
      chromaticPx: 0,
    };

    let lastTime = performance.now();
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const loop = (now: number) => {
      const rawDt = (now - lastTime) / (1000 / 60);
      lastTime = now;
      const dt = Math.min(3, Math.max(0.25, rawDt));

      const boxW = stage.clientWidth;
      const boxH = stage.clientHeight;
      const live = loadConfig();
      const speed = getBounceVelocity(live.bounceSpeedPercent);
      body.vx = Math.sign(body.vx || 1) * speed.vx;
      body.vy = Math.sign(body.vy || 1) * speed.vy;

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

      logo.style.width = `${body.w}px`;
      logo.style.height = `${body.h}px`;
      logo.style.transform = bounceTransform(body);
      logo.style.filter = live.chromaticAberration ? chromaticFilter(body.chromaticPx) : "";

      animRef.current = requestAnimationFrame(loop);
    };

    const start = () => {
      lastTime = performance.now();
      cancelAnimationFrame(animRef.current);
      animRef.current = requestAnimationFrame(loop);
    };

    logo.onload = start;
    if (logo.complete) start();

    return () => cancelAnimationFrame(animRef.current);
  }, [
    stageRef,
    logoRef,
    config.boxWidth,
    config.boxHeight,
    config.imageScalePercent,
    config.bounceSpeedPercent,
    config.imageDataUrl,
    config.chromaticAberration,
  ]);
}
