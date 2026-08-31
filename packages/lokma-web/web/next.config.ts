import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Allow importing workspace package lokma-shared
  transpilePackages: ['lokma-shared'],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  // For Phase 0 we proxy /api to the Fastify server
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:3456/api/:path*',
      },
    ];
  },
  // Keep standalone off for Phase 0 (simpler)
};

export default nextConfig;
