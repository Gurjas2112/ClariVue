import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root (monorepo) so Turbopack picks the correct lockfile.
  turbopack: {
    root: path.join(__dirname, "..", ".."),
  },
};

export default nextConfig;
