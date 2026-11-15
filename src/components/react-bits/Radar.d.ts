// Types for the vendored React Bits component (Radar.jsx, kept exactly as published).
// Every prop is optional and has a default in the component.
import type { CSSProperties, JSX } from "react";

export interface RadarProps {
  color?: string;
  backgroundColor?: string;
  mode?: "sweep" | "pulse";
  speed?: number;
  trail?: number;
  scale?: number;
  ringCount?: number;
  spokeCount?: number;
  ticks?: boolean;
  targets?: number;
  clutter?: number;
  glow?: number;
  brightness?: number;
  gridOpacity?: number;
  lineWidth?: number;
  tilt?: number;
  centerX?: number;
  centerY?: number;
  mouseInteraction?: boolean;
  intro?: boolean;
  grain?: number;
  fade?: number;
  opacity?: number;
  lightMode?: boolean;
  paused?: boolean;
  dpr?: number;
  className?: string;
  style?: CSSProperties;
}

declare function Radar(props: RadarProps): JSX.Element;
export default Radar;
