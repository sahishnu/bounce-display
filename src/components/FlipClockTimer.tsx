import { useEffect, useRef, useState, type CSSProperties } from "react";
import { formatTime, getTimerDigitSlots, type TimerDigitSlot } from "../lib/config";
import "../styles/flip-clock.css";

type Props = {
  ms: number;
  /** Keep HH:MM:SS layout when the configured duration is 1h+. */
  reserveHours?: boolean;
  className?: string;
  style?: CSSProperties;
  "aria-live"?: "off" | "polite" | "assertive";
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

function FlipDigit({
  digit,
  animate,
  reducedMotion,
}: {
  digit: string;
  animate: boolean;
  reducedMotion: boolean;
}) {
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const [incoming, setIncoming] = useState(digit);
  const [slide, setSlide] = useState(false);
  const prevDigit = useRef(digit);

  useEffect(() => {
    if (digit === prevDigit.current) return;
    if (reducedMotion || !animate) {
      prevDigit.current = digit;
      setOutgoing(null);
      setIncoming(digit);
      setSlide(false);
      return;
    }

    setOutgoing(prevDigit.current);
    setIncoming(digit);
    setSlide(false);
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setSlide(true));
    });
    prevDigit.current = digit;
    return () => cancelAnimationFrame(frame);
  }, [digit, animate, reducedMotion]);

  const onTransitionEnd = () => {
    if (!slide) return;
    setOutgoing(null);
    setIncoming(digit);
    setSlide(false);
  };

  const showFlip = outgoing != null && !reducedMotion && animate;
  const trackClass = showFlip
    ? slide
      ? " flip-digit-track--enter"
      : " flip-digit-track--prep"
    : "";

  return (
    <span className="flip-digit" aria-hidden>
      <span className={`flip-digit-track${trackClass}`} onTransitionEnd={onTransitionEnd}>
        {showFlip ? (
          <>
            <span className="flip-digit-cell">{incoming}</span>
            <span className="flip-digit-cell">{outgoing}</span>
          </>
        ) : (
          <span className="flip-digit-cell">{incoming}</span>
        )}
      </span>
    </span>
  );
}

function TimerSeparator({ char }: { char: string }) {
  return (
    <span className="flip-sep" aria-hidden>
      {char}
    </span>
  );
}

function TimerSlot({ slot, reducedMotion }: { slot: TimerDigitSlot; reducedMotion: boolean }) {
  if (slot.kind === "separator") {
    return <TimerSeparator char={slot.char} />;
  }
  return <FlipDigit digit={slot.char} animate reducedMotion={reducedMotion} />;
}

export function FlipClockTimer({
  ms,
  reserveHours = false,
  className,
  style,
  "aria-live": ariaLive = "polite",
}: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const slots = getTimerDigitSlots(ms, reserveHours);
  const label = formatTime(ms, reserveHours);

  return (
    <p
      className={className ? `flip-clock ${className}` : "flip-clock"}
      style={style}
      aria-live={ariaLive}
      aria-label={label}
    >
      <span className="flip-clock-face" aria-hidden>
        {slots.map((slot) => (
          <TimerSlot key={slot.id} slot={slot} reducedMotion={reducedMotion} />
        ))}
      </span>
    </p>
  );
}
