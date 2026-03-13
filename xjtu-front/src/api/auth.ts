import { http } from "./http";
import type { SsoExchangeResponse, TokenResponse, UserItem } from "../types/api";

export async function login(login_name: string, password: string): Promise<TokenResponse> {
  const { data } = await http.post<TokenResponse>("/auth/login", { login_name, password });
  return data;
}

export async function me(): Promise<UserItem> {
  const { data } = await http.get<UserItem>("/auth/me");
  return data;
}

export async function ssoExchange(ticket: string): Promise<SsoExchangeResponse> {
  const { data } = await http.post<SsoExchangeResponse>("/auth/sso/exchange", { ticket });
  return data;
}
