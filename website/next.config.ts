import path from "node:path";
import type { NextConfig } from "next";

// The repo root holds the Expo app and its own lockfile. Pin the root here so
// Next never treats the app as part of this project.
const root = path.resolve(__dirname);

const nextConfig: NextConfig = {
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default nextConfig;
