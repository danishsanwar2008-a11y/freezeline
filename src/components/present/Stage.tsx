"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";

/** Every scene is laid out on one 1920 x 1080 canvas, scaled to whatever screen the deck is on. */
export const STAGE = { width: 1920, height: 1080 } as const;

const fit = () => Math.min(window.innerWidth / STAGE.width, window.innerHeight / STAGE.height);

export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(0);
  useLayoutEffect(() => {
    const update = () => setScale(fit());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-0 flex items-center justify-center overflow-hidden">
      <div
        className="relative shrink-0 overflow-hidden"
        style={{ width: STAGE.width, height: STAGE.height, transform: `scale(${scale})`, visibility: scale ? "visible" : "hidden" }}
      >
        {children}
      </div>
    </div>
  );
}
