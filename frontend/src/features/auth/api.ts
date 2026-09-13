import { apiClient, loginRequest } from "../../shared/api/httpClient";
import type { AuthenticatedUser } from "../../shared/types/api";

export async function login(email: string, password: string): Promise<AuthenticatedUser> {
  await loginRequest(email, password);
  return apiClient.get<AuthenticatedUser>("/auth/me", { timeoutMs: 7000 });
}
