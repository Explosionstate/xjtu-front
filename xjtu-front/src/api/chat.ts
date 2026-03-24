import { http } from "./http";
import type { ChatCompletionResponse } from "../types/api";

export async function chatCompletions(payload: {
  conversation_id?: string;
  agent_key?: string;
  kb_ids?: string[];
  document_ids?: string[];
  llm_enabled?: boolean;
  local_transformer_enabled?: boolean;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<ChatCompletionResponse> {
  const latestQuestion = [...payload.messages]
    .reverse()
    .find((item) => item.role === "user")?.content || "";
  const isStudentGrowth = ["student-growth", "student_growth", "student"].includes(
    (payload.agent_key || "").toLowerCase()
  );
  const isAcademicAnalysis =
    isStudentGrowth && /学业分析|学习分析|成绩分析|学情分析/.test(latestQuestion);

  const { data } = await http.post<ChatCompletionResponse>("/chat/completions", payload, {
    timeout: 120000
  });
  return data;
}

export async function retrievalDebug(payload: {
  query: string;
  agent_key?: string;
  kb_ids?: string[];
  document_ids?: string[];
  top_k?: number;
  score_threshold?: number;
  fusion_mode?: string;
  alpha?: number;
}) {
  const { data } = await http.post("/chat/retrieval-debug", payload, {
    timeout: 120000
  });
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
