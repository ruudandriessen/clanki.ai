import { type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

interface AnimatedStreamItemProps {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}

const ENTER_DURATION_SECONDS = 0.24;

export function AnimatedStreamItem({ children, className, delayMs = 0 }: AnimatedStreamItemProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      layout
      className={cn("overflow-hidden", className)}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      transition={{
        layout: {
          duration: 0.22,
          ease: [0.2, 0.8, 0.2, 1],
        },
        duration: ENTER_DURATION_SECONDS,
        ease: [0.16, 1, 0.3, 1],
        delay: delayMs / 1000,
      }}
    >
      {children}
    </motion.div>
  );
}
