import { Navigate, Outlet } from "react-router";
import { useAuthStore } from "../../features/auth/store";

export function RequireAuth() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
