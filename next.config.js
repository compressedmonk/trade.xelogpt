/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "gmgn.ai" },
      { protocol: "https", hostname: "**.gmgn.ai" },
    ],
  },
};

module.exports = nextConfig;
