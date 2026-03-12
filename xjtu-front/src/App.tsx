import { useMemo, useState } from "react";
import { login } from "./api/auth";
import { chatCompletions, retrievalDebug } from "./api/chat";
import { setSensitiveWords } from "./api/config";
import { batchDeleteDocuments, listDocuments, uploadDocuments } from "./api/documents";
import { createKnowledgeBase, deleteKnowledgeBase, listKnowledgeBases } from "./api/knowledgeBases";
import { cleanupLogs, listChatLogs } from "./api/logs";
import type { ChatLogItem, DocumentItem, KnowledgeBaseItem } from "./types/api";
import { setToken } from "./utils/auth";
import { ChatSocket } from "./utils/chatSocket";

const socket = new ChatSocket();

export default function App() {
  const [error, setError] = useState("");
  const [tokenReady, setTokenReady] = useState(false);
  const [loginName, setLoginName] = useState("admin");
  const [password, setPassword] = useState("admin123");

  const [kbs, setKbs] = useState<KnowledgeBaseItem[]>([]);
  const [kbName, setKbName] = useState("demo-kb");
  const [activeKbId, setActiveKbId] = useState("");

  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

  const [question, setQuestion] = useState("葡萄常见品种有哪些");
  const [answer, setAnswer] = useState("");
  const [debugJson, setDebugJson] = useState("");

  const [streamText, setStreamText] = useState("");
  const [streamConversationId, setStreamConversationId] = useState("conv-websocket-demo");

  const [logs, setLogs] = useState<ChatLogItem[]>([]);
  const [keyword, setKeyword] = useState("");

  const canOperateDoc = useMemo(() => Boolean(activeKbId), [activeKbId]);

  async function runSafely(task: () => Promise<void>) {
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message || "Operation failed");
    }
  }

  return (
    <main className="container">
      <h1>xjtu-front integration template</h1>
      <p className="hint">Recommended call order: Login - KB - Documents - Chat - Logs - Config</p>
      {error ? <div className="error">{error}</div> : null}

      <section>
        <h2>1) Login</h2>
        <div className="row">
          <input value={loginName} onChange={(e) => setLoginName(e.target.value)} placeholder="login_name" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="password" />
          <button
            onClick={() =>
              runSafely(async () => {
                const data = await login(loginName, password);
                setToken(data.access_token);
                setTokenReady(true);
              })
            }
          >
            Login
          </button>
        </div>
      </section>

      <section>
        <h2>2) Knowledge Bases</h2>
        <div className="row">
          <input value={kbName} onChange={(e) => setKbName(e.target.value)} placeholder="kb name" />
          <button
            disabled={!tokenReady}
            onClick={() =>
              runSafely(async () => {
                await createKnowledgeBase({
                  name: kbName,
                  description: "frontend demo kb",
                  department: "demo",
                  owner: "admin"
                });
                const result = await listKnowledgeBases({ limit: 50 });
                setKbs(result.items);
                if (!activeKbId && result.items.length) setActiveKbId(result.items[0].id);
              })
            }
          >
            Create + Refresh
          </button>
          <button
            disabled={!tokenReady}
            onClick={() =>
              runSafely(async () => {
                const result = await listKnowledgeBases({ limit: 50 });
                setKbs(result.items);
              })
            }
          >
            Refresh
          </button>
        </div>
        <ul>
          {kbs.map((kb) => (
            <li key={kb.id}>
              <label>
                <input
                  type="radio"
                  name="activeKb"
                  checked={activeKbId === kb.id}
                  onChange={() => setActiveKbId(kb.id)}
                />
                {kb.name} ({kb.document_count})
              </label>
              <button
                onClick={() =>
                  runSafely(async () => {
                    const resp = await deleteKnowledgeBase(kb.id, true);
                    const result = await listKnowledgeBases({ limit: 50 });
                    setKbs(result.items);
                    if (activeKbId === kb.id) setActiveKbId("");
                    if (resp.cleanup_queued) {
                      setError("Vectorstore cleanup queued in background");
                    }
                  })
                }
              >
                Physical Delete
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>3) Documents</h2>
        <div className="row">
          <input
            type="file"
            multiple
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (!files.length || !activeKbId) return;
              runSafely(async () => {
                await uploadDocuments(activeKbId, files);
                const result = await listDocuments(activeKbId);
                setDocs(result.items);
              });
            }}
            disabled={!canOperateDoc}
          />
          <button
            disabled={!canOperateDoc}
            onClick={() =>
              runSafely(async () => {
                const result = await listDocuments(activeKbId);
                setDocs(result.items);
              })
            }
          >
            Refresh Docs
          </button>
          <button
            disabled={!canOperateDoc || selectedDocIds.length === 0}
            onClick={() =>
              runSafely(async () => {
                await batchDeleteDocuments(activeKbId, selectedDocIds);
                const result = await listDocuments(activeKbId);
                setDocs(result.items);
                setSelectedDocIds([]);
              })
            }
          >
            Batch Delete
          </button>
        </div>
        <ul>
          {docs.map((doc) => (
            <li key={doc.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selectedDocIds.includes(doc.id)}
                  onChange={(e) => {
                    setSelectedDocIds((prev) =>
                      e.target.checked ? [...prev, doc.id] : prev.filter((id) => id !== doc.id)
                    );
                  }}
                />
                {doc.file_name} ({doc.chunk_count} chunks)
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>4) Chat + Retrieval Debug</h2>
        <div className="row">
          <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="ask something" />
          <button
            disabled={!canOperateDoc}
            onClick={() =>
              runSafely(async () => {
                const data = await retrievalDebug({ query: question, kb_ids: [activeKbId], top_k: 8 });
                setDebugJson(JSON.stringify(data, null, 2));
              })
            }
          >
            Retrieval Debug
          </button>
          <button
            disabled={!canOperateDoc}
            onClick={() =>
              runSafely(async () => {
                const data = await chatCompletions({
                  kb_ids: [activeKbId],
                  conversation_id: `conv-ui-${Date.now()}`,
                  messages: [{ role: "user", content: question }]
                });
                setAnswer(data.choices[0].message.content);
              })
            }
          >
            Ask REST
          </button>
        </div>
        <pre>{answer}</pre>
        <details>
          <summary>Debug scores</summary>
          <pre>{debugJson}</pre>
        </details>

        <div className="row">
          <input
            value={streamConversationId}
            onChange={(e) => setStreamConversationId(e.target.value)}
            placeholder="conversation id"
          />
          <button
            onClick={() => {
              setStreamText("");
              socket.connect({
                onDelta: (txt) => setStreamText((prev) => prev + txt),
                onError: (msg) => setError(msg)
              });
            }}
          >
            Connect WS
          </button>
          <button
            onClick={() =>
              runSafely(async () => {
                socket.send({
                  conversation_id: streamConversationId,
                  kb_ids: activeKbId ? [activeKbId] : undefined,
                  messages: [{ role: "user", content: question }]
                });
              })
            }
          >
            Send WS
          </button>
          <button onClick={() => socket.disconnect()}>Disconnect WS</button>
        </div>
        <pre>{streamText}</pre>
      </section>

      <section>
        <h2>5) Logs</h2>
        <div className="row">
          <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="keyword" />
          <button
            onClick={() =>
              runSafely(async () => {
                const data = await listChatLogs({ keyword, limit: 20 });
                setLogs(data.items);
              })
            }
          >
            Query Logs
          </button>
          <button
            onClick={() =>
              runSafely(async () => {
                await cleanupLogs(30);
              })
            }
          >
            Cleanup 30d
          </button>
        </div>
        <ul>
          {logs.map((item) => (
            <li key={item.id}>
              {item.created_at} | {item.question} | {item.elapsed_ms}ms
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>6) Config</h2>
        <button
          onClick={() =>
            runSafely(async () => {
              await setSensitiveWords("违规词,测试词");
            })
          }
        >
          Set demo sensitive words
        </button>
      </section>
    </main>
  );
}
