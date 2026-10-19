import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return ['/g/:path*', '/o/:path*', '/customer/:path*', '/unsubscribe/:path*', '/api/growth/:path*', '/api/commerce/:path*', '/api/automations/:path*', '/api/offer-lab/:path*'].map(source => ({
      source,
      headers: [
        { key: 'Cache-Control', value: 'private, no-store' },
        { key: 'Referrer-Policy', value: 'no-referrer' },
      ],
    }));
  },
};

export default nextConfig;
