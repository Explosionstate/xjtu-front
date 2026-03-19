import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import type { ReactNode } from "react";
import { getMyAcademicAnalysis } from "./api/academic";

import { me, ssoExchange } from "./api/auth";
import { chatCompletions, retrievalDebug } from "./api/chat";
import { setSensitiveWords } from "./api/config";
import { batchDeleteDocuments, listDocuments, uploadDocuments } from "./api/documents";
import { createKnowledgeBase, deleteKnowledgeBase, listKnowledgeBases } from "./api/knowledgeBases";
import { listChatLogs } from "./api/logs";
import {
  getSessionRetrievalConfig,
  updateSessionRetrievalConfig,
  type RetrievalConfig
} from "./api/retrievalConfig";
import { getRuntimeDebug } from "./api/runtime";
import type {
  AcademicAnalysisResponse,
  AcademicCohortComparisonItem,
  ChatLogItem,
  ChatThinking as ApiChatThinking,
  DocumentItem,
  KnowledgeBaseItem
} from "./types/api";
import { getToken, setToken } from "./utils/auth";
import { ChatSocket } from "./utils/chatSocket";
import KbDocManagePage from "./pages/KbDocManagePage";
import KbUpdateUploadPage from "./pages/KbUpdateUploadPage";
import AdminKnowledgeManagePage from "./pages/AdminKnowledgeManagePage";

const socket = new ChatSocket();

const defaultConfig: RetrievalConfig = {
  retrieval_top_k: 4,
  score_threshold: 0.25,
  fusion_mode: "weighted",
  alpha: 0.55
};

const THINKING_REVEAL_DELAY_MS = 0;

type AssistantThinkingState = {
  title: string;
  content: string;
  status: "pending" | "streaming" | "done";
  collapsed: boolean;
  kind: string;
  isReal: boolean;
};

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  thinking?: AssistantThinkingState;
};

type UserRole = "admin" | "student" | "teacher" | "unknown";

type AgentWorkspacePreset = {
  agentKey: string;
  entry: string;
  agentTitle: string;
  emptyStateTitle: string;
  emptyStateDesc: string;
  presetQuestion: string;
  conversationId: string;
  useQwen: boolean;
  useStreamWS: boolean;
  retrievalConfig: RetrievalConfig;
  hasRetrievalPreset: boolean;
};

type RightPanelSectionKey = "summary" | "knowledge" | "documents" | "retrieval" | "diagnostics";
type RightPanelSectionState = Record<RightPanelSectionKey, boolean>;

const RETRIEVAL_LOCAL_KEY_PREFIX = "xjtu_retrieval_preset";

type AgentKnowledgeRule = {
  label: string;
  departmentHints: string[];
  keywordHints: string[];
};

const ADMIN_OWNER_HINTS = ["admin", "administrator", "管理员", "super_admin", "kb_admin"];

const AGENT_KB_RULES: Record<string, AgentKnowledgeRule> = {
  "student-growth": {
    label: "学生成长类",
    departmentHints: ["student-growth", "学生成长", "学生发展", "student"],
    keywordHints: ["学生成长", "成长", "学业发展", "student", "growth"]
  },
  "teacher-assistant": {
    label: "教学助教类",
    departmentHints: ["teacher-assistant", "教师助教", "教学助教", "教学", "teacher"],
    keywordHints: ["教师", "助教", "教学", "课堂", "teaching", "assistant"]
  },
  "counselor-ideology": {
    label: "辅导员思政类",
    departmentHints: ["counselor-ideology", "辅导员思政", "辅导员", "思政辅导"],
    keywordHints: ["辅导员", "班会", "学生管理", "心理关怀", "counselor", "ideology"]
  },
  "risk-warning": {
    label: "学情预警类",
    departmentHints: ["risk-warning", "学情预警", "风险预警", "预警", "risk"],
    keywordHints: ["学情预警", "风险", "预警", "异常行为", "risk", "warning"]
  },
  "report-assistant": {
    label: "学情报告类",
    departmentHints: ["report-assistant", "学情报告", "报告生成", "report"],
    keywordHints: ["学情报告", "报告", "月报", "总结", "report", "summary"]
  },
  "policy-qa": {
    label: "思政知识问答类",
    departmentHints: ["policy-qa", "思政知识问答", "政策问答", "政策解读", "qa"],
    keywordHints: ["思政知识", "政策解读", "政策问答", "知识问答", "policy", "qa"]
  }
};

function normalizeMatchText(value: string | null | undefined): string {
  return (value || "").trim().toLowerCase();
}

