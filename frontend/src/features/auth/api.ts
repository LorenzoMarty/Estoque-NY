import { apiClient, loginRequest, storeAuthSession } from "../../shared/api/httpClient";
import type { AuthenticatedUser } from "../../shared/types/api";

export async function login(email: string, password: string): Promise<AuthenticatedUser> {
  await loginRequest(email, password);
  return apiClient.get<AuthenticatedUser>("/auth/me", { timeoutMs: 7000 });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  // Changing the password ends every older session, so the API answers with a fresh pair.
  const tokens = await apiClient.post<{ access_token: string; refresh_token: string }>("/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
  storeAuthSession(tokens);
}
