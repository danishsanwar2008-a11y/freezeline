"use client";

import dynamic from "next/dynamic";

// The storm map uses WebGL (browser only).
const StormViewLazy = dynamic(() => import("./StormView"), {
  ssr: false,
  loading: () => <div className="h-96 animate-pulse rounded-panel bg-surface" />,
});
export default StormViewLazy;
