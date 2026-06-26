/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    instrumentationHook: true,
    serverComponentsExternalPackages: ["@solana/web3.js", "bs58", "better-sqlite3"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "gmgn.ai" },
      { protocol: "https", hostname: "**.gmgn.ai" },
    ],
  },
};

module.exports = nextConfig;
