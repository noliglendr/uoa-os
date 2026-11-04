import type { NextConfig } from "next";

// Set NEXT_DISABLE_FS_CACHE=1 on machines where a file-locking driver blocks
// Turbopack's on-disk cache ("failed to rename file ... os error 32").
const fsCache = process.env.NEXT_DISABLE_FS_CACHE !== "1";

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    turbopackFileSystemCacheForDev: fsCache,
    turbopackFileSystemCacheForBuild: fsCache,
    // Keep visited pages for 30 s in the browser, so moving between menu items
    // is instant. Every save (server action) refreshes the page right away.
    staleTimes: { dynamic: 30 },
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
