import { http } from "./http";
import type { ChatCompletionResponse } from "../types/api";

export async function chatCompletions(payload: {
  conversation_id?: string;
  agent_key?: string;
  kb_ids?: string[];
  document_ids?: string[];
  llm_enabled?: boolean;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<ChatCompletionResponse> {
  const { data } = await http.post<ChatCompletionResponse>("/chat/completions", payload);
  return data;
}

export async function retrievalDebug(payload: {
  query: string;
  kb_ids?: string[];
  document_ids?: string[];
  top_k?: number;
  score_threshold?: number;
  fusion_mode?: string;
  alpha?: number;
}) {
  const { data } = await http.post("/chat/retrieval-debug", payload);
  return data;
}

export async function clearConversationContext(conversationId: string) {
  const { data } = await http.delete(`/chat/conversations/${conversationId}/context`);
  return data;
}

export async function rollbackConversation(conversationId: string, keepRounds: number) {
  const { data } = await http.post(
    `/chat/conversations/${conversationId}/rollback`,
    null,
    { params: { keep_rounds: keepRounds } }
  );
  return data;
}
