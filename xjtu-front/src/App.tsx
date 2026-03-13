import { useMemo, useState, useRef, useEffect } from "react";
import "./App.css";

import { login, ssoExchange } from "./api/auth";
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

export default function App() {
  const [currentPage, setCurrentPage] = useState<"ai" | "kbdoc" | "kbops">("ai");
  const [error, setError] = useState("");
  const [tokenReady, setTokenReady] = useState(false);

  const [loginName, setLoginName] = useState("admin");
  const [password, setPassword] = useState("admin123");

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

    // Remove sso_ticket from URL immediately to avoid duplicate exchange
    // in React StrictMode development double-invocation.
    params.delete("sso_ticket");
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", nextUrl);

    runSafely(async () => {
      const data = await ssoExchange(ticket);
      setToken(data.access_token);
      setTokenReady(true);
      setLoginName(data.login_name);
      setPassword("");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  if (currentPage === "kbdoc") {
    return (
      <main className="qw-layout" style={{ display: "block", minHeight: "100vh" }}>
        <div style={{ padding: 16 }}>
          <button className="qw-btn qw-btn-subtle" onClick={() => setCurrentPage("ai")}>返回 AI 主界面</button>
        </div>
        <KbDocManagePage onError={setError} />
        {error && <div className="qw-toast-error" style={{ margin: "0 16px 16px" }}>{error}</div>}
      </main>
    );
  }

  if (currentPage === "kbops") {
    return <KbUpdateUploadPage onError={setError} onBack={() => setCurrentPage("ai")} />;
  }

  return (
    <main className="qw-layout">
      {/* ==================== 左侧边栏 ==================== */}
      <aside className="qw-sidebar">
        <div className="qw-brand">
          <div className="qw-logo">🌌</div>
          <span>西交 AI 助手</span>
        </div>

        <button className="qw-btn qw-btn-subtle" onClick={() => setCurrentPage("kbdoc")}>专用：知识库编辑/文档上传</button>
        <button className="qw-btn qw-btn-subtle" onClick={() => setCurrentPage("kbops")}>专用：PUT更新/批量上传</button>

        <button
          className="qw-btn qw-btn-primary qw-new-chat-btn"
          onClick={() => {
            setConversationId(`conv-${Date.now()}`);
            setChatHistory([]);
            setQuestion("");
          }}
        >
          <span className="plus-icon">+</span> 新建对话
        </button>

        <div className="qw-history-list">
          <div className="qw-history-title">会话历史</div>
          <div className="qw-history-item active">
            💬 当前会话 <span className="qw-session-badge">{conversationId.slice(-6)}</span>
          </div>
        </div>

        {/* 底部保留登录入口，设计成低调的样式 */}
        <div className="qw-auth-zone">
          <div className="qw-auth-inputs">
            <input value={loginName} onChange={(e) => setLoginName(e.target.value)} placeholder="用户名" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="密码" />
          </div>
          <button className="qw-btn qw-btn-outline" onClick={() => runSafely(async () => {
            const data = await login(loginName, password);
            setToken(data.access_token);
            setTokenReady(true);
          })}>
            {tokenReady ? "已登录 (刷新Token)" : "登录系统"}
          </button>
        </div>
      </aside>

      {/* ==================== 中间主对话区 ==================== */}
      <section className="qw-main-chat">
        {error && <div className="qw-toast-error">{error}</div>}

        <div className="qw-chat-scroll">
          <div className="qw-chat-container">
            {chatHistory.length === 0 ? (
              <div className="qw-empty-state">
                <div className="qw-greet-icon">✨</div>
                <h2>你好，我是西交 AI 助手</h2>
                <p>很高兴遇见你，你可以基于已勾选的知识库向我提问，或者进行检索测试。</p>
              </div>
            ) : (
              chatHistory.map((msg, idx) => (
                <div key={idx} className={`qw-msg-row ${msg.role}`}>
                  {msg.role === "assistant" && <div className="qw-avatar ai">AI</div>}
                  <div className="qw-bubble">
                    {msg.role === "assistant" && msg.content === "" ? (
                      <span className="qw-typing">思考中...</span>
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

        {/* 底部输入区 - 悬浮样式 */}
        <div className="qw-input-wrapper">
          <div className="qw-input-toolbar">
            <label className="qw-toggle">
              <input type="checkbox" checked={useQwen} onChange={(e) => setUseQwen(e.target.checked)} />
              <div className="qw-toggle-track"></div>
              <span>Qwen3.5大模型</span>
            </label>
            <label className="qw-toggle">
              <input type="checkbox" checked={useStreamWS} onChange={(e) => setUseStreamWS(e.target.checked)} />
              <div className="qw-toggle-track"></div>
              <span>流式 WebSocket</span>
            </label>
            <div className="qw-flex-spacer"></div>
            {useStreamWS && (
               <button className="qw-btn-text qw-text-danger" onClick={() => socket.disconnect()}>断开WS</button>
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
              setError("检索调试已完成，请在右侧面板底部查看详情");
            })}>
              🔍 检索调试
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
              placeholder="输入问题，按 Enter 发送，Shift + Enter 换行..."
              rows={1}
            />
            <button className="qw-send-btn" disabled={!question.trim()} onClick={handleSendMessage}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2.01 21L23 12L2.01 3L2 10l15 2-15 2z" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </div>
      </section>

      {/* ==================== 右侧控制台 (高级感折叠面板) ==================== */}
      <aside className="qw-right-panel">
        <div className="qw-right-header">
          <h3>控制台面板</h3>
          <span className="qw-subtitle">Admin Settings</span>
        </div>

        <div className="qw-right-scroll">

          {/* 1. 知识库管理 */}
          <details className="qw-accordion" open>
            <summary>📚 知识库管理</summary>
            <div className="qw-accordion-content">
              <div className="qw-compact-row">
                <input value={kbName} onChange={(e) => setKbName(e.target.value)} placeholder="新知识库名称" className="qw-flex-1" />
              </div>
              <div className="qw-btn-group">
                <button className="qw-btn qw-btn-subtle" disabled={!tokenReady} onClick={() => runSafely(async () => {
                  await createKnowledgeBase({ name: kbName, description: "前端联调", department: "演示", owner: "admin" });
                  const result = await listKnowledgeBases({ limit: 50 });
                  setKbs(result.items);
                  if (!activeKbId && result.items.length) setActiveKbId(result.items[0].id);
                  if (!enabledKbIds.length && result.items.length) setEnabledKbIds([result.items[0].id]);
                })}>新建KB</button>
                <button className="qw-btn qw-btn-subtle" disabled={!tokenReady} onClick={() => runSafely(async () => {
                  const result = await listKnowledgeBases({ limit: 50 });
                  setKbs(result.items);
                })}>刷新</button>
              </div>

              <div className="qw-list-container">
                {kbs.map((kb) => (
                  <div key={kb.id} className={`qw-list-item ${activeKbId === kb.id ? 'active' : ''}`}>
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
                      })}>删</button>
                    </div>
                    <label className="qw-checkbox qw-mt-2">
                      <input type="checkbox" checked={enabledKbIds.includes(kb.id)} onChange={(e) => {
                        setEnabledKbIds((prev) => e.target.checked ? [...new Set([...prev, kb.id])] : prev.filter((id) => id !== kb.id));
                      }} /> 启用此知识库问答
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </details>

          {/* 2. 文档管理 */}
          <details className="qw-accordion" open>
            <summary>📄 文档片段管理</summary>
            <div className="qw-accordion-content">
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
                <label htmlFor="doc-upload" className={`qw-btn qw-btn-subtle ${!canOperateDoc?'disabled':''}`}>上传文档</label>
                <button className="qw-btn qw-btn-subtle" disabled={!canOperateDoc} onClick={() => runSafely(async () => {
                  const result = await listDocuments(activeKbId);
                  setDocs(result.items);
                })}>刷新</button>
                <button className="qw-btn qw-btn-subtle qw-text-danger" disabled={!canOperateDoc || selectedDocIds.length === 0} onClick={() => runSafely(async () => {
                  await batchDeleteDocuments(activeKbId, selectedDocIds);
                  const result = await listDocuments(activeKbId);
                  setDocs(result.items);
                  setSelectedDocIds([]);
                })}>批量删</button>
              </div>

              <div className="qw-list-container">
                {docs.length === 0 && <div className="qw-empty-text">请先选择或上传文档</div>}
                {docs.map((doc) => (
                  <div key={doc.id} className="qw-list-item">
                     <div className="qw-item-main">
                        <label className="qw-checkbox">
                          <input type="checkbox" checked={selectedDocIds.includes(doc.id)} onChange={(e) => {
                            setSelectedDocIds((prev) => e.target.checked ? [...prev, doc.id] : prev.filter((id) => id !== doc.id));
                          }} />
                          <span className="qw-truncate" title={doc.file_name}>{doc.file_name}</span>
                        </label>
                        <span className="qw-badge">{doc.chunk_count}段</span>
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

          {/* 3. 会话调参 */}
          <details className="qw-accordion">
            <summary>⚙️ 核心检索调参</summary>
            <div className="qw-accordion-content">
              <div className="qw-grid-form">
                <span>召回数量</span>
                <input type="number" value={sessionConfig.retrieval_top_k} onChange={(e) => setSessionConfig({ ...sessionConfig, retrieval_top_k: Number(e.target.value) })} />
                <span>分数阈值</span>
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
                })}>读取</button>
                <button className="qw-btn qw-btn-primary qw-flex-1" onClick={() => runSafely(async () => {
                  const data = await updateSessionRetrievalConfig(conversationId, sessionConfig);
                  setSessionConfig(data);
                })}>应用当前参数</button>
              </div>
            </div>
          </details>

          {/* 4. 日志与调试 (底层数据) */}
          <details className="qw-accordion">
            <summary>🛠 诊断与日志</summary>
            <div className="qw-accordion-content">
              <div className="qw-btn-group">
                 <button className="qw-btn qw-btn-subtle" onClick={() => runSafely(async () => {
                  const data = await getRuntimeDebug();
                  setRuntimeJson(JSON.stringify(data, null, 2));
                })}>系统 Runtime</button>
                <button className="qw-btn qw-btn-subtle" onClick={() => runSafely(async () => setSensitiveWords("违规词,测试词"))}>设敏感词</button>
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
                  <div className="qw-debug-title">检索打分 Debug</div>
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
    </main>
  );
}
