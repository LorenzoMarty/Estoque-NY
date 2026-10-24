import { createBrowserRouter, Navigate, type RouteObject } from "react-router";
import { PlaceholderPage } from "../features/placeholder/PlaceholderPage";
import { AppShell } from "./shell/AppShell";
import { RequireAuth } from "./shell/RequireAuth";
import { ROUTES } from "./routes";

// Each screen is its own chunk, loaded on first visit (keeps the initial JS small, see
// scripts/check-bundle-budget.mjs). Screens are named exports, hence the Component pick.
const SCREENS: Partial<Record<string, NonNullable<RouteObject["lazy"]>>> = {
  dashboard: async () => ({ Component: (await import("../features/dashboard/DashboardPage")).DashboardPage }),
  movimentacoes: async () => ({ Component: (await import("../features/movements/MovementsPage")).MovementsPage }),
  produtos: async () => ({ Component: (await import("../features/products/ProductsPage")).ProductsPage }),
  variacoes: async () => ({ Component: (await import("../features/variations/VariationsPage")).VariationsPage }),
  transferencias: async () => ({ Component: (await import("../features/transfers/TransfersPage")).TransfersPage }),
  contagem: async () => ({ Component: (await import("../features/inventory-counts/InventoryCountsPage")).InventoryCountsPage }),
  relatorios: async () => ({ Component: (await import("../features/reports/ReportsPage")).ReportsPage }),
  cadastros: async () => ({ Component: (await import("../features/cadastros/CadastrosPage")).CadastrosPage }),
  auditoria: async () => ({ Component: (await import("../features/audit/AuditPage")).AuditPage }),
  usuarios: async () => ({ Component: (await import("../features/users/UsersPage")).UsersPage }),
};

const domainRoutes: RouteObject[] = ROUTES.filter((route) => route.id !== "login").map((route) => {
  const lazy = SCREENS[route.id];
  return lazy
    ? { path: `/${route.id}`, lazy }
    : { path: `/${route.id}`, element: <PlaceholderPage navKey={route.navKey} /> };
});

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/dashboard" replace /> },
  { path: "/login", HydrateFallback: () => null, lazy: async () => ({ Component: (await import("../features/auth/LoginPage")).LoginPage }) },
  {
    HydrateFallback: () => null,
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: domainRoutes,
      },
    ],
  },
]);
