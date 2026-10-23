// Adapted from React Bits CountUp (https://reactbits.dev, MIT + Commons Clause).
// Changes: fixed-duration ease-out instead of a spring (the spring settles slowly and visibly stops short of the
// target), pt-BR number format, final value always exposed to assistive tech, no animation with reduced motion.
import { VisuallyHidden } from "@mantine/core";
import { animate, useInView } from "motion/react";
import { useEffect, useRef } from "react";
import { useReducedMotion } from "./useReducedMotion";

interface CountUpProps {
  to: number;
  /** Seconds. Short on purpose: KPIs are read every day. */
  duration?: number;
  className?: string;
}

const formatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

export default function CountUp({ to, duration = 0.9, className }: CountUpProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const current = useRef(0);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (reduced || !isInView) return;
    const controls = animate(current.current, to, {
      duration,
      ease: [0.2, 0, 0, 1],
      onUpdate: (latest) => {
        current.current = latest;
        if (ref.current) ref.current.textContent = formatter.format(Math.round(latest));
      },
    });
    return () => controls.stop();
  }, [reduced, isInView, to, duration]);

  const final = formatter.format(to);

  return (
    <span className={className}>
      <VisuallyHidden>{final}</VisuallyHidden>
      <span aria-hidden ref={ref} key={reduced ? "static" : "animated"}>
        {reduced ? final : formatter.format(0)}
      </span>
    </span>
  );
}
