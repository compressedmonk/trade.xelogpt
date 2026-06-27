/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
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
