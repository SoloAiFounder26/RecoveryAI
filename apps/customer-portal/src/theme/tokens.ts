import { Platform } from "react-native";

// Mirrors tailwind.config.js. Use these only where a className can't reach
// (Reanimated styles, SVG fills, gradients, bottom-sheet props).
export const colors = {
  obsidian: "#08080A",
  abyss: "#0E0E12",
  surface: "#15151D",
  raised: "#1C1C27",
  line: "#242432",
  ink: "#F4F4F8",
  mute: "#8A8A9E",
  faint: "#55556A",
  emerald: "#00E599",
  gold: "#FFB800",
  crimson: "#FF3366",
} as const;

export const monoFont = Platform.select({ ios: "Menlo", android: "monospace", default: "ui-monospace, Menlo, Consolas, monospace" });

// 1px metallic hairline used on every card edge.
export const metallicBorder = ["#2E2E40", "#1A1A24", "#2A2A3A"] as const;
