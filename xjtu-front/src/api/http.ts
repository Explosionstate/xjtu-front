import axios, { AxiosError } from "axios";
import { clearToken, getToken } from "../utils/auth";

const baseURL = "http://127.0.0.1:8000";

export const http = axios.create({
  baseURL,
  timeout: 60000
});

http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ detail?: string }>) => {
    if (error.response?.status === 401) {
      clearToken();
    }
    return Promise.reject(normalizeError(error));
  }
);

export function normalizeError(error: unknown): Error {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail;
    return new Error(detail || error.message || "请求失败");
  }
  if (error instanceof Error) return error;
  return new Error("未知错误");
}
