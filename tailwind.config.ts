import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          green: "#00d26a",
          red: "#ff4d4f",
          yellow: "#faad14",
          dark: "#0a0e17",
          card: "#111827",
          border: "#1f2937",
        },
      },
    },
  },
  plugins: [],
};

export default config;
