import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@taro/database",
    "@taro/tarot-core",
    "@taro/ui",
    "@taro/vision-core",
  ],
};

export default nextConfig;
