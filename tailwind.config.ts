import type { Config } from "tailwindcss";

/**
 * Every colour resolves through a CSS variable holding space-separated RGB
 * channels, so swapping the palette in globals.css re-colours the whole app
 * without touching a single component.
 *
 * Channels rather than hex are what make Tailwind's alpha modifiers work:
 * `bg-signal-red/5` compiles to `rgb(var(--signal-red) / 0.05)`. A hex value
 * in a variable would break every one of the ~50 `/NN` usages in the app.
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

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
          DEFAULT: token("parchment"),
          deep: token("parchment-deep"),
          warm: token("parchment-warm"),
        },
        ink: {
          DEFAULT: token("ink"),
          soft: token("ink-soft"),
          mute: token("ink-mute"),
          fade: token("ink-fade"),
        },
        // Nested so the `rule-soft` spelling resolves. It previously did not:
        // `rule` and `ruleSoft` were flat string keys, so `border-rule-soft`,
        // `bg-rule-soft` and `divide-rule-soft` compiled to nothing at all
        // (34 usages across the app silently rendered no colour). `ruleSoft`
        // is kept as an alias so existing `border-ruleSoft` usages still work.
        rule: {
          DEFAULT: token("rule"),
          soft: token("rule-soft"),
        },
        ruleSoft: token("rule-soft"),
        signal: {
          red: token("signal-red"),
          redDeep: token("signal-red-deep"),
          green: token("signal-green"),
          greenLight: token("signal-green-light"),
        },
        // Structural chrome that must stay recessed against the page — the
        // admin sub-nav and the chat panel headers. Plain `ink` is the
        // maximum-contrast mark and flips to near-white in dark mode, which
        // is right for buttons and selected chips but would turn these bands
        // into glaring white slabs.
        band: token("band"),
        // Text sitting on a signal colour. Signal red and green do not invert
        // between themes, so their label must not either.
        onInverse: token("on-inverse"),
        // Modal scrim. Always dark: an inverted `ink` scrim would go white.
        scrim: token("scrim"),
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        mono: ["var(--font-jetbrains-mono)", "ui-monospace", "monospace"],
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
