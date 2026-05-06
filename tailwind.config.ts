import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        parchment: {
          DEFAULT: "#F5F1E8",
          deep: "#EDE6D6",
          warm: "#FAF6EC",
        },
        ink: {
          DEFAULT: "#1A1815",
          soft: "#3D3A35",
          mute: "#6B665E",
          fade: "#A8A39A",
        },
        rule: "#C9C0AB",
        ruleSoft: "#DDD6C2",
        signal: {
          red: "#C8341A",
          redDeep: "#9E2614",
          green: "#2E7D3F",
          greenLight: "#4A9D5C",
        },
      },
      fontFamily: {
        display: ['"Fraunces"', "Georgia", "serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      letterSpacing: {
        wider: "0.08em",
        widest: "0.18em",
      },
    },
  },
  plugins: [],
};

export default config;
