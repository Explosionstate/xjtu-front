import { http } from "./http";
import type { ChatLogItem } from "../types/api";

export async function listChatLogs(params?: {
  keyword?: string;
  kb_id?: string;
  offset?: number;
  limit?: number;
}) {
  const { data } = await http.get<{ total: number; items: ChatLogItem[] }>("/chat/logs", { params });
  return data;
}

export async function cleanupLogs(retentionDays = 30) {
  const { data } = await http.delete<{ deleted: number }>("/chat/logs/cleanup", {
    params: { retention_days: retentionDays }
  });
  return data;
}
