import { createTheme, type MantineColorsTuple } from "@mantine/core";

// frontend/css/app.css defines its palette twice: an original dark zinc/orange
// `:root` block (lines 1-21) and a later "Light Theme (Blue + White)" `:root`
// override (lines 1355-1381) that wins the cascade and is the design actually
// in effect today (confirmed with the user 2026-09-13, since custom properties
// resolve at used-value time and the later declaration overrides the earlier
// one for every consumer in the file). This theme mirrors that light palette.
const zinc: MantineColorsTuple = [
  "#ffffff", // 0 — zinc-900 (surface)
  "#f8fbff", // 1 — zinc-850
  "#f5f9ff", // 2 — zinc-950 (page background)
  "#eef4ff", // 3 — zinc-800
  "#d8e3f3", // 4 — zinc-700
  "#c4d2e8", // 5 — zinc-650
  "#66758f", // 6 — zinc-500
  "#4f617d", // 7 — zinc-400
  "#2d3e59", // 8 — zinc-300
  "#0f1f36", // 9 — zinc-100 (text)
];

const brand: MantineColorsTuple = [
  "#eff6ff", // 0 — orange-950 (pale blue tint under the new palette)
  "#dbeafe", // 1 — orange-200
  "#60a5fa", // 2 — orange-400
  "#3b82f6", // 3 — orange-500 / orange-300
  "#3b82f6", // 4
  "#3b82f6", // 5
  "#3b82f6", // 6 — orange-500, primary shade
  "#2563eb", // 7 — orange-600
  "#1d4ed8", // 8 — orange-700
  "#1e40af", // 9 — indigo-500
];

export const theme = createTheme({
  primaryColor: "brand",
  primaryShade: 6,
  fontFamily: "Inter, sans-serif",
  radius: {
    sm: "10px",
    md: "14px",
    lg: "18px",
    xl: "22px",
  },
  colors: {
    zinc,
    brand,
  },
});
