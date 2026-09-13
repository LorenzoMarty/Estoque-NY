import type { strings } from "../shared/strings";

export type NavSection = "operation" | "cadastros" | "settings";

export interface RouteDef {
  id: string;
  icon: string;
  navKey: keyof typeof strings.nav;
  section: NavSection;
  hidden?: boolean;
}

export const ROUTES: RouteDef[] = [
  { id: "dashboard", icon: "layout-dashboard", navKey: "dashboard", section: "operation" },
  { id: "movimentacoes", icon: "shuffle", navKey: "movements", section: "operation" },
  { id: "produtos", icon: "package", navKey: "products", section: "operation" },
  { id: "variacoes", icon: "barcode", navKey: "variations", section: "operation" },
  { id: "transferencias", icon: "arrow-right-left", navKey: "transfers", section: "operation" },
  { id: "contagem", icon: "clipboard-check", navKey: "inventory_count", section: "operation" },
  { id: "relatorios", icon: "bar-chart-3", navKey: "reports", section: "operation" },
  { id: "auditoria", icon: "shield-check", navKey: "audit", section: "operation" },
  { id: "cadastros", icon: "folder", navKey: "cadastros", section: "cadastros" },
  { id: "usuarios", icon: "users", navKey: "users", section: "settings" },
  { id: "login", icon: "log-in", navKey: "login", section: "settings", hidden: true },
];

export const NAV_SECTIONS_ORDER: NavSection[] = ["operation", "cadastros", "settings"];
