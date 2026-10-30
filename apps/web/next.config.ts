import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  // Monorepo: trace files from the repo root so standalone output includes packages/shared.
  outputFileTracingRoot: path.join(__dirname, "../.."),
  transpilePackages: ["@kup/shared"],
  reactStrictMode: true,
  poweredByHeader: false,
};

export default nextConfig;
