"use client";

import { motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { sceneMove } from "./motion";

/** Fades a piece of a scene in on its beat (rising slightly) and out again. */
export function Show({
  when,
  children,
  className,
  style,
  delay = 0,
  rise = 20,
}: {
  when: boolean;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  delay?: number;
  rise?: number;
}) {
  return (
    <motion.div
      className={className}
      style={{ ...style, pointerEvents: "none" }}
      initial={false}
      animate={when ? { opacity: 1, y: 0 } : { opacity: 0, y: rise }}
      transition={{ ...sceneMove, delay: when ? delay : 0 }}
      aria-hidden={!when}
    >
      {children}
    </motion.div>
  );
}

/** "Simulated" marker: every simulated number on a slide carries one. */
export function Simulated({ children = "Simulated" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-present-amber/50 px-3 py-0.5 text-[18px] font-medium text-present-amber">
      {children}
    </span>
  );
}
