import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          green: "#34d399",
          red: "#f87171",
          yellow: "#fbbf24",
          dark: "#04080f",
          card: "rgba(15, 23, 42, 0.6)",
          border: "rgba(255, 255, 255, 0.08)",
          cyan: "#06b6d4",
          blue: "#3b82f6",
        },
      },
      boxShadow: {
        "glow-sm": "0 0 15px -3px rgba(6, 182, 212, 0.15)",
        "glow-md": "0 0 30px -5px rgba(6, 182, 212, 0.2)",
        "glow-lg": "0 0 50px -10px rgba(6, 182, 212, 0.25)",
        glass: "0 8px 32px rgba(0, 0, 0, 0.3)",
      },
      backgroundImage: {
        "gradient-body": "linear-gradient(135deg, #04080f 0%, #0a1628 50%, #0c1a30 100%)",
        "gradient-accent": "linear-gradient(135deg, #06b6d4, #3b82f6)",
        "gradient-text": "linear-gradient(to right, #06b6d4, #3b82f6)",
      },
    },
  },
  plugins: [],
};

export default config;
