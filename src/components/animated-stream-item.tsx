import { type ReactNode, useEffect, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface AnimatedStreamItemProps {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}

const ENTER_DURATION_MS = 240;
const RESIZE_DURATION_MS = 220;
const useSafeLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

export function AnimatedStreamItem({ children, className, delayMs = 0 }: AnimatedStreamItemProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const enteredRef = useRef(false);
  const resizeTimeoutRef = useRef<number | null>(null);

  useSafeLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;

    if (!outer || !inner) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      enteredRef.current = true;
      outer.style.height = "auto";
      outer.style.opacity = "1";
      outer.style.transform = "none";
      return;
    }

    let enterTimeout: number | null = null;
    let firstFrame: number | null = null;
    let secondFrame: number | null = null;

    const finishEnter = () => {
      enteredRef.current = true;
      outer.style.height = "auto";
      outer.style.transitionDelay = "0ms";
    };

    outer.style.height = "0px";
    outer.style.opacity = "0";
    outer.style.transform = "translateY(12px) scale(0.985)";
    outer.style.transitionDelay = `${delayMs}ms`;

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        outer.style.height = `${inner.getBoundingClientRect().height}px`;
        outer.style.opacity = "1";
        outer.style.transform = "translateY(0) scale(1)";
      });
    });

    enterTimeout = window.setTimeout(finishEnter, ENTER_DURATION_MS + delayMs + 32);

    const resizeObserver = new ResizeObserver(() => {
      if (!enteredRef.current) {
        return;
      }

      const currentHeight = outer.getBoundingClientRect().height;
      const nextHeight = inner.getBoundingClientRect().height;

      if (Math.abs(currentHeight - nextHeight) < 1) {
        return;
      }

      if (resizeTimeoutRef.current !== null) {
        window.clearTimeout(resizeTimeoutRef.current);
      }

      outer.style.height = `${currentHeight}px`;

      window.requestAnimationFrame(() => {
        outer.style.height = `${nextHeight}px`;
      });

      resizeTimeoutRef.current = window.setTimeout(() => {
        outer.style.height = "auto";
        resizeTimeoutRef.current = null;
      }, RESIZE_DURATION_MS + 24);
    });

    resizeObserver.observe(inner);

    return () => {
      resizeObserver.disconnect();

      if (firstFrame !== null) {
        window.cancelAnimationFrame(firstFrame);
      }

      if (secondFrame !== null) {
        window.cancelAnimationFrame(secondFrame);
      }

      if (enterTimeout !== null) {
        window.clearTimeout(enterTimeout);
      }

      if (resizeTimeoutRef.current !== null) {
        window.clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [delayMs]);

  return (
    <div ref={outerRef} className={cn("stream-item-animate overflow-hidden", className)}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
