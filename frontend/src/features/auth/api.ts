import { apiClient, loginRequest } from "../../shared/api/httpClient";
import type { AuthenticatedUser } from "../../shared/types/api";

export async function login(email: string, password: string): Promise<AuthenticatedUser> {
  await loginRequest(email, password);
  return apiClient.get<AuthenticatedUser>("/auth/me", { timeoutMs: 7000 });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiClient.post<void>("/auth/change-password", {
    current_password: currentPassword,
    new_password: newPassword,
  });
}
