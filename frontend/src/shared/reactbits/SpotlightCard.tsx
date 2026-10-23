// Adapted from React Bits SpotlightCard (https://reactbits.dev, MIT + Commons Clause).
// Changes: renders as any element, forwards HTML props, light-theme styling in SpotlightCard.css.
import type { ElementType, HTMLAttributes, MouseEvent, ReactNode } from "react";
import { useRef } from "react";
import "./SpotlightCard.css";

interface SpotlightCardProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  children: ReactNode;
  spotlightColor?: string;
}

export default function SpotlightCard({
  as: Tag = "div",
  children,
  className = "",
  spotlightColor,
  onMouseMove,
  ...rest
}: SpotlightCardProps) {
  const ref = useRef<HTMLElement>(null);

  const handleMouseMove = (event: MouseEvent<HTMLElement>) => {
    const element = ref.current;
    if (element) {
      const rect = element.getBoundingClientRect();
      element.style.setProperty("--mouse-x", `${event.clientX - rect.left}px`);
      element.style.setProperty("--mouse-y", `${event.clientY - rect.top}px`);
      if (spotlightColor) element.style.setProperty("--spotlight-color", spotlightColor);
    }
    onMouseMove?.(event);
  };

  return (
    <Tag ref={ref} onMouseMove={handleMouseMove} className={`card-spotlight ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
