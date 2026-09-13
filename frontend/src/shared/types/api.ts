export interface ApiErrorPayload {
  detail?: string;
  message?: string;
  error?: { message?: string; code?: string };
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type?: string;
}

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  active: boolean;
  created_at: string;
}

export interface AuthRequiredDetail {
  path?: string;
  method?: string;
  status?: number;
  reason?: string;
}
