export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface SsoExchangeResponse {
  access_token: string;
  token_type: string;
  login_name: string;
  role: string;
  source_table: string;
}

export interface UserItem {
  id: number;
  login_name: string;
  role: string;
  name: string;
  email?: string;
  department_name: string;
}

export interface KnowledgeBaseItem {
  id: string;
  name: string;
  description: string;
  department: string;
  owner: string;
  status: string;
  embedding_model: string;
  created_at: string;
  updated_at: string;
  document_count: number;
}

export interface DocumentItem {
  id: string;
  kb_id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  status: string;
  chunk_count: number;
  uploaded_at: string;
}

export interface SourceItem {
  source_location: string;
  content: string;
  score: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  model: string;
  conversation_id: string;
  choices: Array<{
    index: number;
    message: { role: string; content: string };
    finish_reason: string;
  }>;
  sources: SourceItem[];
}

export interface ChatLogItem {
  id: string;
  conversation_id: string;
  user_id?: number;
  question: string;
  answer: string;
  kb_ids: string;
  elapsed_ms: number;
  created_at: string;
}
