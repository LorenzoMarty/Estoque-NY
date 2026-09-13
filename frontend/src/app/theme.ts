import { createTheme, type MantineColorsTuple } from "@mantine/core";

const zinc: MantineColorsTuple = [
  "#f4f4f5", // 0 — zinc-100
  "#e4e4e7", // 1 — zinc-200
  "#d4d4d8", // 2 — zinc-300
  "#a1a1aa", // 3 — zinc-400
  "#71717a", // 4 — zinc-500
  "#52525b", // 5 — zinc-650
  "#3f3f46", // 6 — zinc-700
  "#27272a", // 7 — zinc-800
  "#1f1f24", // 8 — zinc-850
  "#18181b", // 9 — zinc-900
];

const orange: MantineColorsTuple = [
  "#fff2e8",
  "#fdba74", // 1 — orange-200
  "#fb923c", // 2 — orange-400
  "#f97316", // 3
  "#f97316", // 4
  "#f97316", // 5
  "#f97316", // 6 — orange-500, primary shade
  "#ea580c", // 7 — orange-600
  "#c2410c", // 8 — orange-700
  "#431407", // 9 — orange-950
];

export const theme = createTheme({
  primaryColor: "orange",
  primaryShade: 6,
  fontFamily: "Inter, sans-serif",
  radius: {
    sm: "10px",
    md: "14px",
    lg: "18px",
    xl: "22px",
  },
  colors: {
    dark: [
      "#f4f4f5",
      "#e4e4e7",
      "#d4d4d8",
      "#a1a1aa",
      "#71717a",
      "#52525b",
      "#3f3f46",
      "#18181b", // dark[7] — Mantine's default "surface" shade, matches zinc-900
      "#1f1f24",
      "#09090b", // zinc-950 — app background
    ],
    zinc,
    orange,
  },
});
