import { http } from "./http";

export interface RetrievalConfig {
  retrieval_top_k: number;
  score_threshold: number;
  fusion_mode: string;
  alpha: number;
}

export async function getSessionRetrievalConfig(conversationId: string): Promise<RetrievalConfig> {
  const { data } = await http.get<RetrievalConfig>(`/retrieval-config/sessions/${conversationId}`);
  return data;
}

export async function updateSessionRetrievalConfig(
  conversationId: string,
  payload: Partial<RetrievalConfig>
): Promise<RetrievalConfig> {
  const { data } = await http.put<RetrievalConfig>(`/retrieval-config/sessions/${conversationId}`, payload);
  return data;
}
