const { platformSelect } = require("nativewind/theme");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      // Keep in sync with src/theme/tokens.ts (used where className can't reach, e.g. Reanimated styles).
      colors: {
        obsidian: "#08080A",
        abyss: "#121217",
        surface: "#16161F",
        raised: "#1C1C27",
        line: "#262636",
        ink: "#F4F4F8",
        mute: "#8A8A9E",
        faint: "#55556A",
        emerald: "#00E599",
        gold: "#FFB800",
        crimson: "#FF3366",
      },
      fontFamily: {
        mono: platformSelect({ ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, Consolas, monospace" }),
      },
      letterSpacing: {
        label: "1.6px",
      },
    },
  },
  plugins: [],
};
