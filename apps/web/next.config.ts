import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // Build sirasinda tip hatalarini gizleyen kacamaklar kapali: kirik tip
  // uretime cikamaz (DEVELOPMENT_RULES 10).
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
};

export default config;
