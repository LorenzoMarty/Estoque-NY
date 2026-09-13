import type { ReactElement } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import { LoginPage } from "../features/auth/LoginPage";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { MovementsPage } from "../features/movements/MovementsPage";
import { PlaceholderPage } from "../features/placeholder/PlaceholderPage";
import { ProductsPage } from "../features/products/ProductsPage";
import { TransfersPage } from "../features/transfers/TransfersPage";
import { VariationsPage } from "../features/variations/VariationsPage";
import { AppShell } from "./shell/AppShell";
import { RequireAuth } from "./shell/RequireAuth";
import { ROUTES } from "./routes";

const SCREEN_ELEMENTS: Partial<Record<string, ReactElement>> = {
  dashboard: <DashboardPage />,
  movimentacoes: <MovementsPage />,
  produtos: <ProductsPage />,
  variacoes: <VariationsPage />,
  transferencias: <TransfersPage />,
};

const domainRoutes = ROUTES.filter((route) => route.id !== "login").map((route) => ({
  path: `/${route.id}`,
  element: SCREEN_ELEMENTS[route.id] ?? <PlaceholderPage navKey={route.navKey} />,
}));

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/dashboard" replace /> },
  { path: "/login", element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: domainRoutes,
      },
    ],
  },
]);
