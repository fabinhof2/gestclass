import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    cpus: 1,
    staticGenerationMaxConcurrency: 1,
    workerThreads: false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
