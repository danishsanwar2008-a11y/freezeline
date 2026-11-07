"use client";

import { Agentation } from "agentation";

// Dev-only visual feedback toolbar. Never renders in production builds.
export default function AgentationDev() {
  if (process.env.NODE_ENV !== "development") return null;
  return <Agentation endpoint="http://localhost:4747" appName="FreezeLine" />;
}
