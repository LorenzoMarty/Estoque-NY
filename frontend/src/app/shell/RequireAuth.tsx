import { Navigate, Outlet } from "react-router";
import { ChangePasswordPage } from "../../features/auth/ChangePasswordPage";
import { useAuthStore } from "../../features/auth/store";

export function RequireAuth() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitializing = useAuthStore((state) => state.isInitializing);
  const mustChangePassword = useAuthStore((state) => state.user?.must_change_password === true);

  if (isInitializing) {
    return null;
  }
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (mustChangePassword) {
    // The API refuses every protected route until the password changes, so do not render the app.
    return <ChangePasswordPage />;
  }
  return <Outlet />;
}
