import { createBrowserRouter, Navigate } from "react-router";
import { LoginPage } from "../features/auth/LoginPage";
import { PlaceholderPage } from "../features/placeholder/PlaceholderPage";
import { AppShell } from "./shell/AppShell";
import { RequireAuth } from "./shell/RequireAuth";
import { ROUTES } from "./routes";

const domainRoutes = ROUTES.filter((route) => route.id !== "login").map((route) => ({
  path: `/${route.id}`,
  element: <PlaceholderPage navKey={route.navKey} />,
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
