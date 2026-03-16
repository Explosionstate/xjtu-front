import { useMemo, useState, useRef, useEffect } from "react";
import "./App.css";

import { ssoExchange } from "./api/auth";
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
import type { ChatLogItem, DocumentItem, KnowledgeBaseItem } from "./types/api";
import { setToken } from "./utils/auth";
import { ChatSocket } from "./utils/chatSocket";
import KbDocManagePage from "./pages/KbDocManagePage";
import KbUpdateUploadPage from "./pages/KbUpdateUploadPage";

const socket = new ChatSocket();

const defaultConfig: RetrievalConfig = {
  retrieval_top_k: 8,
  score_threshold: 0.15,
  fusion_mode: "weighted",
  alpha: 0.6
};

type ChatMessage = { role: "user" | "assistant"; content: string; id: number };
type UserRole = "admin" | "student" | "teacher" | "unknown";

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

export default function App() {
  const [currentPage, setCurrentPage] = useState<"ai" | "kbdoc" | "kbops">("ai");
  const [error, setError] = useState("");
  const [tokenReady, setTokenReady] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>("unknown");

  const [kbs, setKbs] = useState<KnowledgeBaseItem[]>([]);
  const [kbName, setKbName] = useState("演示知识库");
  const [activeKbId, setActiveKbId] = useState("");
  const [enabledKbIds, setEnabledKbIds] = useState<string[]>([]);

  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [enabledDocIds, setEnabledDocIds] = useState<string[]>([]);

  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [debugJson, setDebugJson] = useState("");

  const [streamText, setStreamText] = useState("");
  const [conversationId, setConversationId] = useState(`conv-${Date.now()}`);

  const [logs, setLogs] = useState<ChatLogItem[]>([]);
  const [runtimeJson, setRuntimeJson] = useState("");
  const [useQwen, setUseQwen] = useState(false);
  const [useStreamWS, setUseStreamWS] = useState(false);

  const [sessionConfig, setSessionConfig] = useState<RetrievalConfig>(defaultConfig);
  const canOperateDoc = useMemo(() => Boolean(activeKbId), [activeKbId]);
  const isRoleLimited = tokenReady && userRole !== "admin";
  const canAccessAdminViews = !isRoleLimited;

  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, streamText, answer]);

  async function runSafely(task: () => Promise<void>) {
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message || "操作失败");
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticket = params.get("sso_ticket");
    if (!ticket) return;

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

  const handleSendMessage = () => {
    if (!question.trim()) return;
    const currentQuestion = question;
    setQuestion("");

    setChatHistory((prev) => [
      ...prev,
      { id: Date.now(), role: "user", content: currentQuestion },
      { id: Date.now() + 1, role: "assistant", content: "" }
    ]);

    if (useStreamWS) {
      setStreamText("");
      socket.connect({
        onDelta: (txt) => {
          setStreamText((prev) => prev + txt);
          setChatHistory((prev) => {
            const newHistory = [...prev];
            const lastIdx = newHistory.length - 1;
            if (newHistory[lastIdx].role === "assistant") {
              newHistory[lastIdx].content += txt;
            }
            return newHistory;
          });
        },
        onError: (msg) => setError(msg)
      });

      runSafely(async () => {
        socket.send({
          conversation_id: conversationId,
          kb_ids: enabledKbIds.length ? enabledKbIds : activeKbId ? [activeKbId] : undefined,
          document_ids: enabledDocIds,
          llm_enabled: useQwen,
          messages: [{ role: "user", content: currentQuestion }]
        });
      });
    } else {
      runSafely(async () => {
        const data = await chatCompletions({
          kb_ids: enabledKbIds.length ? enabledKbIds : activeKbId ? [activeKbId] : undefined,
          document_ids: enabledDocIds,
          llm_enabled: useQwen,
          conversation_id: conversationId,
          messages: [{ role: "user", content: currentQuestion }]
        });
        const resultText = data.choices[0].message.content;
        setAnswer(resultText);
        setChatHistory((prev) => {
          const newHistory = [...prev];
          const lastIdx = newHistory.length - 1;
          if (newHistory[lastIdx].role === "assistant") {
            newHistory[lastIdx].content = resultText;
          }
          return newHistory;
        });
      });
    }
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

  return (
    <main className={`qw-layout${isRoleLimited ? " qw-layout-limited" : ""}`}>
      <aside className="qw-sidebar">
        <div className="qw-brand">
          <div className="qw-logo">AI</div>
          <div className="qw-brand-copy">
            <strong>西交 AI 智能体</strong>
            <span>Knowledge & Chatbot</span>
          </div>
        </div>

        {canAccessAdminViews && (
        <div className="qw-sidebar-actions">
          <button className="qw-btn qw-btn-subtle" onClick={() => setCurrentPage("kbdoc")}>
            知识库编辑与文档上传
          </button>
          <button className="qw-btn qw-btn-subtle" onClick={() => setCurrentPage("kbops")}>
            知识库更新与批量上传
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
          <svg className="plus-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          新建会话
        </button>

        <div className="qw-history-list">
          <div className="qw-history-title">近期记录</div>
          <div className="qw-history-item active">
            <span className="qw-history-name">当前正在进行的会话</span>
            <span className="qw-session-badge">{conversationId.slice(-6)}</span>
          </div>
          {/* 这里可以保留之前的静态提示，或者对接真实历史 */}
          <p className="qw-history-tip">新建会话会清空当前消息上下文。</p>
        </div>
      </aside>

      <section className="qw-main-chat">
        <header className="qw-chat-header">
          <div>
            <h1>智能体协作平台</h1>
          </div>
          <div className="qw-chat-meta">
            <span>Session: </span>
            <code>{conversationId.slice(-8)}</code>
          </div>
        </header>

        {error && <div className="qw-toast-error">{error}</div>}

        <div className="qw-chat-scroll">
          <div className="qw-chat-container">
            {chatHistory.length === 0 ? (
              <div className="qw-empty-state">
                <h2>👋 你好，我是西交 AI 助手</h2>
                <p>我可以帮助你进行知识库检索、文档分析，或者提供创意灵感。请尝试提问：</p>
                <div className="qw-empty-hints">
                  <span onClick={() => setQuestion("总结本周新增文档的重点结论")}>🚀 示例：总结本周新增文档的重点结论</span>
                  <span onClick={() => setQuestion("根据知识库解释某个技术概念")}>💡 示例：根据知识库解释某个技术概念</span>
                </div>
              </div>
            ) : (
              chatHistory.map((msg, idx) => (
                <div key={idx} className={`qw-msg-row ${msg.role === "assistant" ? "ai" : "user"}`}>
                  {msg.role === "assistant" && <div className="qw-avatar ai">AI</div>}
                  <div className="qw-bubble">
                    {msg.role === "assistant" && msg.content === "" ? (
                      <span className="qw-typing">AI 正在思考中...</span>
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
              <span>启用 Qwen3.5 增强</span>
            </label>
            <label className="qw-toggle">
              <input type="checkbox" checked={useStreamWS} onChange={(e) => setUseStreamWS(e.target.checked)} />
              <div className="qw-toggle-track"></div>
              <span>启用 WebSocket 流式</span>
            </label>
            <div className="qw-flex-spacer"></div>
            {useStreamWS && (
              <button className="qw-btn-text qw-text-danger" onClick={() => socket.disconnect()}>断开 WS</button>
            )}
            <button className="qw-btn-text" disabled={!canOperateDoc} onClick={() => runSafely(async () => {
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
            })}>
              检索调试
            </button>
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
            <button className="qw-send-btn" disabled={!question.trim()} onClick={handleSendMessage} aria-label="发送消息">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.01 21L23 12L2.01 3L2 10l15 2-15 2z" fill="currentColor"/>
              </svg>
            </button>
          </div>
          <p className="qw-input-tip">回答会优先参考当前勾选的知识库和文档范围。</p>
        </div>
      </section>

      {canAccessAdminViews && (
      <aside className="qw-right-panel">
        <div className="qw-right-header">
          <h3>控制台面板</h3>
          <span className="qw-subtitle">配置知识库与调试参数</span>
        </div>

        <div className="qw-right-scroll">
          <details className="qw-accordion" open>
            <summary>知识库管理</summary>
            <div className="qw-accordion-content">
              <p className="qw-section-tip">创建、选择并启用知识库参与当前会话。</p>
              <div className="qw-compact-row">
                <input value={kbName} onChange={(e) => setKbName(e.target.value)} placeholder="输入知识库名称" className="qw-flex-1" />
              </div>
              <div className="qw-btn-group">
                <button className="qw-btn qw-btn-subtle" disabled={!tokenReady} onClick={() => runSafely(async () => {
                  await createKnowledgeBase({ name: kbName, description: "前端联调", department: "演示", owner: "admin" });
                  const result = await listKnowledgeBases({ limit: 50 });
                  setKbs(result.items);
                  if (!activeKbId && result.items.length) setActiveKbId(result.items[0].id);
                  if (!enabledKbIds.length && result.items.length) setEnabledKbIds([result.items[0].id]);
                })}>新建知识库</button>
                <button className="qw-btn qw-btn-subtle" disabled={!tokenReady} onClick={() => runSafely(async () => {
                  const result = await listKnowledgeBases({ limit: 50 });
                  setKbs(result.items);
                })}>刷新列表</button>
              </div>

              <div className="qw-list-container">
                {kbs.map((kb) => (
                  <div key={kb.id} className={`qw-list-item ${activeKbId === kb.id ? "active" : ""}`}>
                    <div className="qw-item-main">
                      <label className="qw-radio">
                        <input type="radio" checked={activeKbId === kb.id} onChange={() => setActiveKbId(kb.id)} />
                        <span className="qw-truncate">{kb.name} ({kb.document_count})</span>
                      </label>
                      <button className="qw-btn-icon qw-text-danger" onClick={() => runSafely(async () => {
                        await deleteKnowledgeBase(kb.id, true);
                        const result = await listKnowledgeBases({ limit: 50 });
                        setKbs(result.items);
                        if (activeKbId === kb.id) setActiveKbId("");
                      })}>删除</button>
                    </div>
                    <label className="qw-checkbox qw-mt-2">
                      <input type="checkbox" checked={enabledKbIds.includes(kb.id)} onChange={(e) => {
                        setEnabledKbIds((prev) => e.target.checked ? [...new Set([...prev, kb.id])] : prev.filter((id) => id !== kb.id));
                      }} /> 参与当前会话检索
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </details>

          <details className="qw-accordion">
            <summary>文档片段管理</summary>
            <div className="qw-accordion-content">
              <p className="qw-section-tip">维护文档数据，按需勾选参与问答检索的文档。</p>
              <div className="qw-btn-group">
                <input type="file" multiple id="doc-upload" className="qw-hidden" onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (!files.length || !activeKbId) return;
                  runSafely(async () => {
                    await uploadDocuments(activeKbId, files);
                    const result = await listDocuments(activeKbId);
                    setDocs(result.items);
                  });
                }} disabled={!canOperateDoc} />
                <label htmlFor="doc-upload" className={`qw-btn qw-btn-subtle ${!canOperateDoc ? "disabled" : ""}`}>上传文档</label>
                <button className="qw-btn qw-btn-subtle" disabled={!canOperateDoc} onClick={() => runSafely(async () => {
                  const result = await listDocuments(activeKbId);
                  setDocs(result.items);
                })}>刷新列表</button>
                <button className="qw-btn qw-btn-subtle qw-text-danger" disabled={!canOperateDoc || selectedDocIds.length === 0} onClick={() => runSafely(async () => {
                  await batchDeleteDocuments(activeKbId, selectedDocIds);
                  const result = await listDocuments(activeKbId);
                  setDocs(result.items);
                  setSelectedDocIds([]);
                })}>批量删除</button>
              </div>

              <div className="qw-list-container">
                {docs.length === 0 && <div className="qw-empty-text">暂无文档，请先上传或刷新列表。</div>}
                {docs.map((doc) => (
                  <div key={doc.id} className="qw-list-item">
                    <div className="qw-item-main">
                      <label className="qw-checkbox">
                        <input type="checkbox" checked={selectedDocIds.includes(doc.id)} onChange={(e) => {
                          setSelectedDocIds((prev) => e.target.checked ? [...prev, doc.id] : prev.filter((id) => id !== doc.id));
                        }} />
                        <span className="qw-truncate" title={doc.file_name}>{doc.file_name}</span>
                      </label>
                      <span className="qw-badge">{doc.chunk_count} 段</span>
                    </div>
                    <label className="qw-checkbox qw-mt-2">
                      <input type="checkbox" checked={enabledDocIds.includes(doc.id)} onChange={(e) => {
                        setEnabledDocIds((prev) => e.target.checked ? [...new Set([...prev, doc.id])] : prev.filter((id) => id !== doc.id));
                      }} /> 参与检索问答
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </details>

          <details className="qw-accordion">
            <summary>检索参数调优</summary>
            <div className="qw-accordion-content">
              <p className="qw-section-tip">按会话调整召回策略，便于评估检索效果。</p>
              <div className="qw-grid-form">
                <span>召回数量</span>
                <input type="number" value={sessionConfig.retrieval_top_k} onChange={(e) => setSessionConfig({ ...sessionConfig, retrieval_top_k: Number(e.target.value) })} />
                <span>评分阈值</span>
                <input type="number" step="0.01" value={sessionConfig.score_threshold} onChange={(e) => setSessionConfig({ ...sessionConfig, score_threshold: Number(e.target.value) })} />
                <span>融合模式</span>
                <select value={sessionConfig.fusion_mode} onChange={(e) => setSessionConfig({ ...sessionConfig, fusion_mode: e.target.value })}>
                  <option value="weighted">weighted</option>
                  <option value="rrf">rrf</option>
                </select>
                <span>融合权重</span>
                <input type="number" step="0.01" value={sessionConfig.alpha} onChange={(e) => setSessionConfig({ ...sessionConfig, alpha: Number(e.target.value) })} />
              </div>
              <div className="qw-btn-group qw-mt-4">
                <button className="qw-btn qw-btn-subtle" onClick={() => runSafely(async () => {
                  const data = await getSessionRetrievalConfig(conversationId);
                  setSessionConfig(data);
                })}>读取会话参数</button>
                <button className="qw-btn qw-btn-primary qw-flex-1" onClick={() => runSafely(async () => {
                  const data = await updateSessionRetrievalConfig(conversationId, sessionConfig);
                  setSessionConfig(data);
                })}>应用当前参数</button>
              </div>
            </div>
          </details>

          <details className="qw-accordion">
            <summary>诊断与日志</summary>
            <div className="qw-accordion-content">
              <p className="qw-section-tip">用于查看运行状态、测试敏感词和检索/会话日志。</p>
              <div className="qw-btn-group">
                <button className="qw-btn qw-btn-subtle" onClick={() => runSafely(async () => {
                  const data = await getRuntimeDebug();
                  setRuntimeJson(JSON.stringify(data, null, 2));
                })}>获取 Runtime</button>
                <button className="qw-btn qw-btn-subtle" onClick={() => runSafely(async () => setSensitiveWords("违规词,测试词"))}>设置敏感词</button>
                <button className="qw-btn qw-btn-subtle" onClick={() => runSafely(async () => {
                  const data = await listChatLogs({ limit: 20 });
                  setLogs(data.items);
                })}>拉取日志</button>
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
            </div>
          </details>
        </div>
      </aside>
      )}
    </main>
  );
}
