import type { CSSProperties } from "react";

type Props = {
  /** Top-left logo. */
  srcTopLeft: string;
  /** Bottom-right logo. */
  srcBottomRight: string;
  /** Stage inner size in px. */
  width: number;
  height: number;
  className: string;
  style?: CSSProperties;
};

/**
 * Two logos in opposite stage corners, behind the game. They show through as bricks
 * break away, so they're revealed over the course of the timer.
 */
export function BrickBackdrop({
  srcTopLeft,
  srcBottomRight,
  width,
  height,
  className,
  style,
}: Props) {
  const padY = height * 0.12;
  const padX = Math.max(padY, width * 0.06);
  const size: CSSProperties = { maxWidth: width * 0.22, maxHeight: height * 0.24 };
  return (
    <div className={className} style={{ width, height, ...style }} aria-hidden="true">
      <img
        className="brick-backdrop-logo"
        src={srcTopLeft}
        alt=""
        style={{ ...size, top: padY, left: padX }}
      />
      <img
        className="brick-backdrop-logo"
        src={srcBottomRight}
        alt=""
        style={{ ...size, bottom: padY, right: padX }}
      />
    </div>
  );
}
