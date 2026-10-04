// Derived from the AnimatedItem entrance in React Bits AnimatedList (https://reactbits.dev, MIT + Commons Clause).
// The full AnimatedList is not used: it lists strings and hijacks Tab/arrow keys on the whole window.
import { Table } from "@mantine/core";
import { motion } from "motion/react";
import type { ComponentProps } from "react";
import { useReducedMotion } from "./useReducedMotion";

const MotionTr = motion.create(Table.Tr);

interface AnimatedRowProps extends ComponentProps<typeof Table.Tr> {
  index: number;
  /** When false the row renders plain, so paging and tab changes do not replay the entrance. */
  animate: boolean;
  /** Called once this row's entrance finished (only fires for rows that actually animated). */
  onEntered?: () => void;
}

const MAX_STAGGERED_ROWS = 8;

export default function AnimatedRow({ index, animate, onEntered, children, ...rest }: AnimatedRowProps) {
  const reduced = useReducedMotion();
  if (reduced || !animate) return <Table.Tr {...rest}>{children}</Table.Tr>;

  return (
    <MotionTr
      {...(rest as object)}
      initial={{ opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      onAnimationComplete={() => onEntered?.()}
      transition={{ duration: 0.24, delay: Math.min(index, MAX_STAGGERED_ROWS) * 0.03, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </MotionTr>
  );
}
