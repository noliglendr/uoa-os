import type { NextConfig } from "next";

// Set NEXT_DISABLE_FS_CACHE=1 on machines where a file-locking driver blocks
// Turbopack's on-disk cache ("failed to rename file ... os error 32").
const fsCache = process.env.NEXT_DISABLE_FS_CACHE !== "1";

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    turbopackFileSystemCacheForDev: fsCache,
    turbopackFileSystemCacheForBuild: fsCache,
    // Keep visited pages for 30 s in the browser, and menu pages (fully
    // prefetched in the background) for 30 s too, so moving between menu items
    // is instant even on a slow connection. Every save (server action)
    // refreshes the page right away.
    staleTimes: { dynamic: 30, static: 30 },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
