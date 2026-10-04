import { Badge, Card, createTheme, Table, type CSSVariablesResolver, type MantineColorsTuple } from "@mantine/core";

// "Azul profundo": the single source of the brand palette. Mantine ramps below and the --rd-* CSS variables
// (cssVariablesResolver) are both derived from it; app.css's legacy --zinc-*/--orange-* variables are remapped to
// --rd-* in redesign.css.
export const palette = {
  primary: "#093B95",
  primaryHover: "#072F78",
  tint: "#e7eefb",
  tintStrong: "#cfdcf5",
  page: "#f4f8ff",
  surface: "#ffffff",
  surfaceAlt: "#f9fbff",
  line: "#dbe6f7",
  lineSoft: "#e8eef9",
  ink: "#0b1b33",
  ink2: "#4a5d7a",
  muted: "#5a6b86",
  // #093B95 is too dark to tell series apart (validator lightness band 0.43-0.77); same family, lighter.
  chartBlue: "#1d57c7",
  chartOrange: "#eb6834",
} as const;

const zinc: MantineColorsTuple = [
  palette.surface, // 0
  palette.surfaceAlt, // 1
  palette.page, // 2
  palette.tint, // 3
  palette.line, // 4
  "#c5d3ea", // 5
  palette.muted, // 6
  palette.ink2, // 7
  "#2b3d5a", // 8
  palette.ink, // 9
];

const brand: MantineColorsTuple = [
  palette.tint, // 0
  palette.tintStrong, // 1
  "#a6bdea", // 2
  "#7b9bdd", // 3
  "#4f78cc", // 4
  "#2a58b5", // 5
  palette.primary, // 6 — primary shade
  palette.primaryHover, // 7
  "#06255f", // 8
  "#041b46", // 9
];

// Semantic status colors shared by StatusPill, KPI trends and stock bars.
export const statusTones = {
  good: "teal",
  warning: "yellow",
  critical: "red",
  info: "brand",
  neutral: "gray",
} as const;

export type StatusTone = keyof typeof statusTones;

// Reserved status palette (validated against the light surface). Exposed to CSS as --status-* variables.
export const statusPalette = {
  good: "#0ca30c",
  goodText: "#006300",
  goodPillText: "#0b5f2e",
  warning: "#fab219",
  warningPillText: "#7a4b00",
  critical: "#d03b3b",
} as const;

export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {
    "--rd-primary": palette.primary,
    "--rd-primary-hover": palette.primaryHover,
    "--rd-tint": palette.tint,
    "--rd-tint-strong": palette.tintStrong,
    "--rd-page": palette.page,
    "--rd-surface": palette.surface,
    "--rd-surface-alt": palette.surfaceAlt,
    "--rd-line": palette.line,
    "--rd-line-soft": palette.lineSoft,
    "--rd-ink": palette.ink,
    "--rd-ink-2": palette.ink2,
    "--rd-muted": palette.muted,
    "--rd-shadow": "0 1px 3px rgba(11, 27, 51, 0.06), 0 4px 12px rgba(11, 27, 51, 0.05)",
    "--status-good": statusPalette.good,
    "--status-good-text": statusPalette.goodText,
    "--status-good-pill-text": statusPalette.goodPillText,
    "--status-warning": statusPalette.warning,
    "--status-warning-pill-text": statusPalette.warningPillText,
    "--status-critical": statusPalette.critical,
  },
  light: {},
  dark: {},
});

export const theme = createTheme({
  primaryColor: "brand",
  primaryShade: 6,
  black: palette.ink,
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
  headings: { fontWeight: "700" },
  shadows: {
    xs: "0 1px 2px rgba(15, 31, 54, 0.05)",
    sm: "0 1px 3px rgba(15, 31, 54, 0.06), 0 4px 12px rgba(15, 31, 54, 0.04)",
    md: "0 8px 24px rgba(15, 31, 54, 0.08)",
  },
  components: {
    Badge: Badge.extend({ defaultProps: { variant: "light", radius: "xl" } }),
    Card: Card.extend({ defaultProps: { withBorder: true, radius: "lg", shadow: "xs" } }),
    Table: Table.extend({ defaultProps: { verticalSpacing: "sm", highlightOnHover: true } }),
  },
});
