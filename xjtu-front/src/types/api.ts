export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface ApiEnvelope<T> {
  status: boolean;
  code: number;
  message: string;
  data: T;
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

export interface AcademicStudentProfile {
  student_id: number;
  login_name: string;
  student_no?: string | null;
  student_name: string;
  college_id?: number | null;
  college_name?: string | null;
  major_id?: number | null;
  major_name?: string | null;
  class_id?: number | null;
  class_name?: string | null;
  grade_year?: number | null;
}

export interface AcademicTermInfo {
  term_id: number;
  term_code: string;
  term_name: string;
  academic_year?: number | null;
  term_no?: number | null;
}

export interface AcademicMetricSnapshot {
  avg_score?: number | null;
  gpa?: number | null;
  total_credits?: number | null;
  passed_credits?: number | null;
  class_rank?: number | null;
  major_rank?: number | null;
  college_rank?: number | null;
  cohort_size?: number | null;
  cumulative_avg_score?: number | null;
  cumulative_gpa?: number | null;
  cumulative_total_credits?: number | null;
  cumulative_passed_credits?: number | null;
  failed_course_count?: number | null;
  portrait_risk_level?: string | null;
}

export interface AcademicTrendPoint {
  term_id: number;
  term_code: string;
  term_name: string;
  avg_score?: number | null;
  gpa?: number | null;
  class_rank?: number | null;
  major_rank?: number | null;
}

export interface AcademicCourseScoreItem {
  course_id: number;
  course_name: string;
  final_score: number;
  gpa_point?: number | null;
  rank_in_class?: number | null;
  rank_in_major?: number | null;
  is_passed: boolean;
}

export interface AcademicCohortComparisonItem {
  scope_type: string;
  scope_id: number;
  scope_name: string;
  sample_size: number;
  avg_score?: number | null;
  avg_gpa?: number | null;
  pass_rate?: number | null;
  excellent_rate?: number | null;
  failure_rate?: number | null;
}

export interface AcademicWarningItem {
  warning_id: number;
  warning_type: string;
  warning_level: string;
  risk_score: number;
  status: string;
  opened_at: string;
  resolved_at?: string | null;
}

export interface AcademicAnalysisResponse {
  student: AcademicStudentProfile;
  term: AcademicTermInfo;
  metrics: AcademicMetricSnapshot;
  trend: AcademicTrendPoint[];
  course_scores: AcademicCourseScoreItem[];
  cohort_comparison: AcademicCohortComparisonItem[];
  warnings: AcademicWarningItem[];
  risk_level: string;
  key_findings: string[];
  recommendations: string[];
  generated_at: string;
}

export interface AcademicInterpretResponse {
  analysis: AcademicAnalysisResponse;
  interpretation: string;
  detail_level: "brief" | "detailed";
  llm_mode: string;
  tool_used: boolean;
  generated_at: string;
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

export interface ChatThinking {
  title: string;
  content: string;
  kind: string;
  is_real: boolean;
  collapsed: boolean;
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
  thinking?: ChatThinking;
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
