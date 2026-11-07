import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Phase 1A has no console yet; send "/" to the connection test page.
  async redirects() {
    return [{ source: "/", destination: "/status", permanent: false }];
  },
};

export default nextConfig;
