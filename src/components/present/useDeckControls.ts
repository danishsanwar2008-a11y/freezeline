"use client";

import { useEffect } from "react";

export type DeckCommands = { next: () => void; previous: () => void; first: () => void; last: () => void };

// Presentation clickers send arrow and page keys, so every common forward and back key works.
const KEYS: Record<string, keyof DeckCommands | "fullscreen"> = {
  ArrowRight: "next",
  ArrowDown: "next",
  PageDown: "next",
  " ": "next",
  Enter: "next",
  ArrowLeft: "previous",
  ArrowUp: "previous",
  PageUp: "previous",
  Home: "first",
  End: "last",
  f: "fullscreen",
  F: "fullscreen",
};

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.();
}

export function useDeckControls(commands: DeckCommands) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const command = KEYS[e.key];
      if (!command) return;
      e.preventDefault();
      if (command === "fullscreen") toggleFullscreen();
      else commands[command]();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commands]);
}