function toTimeValue(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortKnowledgeBasesByFreshness(items: KnowledgeBaseItem[]): KnowledgeBaseItem[] {
  return [...items].sort((a, b) => {
    const byUpdated = toTimeValue(b.updated_at) - toTimeValue(a.updated_at);
    if (byUpdated !== 0) return byUpdated;
    return toTimeValue(b.created_at) - toTimeValue(a.created_at);
  });
}

function getAgentKnowledgeRule(agentKey: string): AgentKnowledgeRule | null {
  const normalized = normalizeMatchText(agentKey);
  return AGENT_KB_RULES[normalized] || null;
}

function scoreKnowledgeBaseForAgent(kb: KnowledgeBaseItem, rule: AgentKnowledgeRule): number {
  const department = normalizeMatchText(kb.department);
  const searchable = normalizeMatchText([kb.department, kb.name, kb.description, kb.owner].join(" "));
  if (!searchable) return 0;

  let score = 0;
  for (const hint of rule.departmentHints) {
    const token = normalizeMatchText(hint);
    if (!token) continue;
    if (department === token) {
      score += 120;
      continue;
    }
    if (department.includes(token)) {
      score += 60;
    }
  }
  for (const hint of rule.keywordHints) {
    const token = normalizeMatchText(hint);
    if (!token) continue;
    if (searchable.includes(token)) {
      score += 20;
    }
  }

  if (score > 0) {
    score += Math.min(12, Number(kb.document_count) || 0);
  }
  return score;
}

function getAgentMatchedKnowledgeBases(items: KnowledgeBaseItem[], agentKey: string): KnowledgeBaseItem[] {
  const rule = getAgentKnowledgeRule(agentKey);
  if (!rule) return [];

  return items
    .map((item) => ({ item, score: scoreKnowledgeBaseForAgent(item, rule) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return toTimeValue(b.item.updated_at) - toTimeValue(a.item.updated_at);
    })
    .map((entry) => entry.item);
}

function isAdminOwnedKnowledgeBase(kb: KnowledgeBaseItem): boolean {
  const owner = normalizeMatchText(kb.owner);
  if (!owner) return false;
  return ADMIN_OWNER_HINTS.some((hint) => owner.includes(normalizeMatchText(hint)));
}

function createMessageId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

function createAssistantPlaceholder(id: number): ChatMessage {
  return {
    id,
    role: "assistant",
    content: "",
    thinking: {
      title: "思考中",
      content: "",
      status: "pending",
      collapsed: false,
      kind: "summary",
      isReal: false
    }
  };
}

function createThinkingState(thinking?: ApiChatThinking): AssistantThinkingState {
  return {
    title: thinking?.title || "处理摘要",
    content: thinking?.content || "",
    status: thinking?.content ? "done" : "pending",
    collapsed: Boolean(thinking?.collapsed),
    kind: thinking?.kind || "summary",
    isReal: Boolean(thinking?.is_real)
  };
}

function updateMessageById(
  messages: ChatMessage[],
  messageId: number,
  updater: (message: ChatMessage) => ChatMessage
) {
  return messages.map((message) => (message.id === messageId ? updater(message) : message));
}

function getThinkingLabel(thinking: AssistantThinkingState) {
  if (thinking.status === "pending") return "思考中";
  if (thinking.status === "streaming") return thinking.title || "思考过程";
  if (thinking.collapsed) return thinking.isReal ? "查看思考过程" : "查看处理摘要";
  return thinking.isReal ? "收起思考过程" : "收起处理摘要";
}

function normalizeRole(rawRole?: string, rawLoginName?: string): UserRole {
  const role = (rawRole || "").trim().toLowerCase();
  if (role === "admin" || role === "student" || role === "teacher") {
    return role;
  }
  const loginRole = (rawLoginName || "").trim().toLowerCase();
  if (loginRole === "admin" || loginRole === "student" || loginRole === "teacher") {
    return loginRole;
  }
  return "unknown";
}

function parseBoolean(value: string | null, fallback = false): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function formatNumber(value: unknown, digits = 2): string {
  if (value === null || value === undefined) return "--";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "--";
  return parsed.toFixed(digits);
}

function formatPercent(value: unknown): string {
  const text = formatNumber(value, 2);
  return text === "--" ? text : `${text}%`;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function riskClassName(risk: string | undefined): string {
  const normalized = (risk || "").toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  if (normalized === "low") return "low";
  return "unknown";
}

function warningClassName(level: string | undefined): string {
  const normalized = (level || "").toLowerCase();
  if (normalized === "critical") return "critical";
  if (normalized === "high") return "high";
  if (normalized === "medium") return "medium";
  if (normalized === "low") return "low";
  return "unknown";
}

function scopeLabel(scopeType: string): string {
  switch (scopeType) {
    case "class":
      return "同班";
    case "major":
      return "同专业";
    case "college":
      return "同学院";
    default:
      return scopeType;
  }
}

function parseAgentWorkspacePreset(search: string): AgentWorkspacePreset {
  const params = new URLSearchParams(search);
  const topK = parseNumber(params.get("retrieval_top_k"));
  const threshold = parseNumber(params.get("score_threshold"));
  const alpha = parseNumber(params.get("alpha"));
  const fusionMode = params.get("fusion_mode");

  const hasRetrievalPreset = topK !== null || threshold !== null || alpha !== null || Boolean(fusionMode);

  return {
    agentKey: params.get("agent_key") || "",
    entry: params.get("entry") || "",
    agentTitle: params.get("agent_title") || "智能体协作平台",
    emptyStateTitle: params.get("agent_empty_title") || "你好，我是西交 AI 助手",
    emptyStateDesc:
      params.get("agent_empty_desc") || "我可以帮助你检索知识库、分析文档，或基于当前资料给出结构化回答。",
    presetQuestion: params.get("preset_question") || "",
    conversationId: params.get("conversation_id") || "",
    useQwen: parseBoolean(params.get("use_qwen"), false),
    useStreamWS: parseBoolean(params.get("use_ws"), false),
    retrievalConfig: {
      retrieval_top_k:
        topK === null ? defaultConfig.retrieval_top_k : Math.max(1, Math.min(50, Math.round(topK))),
      score_threshold:
        threshold === null ? defaultConfig.score_threshold : Math.max(0, Math.min(1, threshold)),
      fusion_mode: fusionMode || defaultConfig.fusion_mode,
      alpha: alpha === null ? defaultConfig.alpha : Math.max(0, Math.min(1, alpha))
    },
    hasRetrievalPreset
  };
}

function buildRetrievalLocalKey(role: UserRole, scope: string): string {
  const safeScope = (scope || "default").trim() || "default";
  return `${RETRIEVAL_LOCAL_KEY_PREFIX}:${role}:${safeScope}`;
}

function loadLocalRetrievalConfig(role: UserRole, scope: string): RetrievalConfig | null {
  try {
    const exactKey = buildRetrievalLocalKey(role, scope);
    const fallbackKey = buildRetrievalLocalKey("unknown", scope);
    const raw = localStorage.getItem(exactKey) || localStorage.getItem(fallbackKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RetrievalConfig>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      retrieval_top_k: Math.max(1, Math.min(50, Number(parsed.retrieval_top_k || defaultConfig.retrieval_top_k))),
      score_threshold: Math.max(0, Math.min(1, Number(parsed.score_threshold || defaultConfig.score_threshold))),
      fusion_mode: typeof parsed.fusion_mode === "string" ? parsed.fusion_mode : defaultConfig.fusion_mode,
      alpha: Math.max(0, Math.min(1, Number(parsed.alpha || defaultConfig.alpha)))
    };
  } catch {
    return null;
  }
}

function saveLocalRetrievalConfig(role: UserRole, scope: string, config: RetrievalConfig): void {
  localStorage.setItem(buildRetrievalLocalKey(role, scope), JSON.stringify(config));
  if (role !== "unknown") {
    localStorage.setItem(buildRetrievalLocalKey("unknown", scope), JSON.stringify(config));
  }
}

export default function App() {
  const agentPreset = useMemo(() => parseAgentWorkspacePreset(window.location.search), []);
  const initialPage = agentPreset.entry === "admin-agent-center-dashboard" ? "kbadmin" : "ai";
  const [currentPage, setCurrentPage] = useState<"ai" | "kbdoc" | "kbops" | "kbadmin">(initialPage);
  const [error, setError] = useState("");
  const [tokenReady, setTokenReady] = useState(Boolean(getToken()));
  const [userRole, setUserRole] = useState<UserRole>("unknown");

  const [kbs, setKbs] = useState<KnowledgeBaseItem[]>([]);
  const [kbName, setKbName] = useState("演示知识库");
  const [activeKbId, setActiveKbId] = useState("");
  const [enabledKbIds, setEnabledKbIds] = useState<string[]>([]);

  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [enabledDocIds, setEnabledDocIds] = useState<string[]>([]);

  const [question, setQuestion] = useState(agentPreset.presetQuestion);
  const [debugJson, setDebugJson] = useState("");
  const [conversationId, setConversationId] = useState(
    agentPreset.conversationId || `conv-${Date.now()}`
  );

  const [logs, setLogs] = useState<ChatLogItem[]>([]);
  const [runtimeJson, setRuntimeJson] = useState("");
  const [useQwen, setUseQwen] = useState(agentPreset.useQwen);
  const [useStreamWS, setUseStreamWS] = useState(agentPreset.useStreamWS);

  const [sessionConfig, setSessionConfig] = useState<RetrievalConfig>(agentPreset.retrievalConfig);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [academicData, setAcademicData] = useState<AcademicAnalysisResponse | null>(null);
  const [academicLoading, setAcademicLoading] = useState(false);
  const [academicExpanded, setAcademicExpanded] = useState(true);
  const [rightPanelSections, setRightPanelSections] = useState<RightPanelSectionState>({
    summary: true,
    knowledge: true,
    documents: true,
    retrieval: true,
    diagnostics: true
  });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const thinkingTimerIdsRef = useRef<number[]>([]);
  const retrievalPresetAppliedRef = useRef(false);
  const retrievalScope = useMemo(
    () => agentPreset.agentKey || agentPreset.entry || "default",
    [agentPreset.agentKey, agentPreset.entry]
  );

  const canOperateDoc = useMemo(() => Boolean(activeKbId), [activeKbId]);
  const isRoleLimited = tokenReady && userRole !== "admin";
  const canAccessAdminViews = !isRoleLimited;
  const canShowAcademic = tokenReady && userRole === "student";
  const activeKb = useMemo(
    () => kbs.find((item) => item.id === activeKbId) || null,
    [kbs, activeKbId]
  );
  const enabledKbCount = enabledKbIds.length;
  const enabledDocCount = enabledDocIds.length;
  const totalChunkCount = useMemo(
    () => docs.reduce((sum, doc) => sum + (Number(doc.chunk_count) || 0), 0),
    [docs]
  );
  const classComparison = useMemo(
    () => academicData?.cohort_comparison.find((item) => item.scope_type === "class") || null,
    [academicData]
  );
  const latestAssistantThinking = useMemo(
    () =>
      [...chatHistory]
        .reverse()
        .find((item) => item.role === "assistant" && item.thinking?.content)?.thinking || null,
    [chatHistory]
  );
  const latestTimingSummary = useMemo(() => {
    const content = latestAssistantThinking?.content || "";
    const match = content.match(/profile_ms=(\d+)[，,]\s*retrieval_ms=(\d+)[，,]\s*llm_ms=(\d+)[，,]\s*total_ms=(\d+)/);
    if (!match) return null;
    const workflowMatch = content.match(/workflow_wait_ms=(\d+)/);
    return {
      profile_ms: Number(match[1]),
      retrieval_ms: Number(match[2]),
      llm_ms: Number(match[3]),
      total_ms: Number(match[4]),
      workflow_wait_ms: workflowMatch ? Number(workflowMatch[1]) : 0
    };
  }, [latestAssistantThinking]);
  const primaryHintText = agentPreset.presetQuestion || "总结本周新增文档的重点内容";
  const secondaryHintText = "根据知识库解释某个技术概念";

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  useEffect(() => () => {
    thinkingTimerIdsRef.current.forEach((timerId) => window.clearTimeout(timerId));
  }, []);

  async function runSafely(task: () => Promise<void>) {
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message || "操作失败");
    }
  }

  async function refreshKnowledgeBaseList(preferredKbId?: string) {
    const result = await listKnowledgeBases({ limit: 100 });
    const items = sortKnowledgeBasesByFreshness(
      result.items.filter((item) => normalizeMatchText(item.status) !== "deleted")
    );
    setKbs(items);

    if (!items.length) {
      setActiveKbId("");
      setEnabledKbIds([]);
      setDocs([]);
      setSelectedDocIds([]);
      setEnabledDocIds([]);
      return;
    }

    const adminOwnedItems = items.filter(isAdminOwnedKnowledgeBase);
    const matchedAdminItems = getAgentMatchedKnowledgeBases(adminOwnedItems, agentPreset.agentKey);
    const matchedItems = getAgentMatchedKnowledgeBases(items, agentPreset.agentKey);
    const recommendedKbId =
      matchedAdminItems[0]?.id ||
      (adminOwnedItems.length ? adminOwnedItems[0].id : "") ||
      matchedItems[0]?.id ||
      items[0].id;
    const lockKnowledgeBaseForUser = userRole !== "admin";

    const resolvedActiveKbId =
      lockKnowledgeBaseForUser
        ? recommendedKbId
        : (preferredKbId && items.some((item) => item.id === preferredKbId) && preferredKbId) ||
          (activeKbId && items.some((item) => item.id === activeKbId) && activeKbId) ||
          recommendedKbId;

    setActiveKbId(resolvedActiveKbId);
    setEnabledKbIds((prev) => {
      if (lockKnowledgeBaseForUser) {
        return resolvedActiveKbId ? [resolvedActiveKbId] : [];
      }
      const nextEnabledKbIds = prev.filter((id) => items.some((item) => item.id === id));
      return nextEnabledKbIds.length
        ? nextEnabledKbIds
        : resolvedActiveKbId
          ? [resolvedActiveKbId]
          : [];
    });
  }

  async function refreshDocumentList(targetKbId: string) {
    const result = await listDocuments(targetKbId);
    const items = result.items;
    setDocs(items);
    setSelectedDocIds((prev) => prev.filter((id) => items.some((doc) => doc.id === id)));
    setEnabledDocIds((prev) => prev.filter((id) => items.some((doc) => doc.id === id)));
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticket = params.get("sso_ticket");
    if (!ticket) {
      if (getToken()) {
        runSafely(async () => {
          const profile = await me();
          setUserRole(normalizeRole(profile.role));
          setTokenReady(true);
        });
      }
      return;
    }

    params.delete("sso_ticket");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);

    runSafely(async () => {
      const data = await ssoExchange(ticket);
      setToken(data.access_token);
      setTokenReady(true);
      setUserRole(normalizeRole(data.role, data.login_name));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isRoleLimited && currentPage !== "ai") {
      setCurrentPage("ai");
    }
  }, [currentPage, isRoleLimited]);

  useEffect(() => {
    if (agentPreset.agentTitle) {
      document.title = `${agentPreset.agentTitle} - 西交 AI 智能体`;
    }
  }, [agentPreset.agentTitle]);

  useEffect(() => {
    if (!tokenReady) return;
    runSafely(async () => {
      const localSaved = loadLocalRetrievalConfig(userRole, retrievalScope);
      if (localSaved) {
        setSessionConfig(localSaved);
        await updateSessionRetrievalConfig(conversationId, localSaved);
        return;
      }
      if (!retrievalPresetAppliedRef.current && agentPreset.hasRetrievalPreset) {
        await updateSessionRetrievalConfig(conversationId, agentPreset.retrievalConfig);
        setSessionConfig(agentPreset.retrievalConfig);
        retrievalPresetAppliedRef.current = true;
        return;
      }
      const serverConfig = await getSessionRetrievalConfig(conversationId);
      setSessionConfig(serverConfig);
    });
  }, [
    tokenReady,
    userRole,
    retrievalScope,
    agentPreset.hasRetrievalPreset,
    agentPreset.retrievalConfig,
    conversationId
  ]);

  useEffect(() => {
    if (!tokenReady) return;
    runSafely(async () => {
      await refreshKnowledgeBaseList();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenReady, agentPreset.agentKey, userRole]);

  useEffect(() => {
    if (!tokenReady) return;
    if (!activeKbId) {
      setDocs([]);
      setSelectedDocIds([]);
      setEnabledDocIds([]);
      return;
    }
    runSafely(async () => {
      await refreshDocumentList(activeKbId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKbId, tokenReady]);

  const patchChatMessage = (messageId: number, updater: (message: ChatMessage) => ChatMessage) => {
    setChatHistory((prev) => updateMessageById(prev, messageId, updater));
  };

  const scheduleMessageUpdate = (task: () => void, delayMs: number) => {
    const timerId = window.setTimeout(() => {
      thinkingTimerIdsRef.current = thinkingTimerIdsRef.current.filter((id) => id !== timerId);
      task();
    }, delayMs);
    thinkingTimerIdsRef.current.push(timerId);
  };

  const markAssistantError = (messageId: number, message: string) => {
    patchChatMessage(messageId, (chatMessage) => ({
      ...chatMessage,
      thinking: chatMessage.thinking
        ? {
            ...chatMessage.thinking,
            title: "处理失败",
            content: message,
            status: "done",
            collapsed: false
          }
        : chatMessage.thinking
    }));
  };

  const toggleThinking = (messageId: number) => {
    patchChatMessage(messageId, (message) => {
      if (message.role !== "assistant" || !message.thinking || message.thinking.status === "pending") {
        return message;
      }
      return {
        ...message,
        thinking: {
          ...message.thinking,
          collapsed: !message.thinking.collapsed
        }
      };
    });
  };

  const handleSendMessage = () => {
    if (!question.trim()) return;
    const currentQuestion = question.trim();
    const userMessageId = createMessageId();
    const assistantMessageId = createMessageId();
    setQuestion("");

    setChatHistory((prev) => [
      ...prev,
      { id: userMessageId, role: "user", content: currentQuestion },
      createAssistantPlaceholder(assistantMessageId)
    ]);

    if (useStreamWS) {
      socket.connect({
        onMeta: (meta) => setConversationId(meta.conversation_id),
        onThinking: (thinkingEvent) => {
          if (thinkingEvent.status === "start") {
            patchChatMessage(assistantMessageId, (message) => ({
              ...message,
              thinking: {
                ...(message.thinking || createThinkingState()),
                title: thinkingEvent.title || "思考中",
                content: thinkingEvent.content || "",
                status: "pending",
                collapsed: false,
                kind: thinkingEvent.kind || "summary",
                isReal: Boolean(thinkingEvent.is_real)
              }
            }));
            return;
          }

          if (thinkingEvent.status === "delta") {
            patchChatMessage(assistantMessageId, (message) => {
              const previousThinking = message.thinking || createThinkingState();
              return {
                ...message,
                thinking: {
                  ...previousThinking,
                  title: thinkingEvent.title || previousThinking.title,
                  content:
                    previousThinking.status === "pending"
                      ? thinkingEvent.content || ""
                      : `${previousThinking.content}${thinkingEvent.content || ""}`,
                  status: "streaming",
                  collapsed: false,
                  kind: thinkingEvent.kind || previousThinking.kind,
                  isReal: Boolean(thinkingEvent.is_real ?? previousThinking.isReal)
                }
              };
            });
            return;
          }

          patchChatMessage(assistantMessageId, (message) => ({
            ...message,
            thinking: message.thinking
              ? {
                  ...message.thinking,
                  title: thinkingEvent.title || message.thinking.title,
                  status: "done",
                  collapsed: true,
                  kind: thinkingEvent.kind || message.thinking.kind,
                  isReal: Boolean(thinkingEvent.is_real ?? message.thinking.isReal)
                }
              : message.thinking
          }));
        },
        onDelta: (text) => {
          patchChatMessage(assistantMessageId, (message) => ({
            ...message,
            content: `${message.content}${text}`
          }));
        },
        onError: (message) => {
          setError(message);
          markAssistantError(assistantMessageId, message);
        }
      });

      runSafely(async () => {
        try {
            socket.send({
              conversation_id: conversationId,
              agent_key: agentPreset.agentKey || undefined,
              kb_ids: enabledKbIds.length ? enabledKbIds : activeKbId ? [activeKbId] : undefined,
              document_ids: enabledDocIds,
              llm_enabled: useQwen,
            messages: [{ role: "user", content: currentQuestion }]
          });
        } catch (e) {
          markAssistantError(assistantMessageId, (e as Error).message || "发送失败");
          throw e;
        }
      });
      return;
    }

    runSafely(async () => {
      try {
        const data = await chatCompletions({
          agent_key: agentPreset.agentKey || undefined,
          kb_ids: enabledKbIds.length ? enabledKbIds : activeKbId ? [activeKbId] : undefined,
          document_ids: enabledDocIds,
          llm_enabled: useQwen,
          conversation_id: conversationId,
          messages: [{ role: "user", content: currentQuestion }]
        });
        const resultText = data.choices[0].message.content;
        const thinkingState = createThinkingState(data.thinking);
        setConversationId(data.conversation_id);
        patchChatMessage(assistantMessageId, (message) => ({
          ...message,
          content: "",
          thinking: {
            ...thinkingState,
            collapsed: false,
            status: "done"
          }
        }));
        const commitResponse = () => {
          patchChatMessage(assistantMessageId, (message) => ({
            ...message,
            content: resultText,
            thinking: message.thinking
              ? {
                  ...message.thinking,
                  ...thinkingState,
                  status: "done",
                  collapsed: true
                }
              : message.thinking
          }));
        };
        if (THINKING_REVEAL_DELAY_MS <= 0) {
          commitResponse();
        } else {
          scheduleMessageUpdate(commitResponse, THINKING_REVEAL_DELAY_MS);
        }
      } catch (e) {
        markAssistantError(assistantMessageId, (e as Error).message || "请求失败");
        throw e;
      }
    });
  };

  const loadAcademicAnalysis = (termCode?: string) => {
    if (!tokenReady || userRole !== "student") {
      setAcademicData(null);
      setError("仅学生可使用学业分析功能");
      return;
    }
    runSafely(async () => {
      setAcademicLoading(true);
      try {
        const data = await getMyAcademicAnalysis(termCode);
        setAcademicData(data);
      } finally {
        setAcademicLoading(false);
      }
    });
  };

  const renderComparisonItem = (item: AcademicCohortComparisonItem) => (
    <div className="qw-academic-compare-item" key={`${item.scope_type}-${item.scope_id}`}>
      <div className="qw-academic-compare-title">
        <strong>{scopeLabel(item.scope_type)}</strong>
        <span>{item.scope_name}</span>
      </div>
      <div className="qw-academic-compare-metrics">
        <span>样本: {item.sample_size}</span>
        <span>均分: {formatNumber(item.avg_score)}</span>
        <span>GPA: {formatNumber(item.avg_gpa)}</span>
        <span>通过率: {formatPercent(item.pass_rate)}</span>
      </div>
    </div>
  );

  const renderRightPanelSection = (
    sectionKey: RightPanelSectionKey,
    title: string,
    content: ReactNode
  ) => {
    const isOpen = rightPanelSections[sectionKey];

    return (
      <section className={`qw-accordion ${isOpen ? "is-open" : ""}`}>
        <button
          type="button"
          className="qw-accordion-trigger"
          aria-expanded={isOpen}
          onClick={() => {
            setRightPanelSections((prev) => ({
              ...prev,
              [sectionKey]: !prev[sectionKey]
            }));
          }}
        >
          <span>{title}</span>
          <span className={`qw-accordion-trigger-icon ${isOpen ? "is-open" : ""}`}>+</span>
        </button>
        {isOpen && <div className="qw-accordion-panel">{content}</div>}
      </section>
    );
  };

  if (currentPage === "kbdoc" && canAccessAdminViews) {
    return (
      <main className="qw-layout" style={{ display: "block", minHeight: "100vh" }}>
        <div style={{ padding: 16 }}>
          <button className="qw-btn qw-btn-subtle" onClick={() => setCurrentPage("ai")}>
            返回智能体主界面
          </button>
        </div>
        <KbDocManagePage onError={setError} />
        {error && <div className="qw-toast-error" style={{ margin: "0 16px 16px" }}>{error}</div>}
      </main>
    );
  }

  if (currentPage === "kbops" && canAccessAdminViews) {
    return <KbUpdateUploadPage onError={setError} onBack={() => setCurrentPage("ai")} />;
  }

  if (currentPage === "kbadmin" && canAccessAdminViews) {
    return (
      <AdminKnowledgeManagePage
        conversationId={conversationId}
        onError={setError}
        onBack={() => setCurrentPage("ai")}
        onApplyRetrievalConfig={(data) => {
          setSessionConfig(data);
          saveLocalRetrievalConfig(userRole, retrievalScope, data);
        }}
      />
    );
  }

  return (
    <main className={`qw-layout${isRoleLimited ? " qw-layout-limited" : ""}`}>
      <style>{`
        /* Chat UI Optimization */
        .qw-main-chat {
          background-color: #f7f9fb; /* Light background to make white bubbles pop */
        }
        .qw-msg-row {
          margin-bottom: 20px;
        }
        .qw-bubble {
          border-radius: 12px; /* Semi-rounded corners */
          padding: 12px 16px;
          line-height: 1.6;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
          position: relative;
        }

        /* User Bubble: Solid Blue, White Text */
        .qw-msg-row.user .qw-bubble {
          background-color: #0052D9;
          color: #ffffff;
          border-top-right-radius: 2px;
          border: none;
        }
        .qw-msg-row.user .qw-bubble a {
          color: #e3ebff;
          text-decoration: underline;
        }

        /* AI Bubble: Solid White, Dark Text */
        .qw-msg-row.ai .qw-bubble {
          background-color: #ffffff;
          color: #1f2329;
          border: 1px solid #e5e7eb;
          border-top-left-radius: 2px;
        }

        /* Thinking Panel Adjustment for new bubble style */
        .qw-thinking-panel {
          background: #f5f6f7;
          border: 1px solid #ebedf0;
          border-radius: 8px;
          margin-bottom: 12px;
          padding: 8px 12px;
        }
        .qw-thinking-toggle {
          color: #646a73;
        }
      `}</style>
      <aside className="qw-sidebar">
        <div className="qw-brand">
          <div className="qw-logo">AI</div>
          <div className="qw-brand-copy">
            <strong>西交 AI 智能体</strong>
            <span>知识库与会话协作工作台</span>
          </div>
        </div>

        <div className="qw-sidebar-overview">
          <article className="qw-sidebar-stat qw-sidebar-stat-muted qw-scope-panel">
            <span className="qw-kicker">检索范围</span>
            <strong>{enabledDocCount} 份文档已启用</strong>
          </article>
        </div>

        {canAccessAdminViews && (
          <div className="qw-sidebar-actions">
            <button className="qw-btn qw-btn-subtle" onClick={() => setCurrentPage("kbdoc")}>
              文档管理
            </button>
            <button className="qw-btn qw-btn-subtle" onClick={() => setCurrentPage("kbops")}>
              知识库批量操作
            </button>
            <button className="qw-btn qw-btn-subtle" onClick={() => setCurrentPage("kbadmin")}>
              管理员知识库中心
            </button>
          </div>
        )}

        <button
          className="qw-btn qw-btn-primary qw-new-chat-btn"
          onClick={() => {
            setConversationId(`conv-${Date.now()}`);
            setChatHistory([]);
            setQuestion("");
          }}
        >
          <svg
            className="plus-icon"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          新建会话
        </button>

        <div className="qw-history-list">
          <div className="qw-history-title">当前会话</div>
          <div className="qw-history-item active">
            <span className="qw-history-name">当前正在进行的会话</span>
            <span className="qw-session-badge">{conversationId.slice(-6)}</span>
          </div>
          <p className="qw-history-tip">点击“新建会话”会清空当前消息上下文。</p>
        </div>
      </aside>

      <section className="qw-main-chat">
        <header className="qw-chat-header">
          <div className="qw-chat-heading">
            <span className="qw-kicker">智能体工作台</span>
            <h1>{agentPreset.agentTitle}</h1>
            <p>统一处理问答、知识检索、学业分析与运行调试，界面结构保持稳定。</p>
          </div>
          <div className="qw-chat-header-side">
            <div className="qw-header-chip">
              <span>当前会话</span>
              <code>{conversationId.slice(-8)}</code>
            </div>
            <div className="qw-header-chip">
              <span>当前检索范围</span>
              <strong>{enabledKbCount} 个知识库 / {enabledDocCount} 份文档</strong>
            </div>
          </div>
        </header>

        {error && <div className="qw-toast-error">{error}</div>}

        {canShowAcademic && (
          <section className="qw-academic-panel">
            <div className="qw-academic-toolbar">
              <div className="qw-btn-group">
                <button
                  className="qw-btn qw-btn-subtle"
                  onClick={() => loadAcademicAnalysis()}
                  disabled={academicLoading}
                >
                  {academicLoading ? "学业分析加载中..." : "获取学业分析"}
                </button>
                {academicData && (
                  <button
                    className="qw-btn qw-btn-subtle"
                    onClick={() => setAcademicExpanded((prev) => !prev)}
                  >
                    {academicExpanded ? "收起分析卡片" : "展开分析卡片"}
                  </button>
                )}
              </div>
              {academicData && (
                <div className="qw-academic-toolbar-meta">
                  <span>{academicData.student.student_name}（{academicData.student.login_name}）</span>
                  <span>{academicData.term.term_name}</span>
                  <span>生成时间：{formatDateTime(academicData.generated_at)}</span>
                </div>
              )}
            </div>

            {academicData && academicExpanded && (
              <div className="qw-academic-content">
                <div className="qw-academic-grid">
                  <article className="qw-academic-card">
                    <h3>学生概况</h3>
                    <div className="qw-academic-list">
                      <div>学号：{academicData.student.student_no || "--"}</div>
                      <div>学院：{academicData.student.college_name || "--"}</div>
                      <div>专业：{academicData.student.major_name || "--"}</div>
                      <div>班级：{academicData.student.class_name || "--"}</div>
                      <div>年级：{academicData.student.grade_year || "--"}</div>
                    </div>
                  </article>

                  <article className="qw-academic-card">
                    <h3>学业指标概览</h3>
                    <div className="qw-academic-list">
                      <div>当前均分：{formatNumber(academicData.metrics.avg_score)}</div>
                      <div>当前 GPA：{formatNumber(academicData.metrics.gpa)}</div>
                      <div>累计均分：{formatNumber(academicData.metrics.cumulative_avg_score)}</div>
                      <div>累计 GPA：{formatNumber(academicData.metrics.cumulative_gpa)}</div>
                      <div>已修学分：{formatNumber(academicData.metrics.total_credits)}</div>
                      <div>通过学分：{formatNumber(academicData.metrics.passed_credits)}</div>
                      <div>不及格门数：{academicData.metrics.failed_course_count ?? "--"}</div>
                    </div>
                    <div className="qw-academic-tags">
                      <span className={`qw-risk-pill ${riskClassName(academicData.risk_level)}`}>
                        风险等级：{academicData.risk_level || "--"}
                      </span>
                      <span className={`qw-risk-pill ${riskClassName(academicData.metrics.portrait_risk_level || undefined)}`}>
                        画像风险：{academicData.metrics.portrait_risk_level || "--"}
                      </span>
                    </div>
                  </article>

                  <article className="qw-academic-card">
                    <h3>同维度对比</h3>
                    {academicData.cohort_comparison.length > 0 ? (
                      <div className="qw-academic-compare">
                        {academicData.cohort_comparison.map((item) => renderComparisonItem(item))}
                      </div>
                    ) : (
                      <div className="qw-empty-text">暂无同班/同专业/同学院聚合对比数据。</div>
                    )}
                    {classComparison && (
                      <p className="qw-section-tip qw-academic-inline-tip">
                        同班样本数 {classComparison.sample_size}，均分 {formatNumber(classComparison.avg_score)}，
                        GPA {formatNumber(classComparison.avg_gpa)}，通过率 {formatPercent(classComparison.pass_rate)}。
                      </p>
                    )}
                  </article>

                  <article className="qw-academic-card">
                    <h3>成绩趋势</h3>
                    {academicData.trend.length > 0 ? (
                      <div className="qw-academic-trend">
                        {academicData.trend.map((point) => (
                          <div className="qw-academic-trend-item" key={point.term_code}>
                            <div className="qw-academic-trend-head">
                              <span>{point.term_name}</span>
                              <span>均分 {formatNumber(point.avg_score)}</span>
                              <span>GPA {formatNumber(point.gpa)}</span>
                            </div>
                            <div className="qw-academic-trend-bar">
                              <div
                                style={{
                                  width: `${Math.max(0, Math.min(100, Number(point.avg_score) || 0))}%`
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="qw-empty-text">暂无趋势数据。</div>
                    )}
                  </article>

                  <article className="qw-academic-card">
                    <h3>学业预警</h3>
                    {academicData.warnings.length > 0 ? (
                      <div className="qw-academic-warning-list">
                        {academicData.warnings.map((warning) => (
                          <div className="qw-academic-warning-item" key={warning.warning_id}>
                            <div className="qw-academic-warning-head">
                              <strong>{warning.warning_type}</strong>
                              <span className={`qw-warning-tag ${warningClassName(warning.warning_level)}`}>
                                {warning.warning_level}
                              </span>
                            </div>
                            <div className="qw-academic-warning-meta">
                              <span>风险分：{formatNumber(warning.risk_score)}</span>
                              <span>状态：{warning.status}</span>
                              <span>触发时间：{formatDateTime(warning.opened_at)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="qw-empty-text">当前暂无学业预警。</div>
                    )}
                  </article>

                  <article className="qw-academic-card">
                    <h3>个性化建议</h3>
                    {academicData.recommendations.length > 0 ? (
                      <ul className="qw-academic-list qw-academic-bullets">
                        {academicData.recommendations.map((item, idx) => <li key={`${item}-${idx}`}>{item}</li>)}
                      </ul>
                    ) : (
                      <div className="qw-empty-text">暂无建议结果。</div>
                    )}
                    <h4 className="qw-academic-subtitle">关键发现</h4>
                    {academicData.key_findings.length > 0 ? (
                      <ul className="qw-academic-list qw-academic-bullets">
                        {academicData.key_findings.map((item, idx) => <li key={`${item}-${idx}`}>{item}</li>)}
                      </ul>
                    ) : (
                      <div className="qw-empty-text">暂无关键发现。</div>
                    )}
                  </article>
                </div>

                <article className="qw-academic-card qw-academic-card-full">
                  <h3>课程成绩明细（当前学期）</h3>
                  {academicData.course_scores.length > 0 ? (
                    <div className="qw-academic-score-list">
                      {academicData.course_scores.map((course) => (
                        <div className="qw-academic-score-item" key={`${course.course_id}-${course.course_name}`}>
                          <div className="qw-academic-score-main">
                            <strong>{course.course_name}</strong>
                            <span>分数：{formatNumber(course.final_score)}</span>
                            <span>GPA：{formatNumber(course.gpa_point)}</span>
                          </div>
                          <div className="qw-academic-score-meta">
                            <span>班级排名：{course.rank_in_class ?? "--"}</span>
                            <span>专业排名：{course.rank_in_major ?? "--"}</span>
                            <span>{course.is_passed ? "已通过" : "未通过"}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="qw-empty-text">当前学期暂无课程成绩数据。</div>
                  )}
                </article>
              </div>
            )}
          </section>
        )}

        <div className="qw-chat-scroll">
          <div className="qw-chat-container">
            {chatHistory.length === 0 ? (
              <div className="qw-empty-state">
                <h2>{agentPreset.emptyStateTitle}</h2>
                <p>{agentPreset.emptyStateDesc}</p>
                <div className="qw-empty-hints">
                  <span onClick={() => setQuestion(primaryHintText)}>示例：{primaryHintText}</span>
                  <span onClick={() => setQuestion(secondaryHintText)}>示例：{secondaryHintText}</span>
                </div>
              </div>
            ) : (
              chatHistory.map((msg) => (
                <div key={msg.id} className={`qw-msg-row ${msg.role === "assistant" ? "ai" : "user"}`}>
                  {msg.role === "assistant" && <div className="qw-avatar ai">AI</div>}
                  <div className="qw-bubble">
                    {msg.role === "assistant" && msg.thinking && (
                      <div className={`qw-thinking-panel ${msg.thinking.collapsed ? "is-collapsed" : ""}`}>
                        <button
                          type="button"
                          className={`qw-thinking-toggle ${msg.thinking.status === "pending" ? "is-disabled" : ""}`}
                          onClick={() => toggleThinking(msg.id)}
                          disabled={msg.thinking.status === "pending"}
                        >
                          <span className={`qw-thinking-arrow ${msg.thinking.collapsed ? "is-collapsed" : ""}`}>▾</span>
                          <span className="qw-thinking-label">{getThinkingLabel(msg.thinking)}</span>
                        </button>
                        {!msg.thinking.collapsed && (
                          <div className="qw-thinking-body">
                            {msg.thinking.content || <span className="qw-typing">AI 正在思考中...</span>}
                          </div>
                        )}
                      </div>
                    )}
                    {msg.role === "assistant" ? (
                      msg.content ? (
                        <div className="qw-answer-text">{msg.content}</div>
                      ) : msg.thinking?.status === "done" ? (
                        <span className="qw-answer-loading">正在整理回答...</span>
                      ) : (
                        !msg.thinking && <span className="qw-typing">AI 正在思考中...</span>
                      )
                    ) : (
                      msg.content
                    )}
                  </div>
                  {msg.role === "user" && <div className="qw-avatar user">我</div>}
                </div>
              ))
            )}
            <div ref={chatEndRef} className="qw-scroll-anchor" />
          </div>
        </div>

        <div className="qw-input-wrapper">
          <div className="qw-input-toolbar">
            <label className="qw-toggle">
              <input type="checkbox" checked={useQwen} onChange={(e) => setUseQwen(e.target.checked)} />
              <div className="qw-toggle-track"></div>
              <span>启用 Qwen 生成增强</span>
            </label>
            <label className="qw-toggle">
              <input type="checkbox" checked={useStreamWS} onChange={(e) => setUseStreamWS(e.target.checked)} />
              <div className="qw-toggle-track"></div>
              <span>启用 WebSocket 流式</span>
            </label>
            <div className="qw-flex-spacer"></div>
            {useStreamWS && (
              <button className="qw-btn-text qw-text-danger" onClick={() => socket.disconnect()}>
                断开 WS
              </button>
            )}
            <button
              className="qw-btn-text"
              disabled={!canOperateDoc}
              onClick={() => runSafely(async () => {
                const data = await retrievalDebug({
                  query: question,
                  kb_ids: enabledKbIds.length ? enabledKbIds : activeKbId ? [activeKbId] : undefined,
                  document_ids: enabledDocIds,
                  top_k: sessionConfig.retrieval_top_k,
                  score_threshold: sessionConfig.score_threshold,
                  fusion_mode: sessionConfig.fusion_mode,
                  alpha: sessionConfig.alpha
                });
                setDebugJson(JSON.stringify(data, null, 2));
                setError("检索调试已完成，请在右侧面板底部查看结果。");
              })}
            >
              检索调试
            </button>
            {canShowAcademic && (
              <button
                className="qw-btn-text"
                onClick={() => loadAcademicAnalysis()}
                disabled={academicLoading}
              >
                {academicLoading ? "学业分析中..." : "学业分析"}
              </button>
            )}
          </div>

          <div className="qw-input-box">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="请输入问题，Enter 发送，Shift + Enter 换行"
              rows={1}
            />
            <button
              className="qw-send-btn"
              disabled={!question.trim()}
              onClick={handleSendMessage}
              aria-label="发送消息"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.01 21L23 12L2.01 3L2 10l15 2-15 2z" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>
      </section>

      {canAccessAdminViews && (
        <aside className="qw-right-panel">
          <div className="qw-right-header">
            <div className="qw-right-header-main">
              <div>
                <span className="qw-kicker">控制台面板</span>
                <h3>知识库控制中心</h3>
                <span className="qw-subtitle">右侧面板支持独立滚动，聊天区与输入区保持稳定。</span>
              </div>
              <div className="qw-right-stat-grid">
                <div className="qw-right-stat">
                  <strong>{kbs.length}</strong>
                  <span>知识库</span>
                </div>
                <div className="qw-right-stat">
                  <strong>{docs.length}</strong>
                  <span>文档</span>
                </div>
                <div className="qw-right-stat">
                  <strong>{enabledDocCount}</strong>
                  <span>已启用</span>
                </div>
              </div>
            </div>
            <button
              className="qw-btn qw-btn-primary"
              onClick={() => setCurrentPage("kbadmin")}
            >
              打开管理员知识库中心
            </button>
          </div>

          <div className="qw-right-scroll">
            {renderRightPanelSection(
              "summary",
              "处理摘要",
              <>
                <p className="qw-section-tip">用于快速定位慢点与回答质量问题。</p>
                {latestTimingSummary ? (
                  <div className="qw-grid-form" style={{ marginBottom: 12 }}>
                    <span>profile_ms</span>
                    <strong>{latestTimingSummary.profile_ms}</strong>
                    <span>retrieval_ms</span>
                    <strong>{latestTimingSummary.retrieval_ms}</strong>
                    <span>llm_ms</span>
                    <strong>{latestTimingSummary.llm_ms}</strong>
                    <span>total_ms</span>
                    <strong>{latestTimingSummary.total_ms}</strong>
                    <span>workflow_wait_ms</span>
                    <strong>{latestTimingSummary.workflow_wait_ms}</strong>
                  </div>
                ) : (
                  <div className="qw-empty-text">暂无耗时数据，请先发起一次问答。</div>
                )}
                {latestAssistantThinking?.content ? (
                  <div className="qw-debug-box" style={{ maxHeight: 240 }}>
                    <div className="qw-debug-title">最新处理摘要原文</div>
                    <pre>{latestAssistantThinking.content}</pre>
                  </div>
                ) : (
                  <div className="qw-empty-text">暂无处理摘要内容。</div>
                )}
              </>
            )}

            {renderRightPanelSection(
              "knowledge",
              "知识库管理",
              <>
                <p className="qw-section-tip">创建、选择并启用知识库参与当前会话。</p>
                <div className="qw-compact-row">
                  <input
                    value={kbName}
                    onChange={(e) => setKbName(e.target.value)}
                    placeholder="输入知识库名称"
                    className="qw-flex-1"
                  />
                </div>
                <div className="qw-btn-group">
                  <button
                    className="qw-btn qw-btn-subtle"
                    disabled={!tokenReady}
                    onClick={() => runSafely(async () => {
                      await createKnowledgeBase({
                        name: kbName,
                        description: "前端联调",
                        department: "演示",
                        owner: "admin"
                      });
                      await refreshKnowledgeBaseList();
                    })}
                  >
                    新建知识库
                  </button>
                  <button
                    className="qw-btn qw-btn-subtle"
                    disabled={!tokenReady}
                    onClick={() => runSafely(async () => {
                      await refreshKnowledgeBaseList();
                    })}
                  >
                    刷新列表
                  </button>
                </div>

                <div className="qw-side-list-scroll">
                  <div className="qw-list-container">
                  {kbs.map((kb) => (
                    <div key={kb.id} className={`qw-list-item ${activeKbId === kb.id ? "active" : ""}`}>
                      <div className="qw-item-main">
                        <label className="qw-radio">
                          <input type="radio" checked={activeKbId === kb.id} onChange={() => setActiveKbId(kb.id)} />
                          <span className="qw-truncate">{kb.name} ({kb.document_count})</span>
                        </label>
                        <button
                          className="qw-btn-icon qw-text-danger"
                          onClick={() => runSafely(async () => {
                            await deleteKnowledgeBase(kb.id, true);
                            setEnabledKbIds((prev) => prev.filter((id) => id !== kb.id));
                            if (activeKbId === kb.id) {
                              setActiveKbId("");
                            }
                            await refreshKnowledgeBaseList();
                          })}
                        >
                          删除
                        </button>
                      </div>
                      <label className="qw-checkbox qw-mt-2">
                        <input
                          type="checkbox"
                          checked={enabledKbIds.includes(kb.id)}
                          onChange={(e) => {
                            setEnabledKbIds((prev) => (
                              e.target.checked
                                ? [...new Set([...prev, kb.id])]
                                : prev.filter((id) => id !== kb.id)
                            ));
                          }}
                        />
                        参与当前会话检索
                      </label>
                    </div>
                  ))}
                  </div>
                </div>
              </>
            )}

            {renderRightPanelSection(
              "documents",
              "文档片段管理",
              <>
                <p className="qw-section-tip">维护文档数据，并按需勾选参与问答检索的文档。</p>
                <div className="qw-btn-group">
                  <input
                    type="file"
                    multiple
                    id="doc-upload"
                    className="qw-hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length || !activeKbId) return;
                      runSafely(async () => {
                        await uploadDocuments(activeKbId, files);
                        await refreshDocumentList(activeKbId);
                      });
                    }}
                    disabled={!canOperateDoc}
                  />
                  <label htmlFor="doc-upload" className={`qw-btn qw-btn-subtle ${!canOperateDoc ? "disabled" : ""}`}>
                    上传文档
                  </label>
                  <button
                    className="qw-btn qw-btn-subtle"
                    disabled={!canOperateDoc}
                    onClick={() => runSafely(async () => {
                      await refreshDocumentList(activeKbId);
                    })}
                  >
                    刷新列表
                  </button>
                  <button
                    className="qw-btn qw-btn-subtle qw-text-danger"
                    disabled={!canOperateDoc || selectedDocIds.length === 0}
                    onClick={() => runSafely(async () => {
                      await batchDeleteDocuments(activeKbId, selectedDocIds);
                      await refreshDocumentList(activeKbId);
                    })}
                  >
                    批量删除
                  </button>
                </div>

                <div className="qw-side-list-scroll">
                  <div className="qw-list-container">
                    {docs.length === 0 && <div className="qw-empty-text">暂无文档，请先上传或刷新列表。</div>}
                    {docs.map((doc) => (
                      <div key={doc.id} className="qw-list-item">
                        <div className="qw-item-main">
                          <label className="qw-checkbox">
                            <input
                              type="checkbox"
                              checked={selectedDocIds.includes(doc.id)}
                              onChange={(e) => {
                                setSelectedDocIds((prev) => (
                                  e.target.checked
                                    ? [...prev, doc.id]
                                    : prev.filter((id) => id !== doc.id)
                                ));
                              }}
                            />
                            <span className="qw-truncate" title={doc.file_name}>{doc.file_name}</span>
                          </label>
                          <span className="qw-badge">{doc.chunk_count} 段</span>
                        </div>
                        <label className="qw-checkbox qw-mt-2">
                          <input
                            type="checkbox"
                            checked={enabledDocIds.includes(doc.id)}
                            onChange={(e) => {
                              setEnabledDocIds((prev) => (
                                e.target.checked
                                  ? [...new Set([...prev, doc.id])]
                                  : prev.filter((id) => id !== doc.id)
                              ));
                            }}
                          />
                          参与检索问答
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {renderRightPanelSection(
              "retrieval",
              "检索参数调优",
              <>
                <p className="qw-section-tip">按会话调整召回策略，便于评估检索效果。</p>
                <div className="qw-grid-form">
                  <span>召回数量</span>
                  <input
                    type="number"
                    value={sessionConfig.retrieval_top_k}
                    onChange={(e) => setSessionConfig({ ...sessionConfig, retrieval_top_k: Number(e.target.value) })}
                  />
                  <span>评分阈值</span>
                  <input
                    type="number"
                    step="0.01"
                    value={sessionConfig.score_threshold}
                    onChange={(e) => setSessionConfig({ ...sessionConfig, score_threshold: Number(e.target.value) })}
                  />
                  <span>融合模式</span>
                  <select
                    value={sessionConfig.fusion_mode}
                    onChange={(e) => setSessionConfig({ ...sessionConfig, fusion_mode: e.target.value })}
                  >
                    <option value="weighted">weighted</option>
                    <option value="rrf">rrf</option>
                  </select>
                  <span>融合权重</span>
                  <input
                    type="number"
                    step="0.01"
                    value={sessionConfig.alpha}
                    onChange={(e) => setSessionConfig({ ...sessionConfig, alpha: Number(e.target.value) })}
                  />
                </div>
                <div className="qw-btn-group qw-mt-4">
                  <button
                    className="qw-btn qw-btn-subtle"
                    onClick={() => runSafely(async () => {
                      const data = await getSessionRetrievalConfig(conversationId);
                      setSessionConfig(data);
                    })}
                  >
                    读取会话参数
                  </button>
                  <button
                    className="qw-btn qw-btn-primary qw-flex-1"
                    onClick={() => runSafely(async () => {
                      const data = await updateSessionRetrievalConfig(conversationId, sessionConfig);
                      setSessionConfig(data);
                      saveLocalRetrievalConfig(userRole, retrievalScope, data);
                    })}
                  >
                    应用当前参数
                  </button>
                </div>
              </>
            )}

            {renderRightPanelSection(
              "diagnostics",
              "诊断与日志",
              <>
                <p className="qw-section-tip">查看运行状态、敏感词配置和会话日志。</p>
                <div className="qw-btn-group">
                  <button
                    className="qw-btn qw-btn-subtle"
                    onClick={() => runSafely(async () => {
                      const data = await getRuntimeDebug();
                      setRuntimeJson(JSON.stringify(data, null, 2));
                    })}
                  >
                    获取 Runtime
                  </button>
                  <button
                    className="qw-btn qw-btn-subtle"
                    onClick={() => runSafely(async () => {
                      await setSensitiveWords("违规词,测试词");
                    })}
                  >
                    设置敏感词
                  </button>
                  <button
                    className="qw-btn qw-btn-subtle"
                    onClick={() => runSafely(async () => {
                      const data = await listChatLogs({ limit: 20 });
                      setLogs(data.items);
                    })}
                  >
                    拉取日志
                  </button>
                </div>

                {logs.length > 0 && (
                  <div className="qw-mini-logs">
                    {logs.map((item) => <div key={item.id} className="qw-truncate">{item.question}</div>)}
                  </div>
                )}

                {debugJson && (
                  <div className="qw-debug-box">
                    <div className="qw-debug-title">检索调试结果</div>
                    <pre>{debugJson}</pre>
                  </div>
                )}

                {runtimeJson && (
                  <div className="qw-debug-box">
                    <div className="qw-debug-title">Runtime JSON</div>
                    <pre>{runtimeJson}</pre>
                  </div>
                )}
              </>
            )}
          </div>
        </aside>
      )}
    </main>
  );
}