import { http } from "./http";
import type { KnowledgeBaseItem } from "../types/api";

export type KnowledgeBaseUpdatePayload = {
  name?: string;
  description?: string;
  department?: string;
  owner?: string;
  embedding_model?: string;
};

export async function listKnowledgeBases(params?: {
  name?: string;
  department?: string;
  offset?: number;
  limit?: number;
}): Promise<{ total: number; items: KnowledgeBaseItem[] }> {
  const { data } = await http.get("/knowledge-bases", { params });
  return data;
}

export async function createKnowledgeBase(payload: {
  name: string;
  description: string;
  department: string;
  owner: string;
  embedding_model?: string;
}): Promise<KnowledgeBaseItem> {
  const { data } = await http.post<KnowledgeBaseItem>("/knowledge-bases", payload);
  return data;
}

export async function deleteKnowledgeBase(kbId: string, physical: boolean): Promise<{ status: string; cleanup_queued: boolean }> {
  const { data } = await http.delete(`/knowledge-bases/${kbId}`, { params: { physical } });
  return data;
}

export async function updateKnowledgeBase(
  kbId: string,
  payload: KnowledgeBaseUpdatePayload
): Promise<KnowledgeBaseItem> {
  const { data } = await http.put<KnowledgeBaseItem>(`/knowledge-bases/${kbId}`, payload);
  return data;
}
