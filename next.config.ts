import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Silence workspace root warning caused by parent pnpm-lock in the monorepo-like folder
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
