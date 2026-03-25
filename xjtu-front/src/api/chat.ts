import { http } from "./http";
import type { ChatCompletionResponse } from "../types/api";

const CHAT_TIMEOUT_CLOUD_MS = 130000;
const CHAT_TIMEOUT_LOCAL_MS = 240000;
const CHAT_TIMEOUT_RETRIEVAL_MS = 90000;

function resolveChatTimeoutMs(payload: {
  llm_enabled?: boolean;
  local_transformer_enabled?: boolean;
}): number {
  const cloudEnabled = Boolean(payload.llm_enabled);
  const localEnabled = Boolean(payload.local_transformer_enabled);
  if (cloudEnabled) return CHAT_TIMEOUT_CLOUD_MS;
  if (localEnabled) return CHAT_TIMEOUT_LOCAL_MS;
  return CHAT_TIMEOUT_RETRIEVAL_MS;
}

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

  const timeout = resolveChatTimeoutMs(payload);
  const { data } = await http.post<ChatCompletionResponse>(
    "/chat/completions",
    payload,
    {
      timeout
    }
  );
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
    timeout: CHAT_TIMEOUT_RETRIEVAL_MS
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
