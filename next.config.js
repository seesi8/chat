/** @type {import('next').NextConfig} */
module.exports = {
  images: {
    domains: ['firebasestorage.googleapis.com'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    // If you previously overwrote it, restore + include TS
    config.resolve.extensions = Array.from(
      new Set([...(config.resolve.extensions ?? []), ".ts", ".tsx"])
    );
    return config;
  },
}
