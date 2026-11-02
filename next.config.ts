import type { NextConfig } from "next";

// Set NEXT_DISABLE_FS_CACHE=1 on machines where a file-locking driver blocks
// Turbopack's on-disk cache ("failed to rename file ... os error 32").
const fsCache = process.env.NEXT_DISABLE_FS_CACHE !== "1";

const nextConfig: NextConfig = {
  cacheComponents: true,
  experimental: {
    turbopackFileSystemCacheForDev: fsCache,
    turbopackFileSystemCacheForBuild: fsCache,
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
