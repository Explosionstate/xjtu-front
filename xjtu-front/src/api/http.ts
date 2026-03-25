import axios, { AxiosError } from "axios";
import { clearToken, getToken } from "../utils/auth";

const envBaseURL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
const baseURL = (envBaseURL && envBaseURL.length > 0 ? envBaseURL : "http://127.0.0.1:8000").replace(/\/+$/, "");

export const http = axios.create({
  baseURL,
  timeout: 60000
});

type ApiEnvelope<T = unknown> = {
  status?: boolean;
  code?: number;
  message?: string;
  data?: T;
  detail?: unknown;
};

function isApiEnvelope(payload: unknown): payload is ApiEnvelope {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Record<string, unknown>;
  return (
    Object.prototype.hasOwnProperty.call(value, "status") &&
    Object.prototype.hasOwnProperty.call(value, "code") &&
    Object.prototype.hasOwnProperty.call(value, "data")
  );
}

function normalizeMessage(raw: unknown): string {
  if (typeof raw === "string" && raw.trim()) return raw.trim();

  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0] as Record<string, unknown>;
    if (typeof first?.msg === "string" && first.msg.trim()) return first.msg.trim();
  }

  if (raw && typeof raw === "object") {
    const value = raw as Record<string, unknown>;
    if (typeof value.detail === "string" && value.detail.trim()) return value.detail.trim();
    if (typeof value.message === "string" && value.message.trim()) return value.message.trim();
  }

  return "";
}

http.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => {
    const payload = response.data as unknown;
    if (!isApiEnvelope(payload)) return response;

    const success = Boolean(payload.status) && Number(payload.code ?? 0) === 0;
    if (success) {
      return {
        ...response,
        data: payload.data
      };
    }

    if (Number(payload.code) === 70005) {
      clearToken();
    }
    const message =
      normalizeMessage(payload.message) || normalizeMessage(payload.detail) || "请求失败";
    return Promise.reject(new Error(message));
  },
  (error: AxiosError<{ detail?: string }>) => {
    if (error.response?.status === 401) {
      clearToken();
    }
    return Promise.reject(normalizeError(error));
  }
);

export function normalizeError(error: unknown): Error {
  if (axios.isAxiosError(error)) {
    const rawMessage = String(error.message || "");
    if (/ERR_CONNECTION_RESET|socket hang up/i.test(rawMessage)) {
      return new Error("连接被服务端重置（本地模型进程可能异常退出），请重试");
    }
    const timeoutLike =
      error.code === "ECONNABORTED" || /timeout|timed out/i.test(rawMessage);
    if (timeoutLike) {
      return new Error("请求超时，请重试或改为更短的问题");
    }
    if (!error.response && rawMessage === "Network Error") {
      return new Error("网络连接失败，请检查后端服务或网络状态");
    }
    const responseData = error.response?.data as unknown;
    if (isApiEnvelope(responseData)) {
      if (Number(responseData.code) === 70005) {
        clearToken();
      }
      const wrappedMessage =
        normalizeMessage(responseData.message) || normalizeMessage(responseData.detail);
      return new Error(wrappedMessage || error.message || "请求失败");
    }
    const dataObject = responseData as Record<string, unknown> | undefined;
    const detail = normalizeMessage(dataObject?.detail);
    const message = normalizeMessage(dataObject?.message);
    return new Error(detail || message || error.message || "请求失败");
  }
  if (error instanceof Error) return error;
  return new Error("未知错误");
}
