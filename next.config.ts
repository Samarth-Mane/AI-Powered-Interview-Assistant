import type { NextConfig } from "next";

const nextConfig: NextConfig & {
  eslint: { ignoreDuringBuilds: boolean };
  typescript: { ignoreBuildErrors: boolean };
} = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
