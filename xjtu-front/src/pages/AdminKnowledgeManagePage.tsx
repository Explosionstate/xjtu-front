import { useEffect, useMemo, useState } from "react";

import { batchDeleteDocuments, deleteDocument, listDocuments, uploadDocuments } from "../api/documents";
import {
  createKnowledgeBase,
  deleteKnowledgeBase,
  listKnowledgeBases,
  rebuildKnowledgeBaseVectorstore,
  type KnowledgeBaseUpdatePayload,
  updateKnowledgeBase
} from "../api/knowledgeBases";
import {
  getSessionRetrievalConfig,
  updateSessionRetrievalConfig,
  type RetrievalConfig
} from "../api/retrievalConfig";
import type { DocumentItem, KnowledgeBaseItem } from "../types/api";

const defaultConfig: RetrievalConfig = {
  retrieval_top_k: 4,
  score_threshold: 0.25,
  fusion_mode: "weighted",
  alpha: 0.55
};

type Props = {
  conversationId: string;
  onBack: () => void;
  onError: (message: string) => void;
  onApplyRetrievalConfig: (config: RetrievalConfig) => void;
};

export default function AdminKnowledgeManagePage({
  conversationId,
  onBack,
  onError,
  onApplyRetrievalConfig
}: Props) {
  const [kbs, setKbs] = useState<KnowledgeBaseItem[]>([]);
  const [kbName, setKbName] = useState("演示知识库");
  const [activeKbId, setActiveKbId] = useState("");
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [sessionConfig, setSessionConfig] = useState<RetrievalConfig>(defaultConfig);

  // 统一定义提示信息
  const [tip, setTip] = useState("");
  const [localError, setLocalError] = useState("");

  const [form, setForm] = useState<KnowledgeBaseUpdatePayload>({
    name: "",
    description: "",
    department: "",
    owner: "",
    embedding_model: ""
  });

  const canOperateDoc = useMemo(() => Boolean(activeKbId), [activeKbId]);
  const activeKb = useMemo(
    () => kbs.find((item) => item.id === activeKbId) || null,
    [kbs, activeKbId]
  );

  // 临时显示提示信息的辅助函数
  function showMessage(msg: string, isError = false) {
    if (isError) {
      setLocalError(msg);
      setTip("");
      onError(msg);
    } else {
      setTip(msg);
      setLocalError("");
    }
    // 可选：3秒后自动清除提示
    setTimeout(() => {
      setTip("");
      setLocalError("");
    }, 3000);
  }

  async function refreshKbs() {
    const result = await listKnowledgeBases({ limit: 100 });
    setKbs(result.items);
    if (!result.items.length) {
      setActiveKbId("");
      return;
    }
    if (!activeKbId || !result.items.some((item) => item.id === activeKbId)) {
      setActiveKbId(result.items[0].id);
    }
  }

  async function refreshDocs(targetKbId: string) {
    if (!targetKbId) {
      setDocs([]);
      setSelectedDocIds([]);
      return;
    }
    const result = await listDocuments(targetKbId);
    setDocs(result.items);
    setSelectedDocIds([]);
  }

  useEffect(() => {
    refreshKbs().catch((e) => showMessage((e as Error).message || "知识库加载失败", true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getSessionRetrievalConfig(conversationId)
      .then((config) => setSessionConfig(config))
      .catch((e) => showMessage((e as Error).message || "读取检索参数失败", true));
  }, [conversationId]);

  useEffect(() => {
    if (!activeKb) {
      setForm({ name: "", description: "", department: "", owner: "", embedding_model: "" });
      setDocs([]);
      setSelectedDocIds([]);
      return;
    }
    setForm({
      name: activeKb.name,
      description: activeKb.description,
      department: activeKb.department,
      owner: activeKb.owner,
      embedding_model: activeKb.embedding_model
    });
    refreshDocs(activeKb.id).catch((e) => showMessage((e as Error).message || "文档加载失败", true));
  }, [activeKb]);

  return (
    <main
      className="qw-layout"
      style={{ display: "flex", flexDirection: "column", height: "100vh", backgroundColor: "#f8f9fc", color: "#1c1f23" }}
    >
      {/* 顶部导航与全局提示区 */}
      <header style={{ padding: "12px 24px", backgroundColor: "#fff", borderBottom: "1px solid #e5e6eb", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10, boxShadow: "0 1px 4px rgba(0,0,0,0.02)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button className="qw-btn qw-btn-subtle" onClick={onBack} style={{ color: "#3d3f45" }}>← 返回 AI 主界面</button>
          <h2 style={{ margin: 0, fontSize: "1.25rem", color: "#1c1f23", fontWeight: 600 }}>管理员知识库中心</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {tip && <span style={{ color: "#00a870", fontWeight: 500, backgroundColor: "#e6fcf2", padding: "4px 12px", borderRadius: 4 }}>✓ {tip}</span>}
          {localError && <span style={{ color: "#e63c3c", fontWeight: 500, backgroundColor: "#fff0f0", padding: "4px 12px", borderRadius: 4 }}>⚠ {localError}</span>}
          <code style={{ color: "#5c5f66", backgroundColor: "#f0f1f4", padding: "4px 8px", borderRadius: 4, fontWeight: 500 }}>
            会话: {conversationId.slice(-8)}
          </code>
        </div>
      </header>

      {/* 主从布局内容区 */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* 左侧：知识库列表边栏 */}
        <aside style={{ width: 320, backgroundColor: "#fff", borderRight: "1px solid #e5e6eb", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: 16, borderBottom: "1px solid #e5e6eb" }}>
            <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: "1rem", color: "#1c1f23" }}>知识库列表</h3>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input
                value={kbName}
                onChange={(e) => setKbName(e.target.value)}
                placeholder="新知识库名称"
                className="qw-flex-1"
                style={{ width: "100%", padding: "6px 12px", border: "1px solid #dcdfe6", borderRadius: 6, color: "#1c1f23" }}
              />
              <button
                className="qw-btn qw-btn-primary"
                style={{ backgroundColor: "#615ced", color: "#fff", border: "none" }}
                onClick={() => {
                  if(!kbName.trim()) return showMessage("请输入知识库名称", true);
                  createKnowledgeBase({ name: kbName, description: "前端创建", department: "演示", owner: "admin" })
                    .then(() => {
                      showMessage("知识库创建成功");
                      setKbName("");
                      return refreshKbs();
                    })
                    .catch((e) => showMessage((e as Error).message || "新建失败", true));
                }}
              >
                新建
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
            {kbs.length === 0 ? (
              <p className="qw-empty-text" style={{ textAlign: "center", marginTop: 20, color: "#8c8f96" }}>暂无知识库</p>
            ) : (
              kbs.map((kb) => (
                <div
                  key={kb.id}
                  onClick={() => setActiveKbId(kb.id)}
                  style={{
                    padding: "12px 16px",
                    margin: "4px 0",
                    borderRadius: 6,
                    cursor: "pointer",
                    backgroundColor: activeKbId === kb.id ? "#f0f0fa" : "transparent",
                    border: activeKbId === kb.id ? "1px solid #615ced" : "1px solid transparent",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  <span style={{ fontWeight: activeKbId === kb.id ? 600 : 500, color: activeKbId === kb.id ? "#615ced" : "#3d3f45" }} className="qw-truncate" title={kb.name}>
                    {kb.name}
                  </span>
                  <span style={{ fontSize: "0.85rem", color: activeKbId === kb.id ? "#615ced" : "#8c8f96", backgroundColor: activeKbId === kb.id ? "#e5e5f8" : "#f0f1f4", padding: "2px 8px", borderRadius: 12 }}>
                    {kb.document_count} 篇
                  </span>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* 右侧：主体内容区 */}
        <section style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>

            {/* 模块 1：当前知识库设置 */}
            {activeKb ? (
              <div className="panel" style={{ padding: 24, backgroundColor: "#fff", borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.03)", border: "1px solid #e5e6eb" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <h3 style={{ margin: 0, color: "#1c1f23" }}>知识库设置：{activeKb.name}</h3>
                  <button
                    className="qw-btn qw-btn-subtle qw-text-danger"
                    style={{ color: "#e63c3c", border: "1px solid #ffd6d6", backgroundColor: "#fff0f0" }}
                    onClick={() => {
                      if(confirm(`确定要删除知识库 "${activeKb.name}" 吗？此操作不可逆。`)) {
                        deleteKnowledgeBase(activeKb.id, true)
                          .then(() => {
                            showMessage("知识库已删除");
                            return refreshKbs();
                          })
                          .catch((e) => showMessage((e as Error).message || "删除失败", true));
                      }
                    }}
                  >
                    删除知识库
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.875rem", color: "#5c5f66", marginBottom: 6, fontWeight: 500 }}>名称</label>
                    <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #dcdfe6", borderRadius: 6, color: "#1c1f23" }} value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.875rem", color: "#5c5f66", marginBottom: 6, fontWeight: 500 }}>描述</label>
                    <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #dcdfe6", borderRadius: 6, color: "#1c1f23" }} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.875rem", color: "#5c5f66", marginBottom: 6, fontWeight: 500 }}>部门</label>
                    <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #dcdfe6", borderRadius: 6, color: "#1c1f23" }} value={form.department || ""} onChange={(e) => setForm({ ...form, department: e.target.value })} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.875rem", color: "#5c5f66", marginBottom: 6, fontWeight: 500 }}>负责人</label>
                    <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #dcdfe6", borderRadius: 6, color: "#1c1f23" }} value={form.owner || ""} onChange={(e) => setForm({ ...form, owner: e.target.value })} />
                  </div>
                </div>
                <div style={{ marginTop: 20, textAlign: "right" }}>
                  <button
                    className="qw-btn qw-btn-primary"
                    style={{ backgroundColor: "#1c1f23", color: "#fff", border: "none" }}
                    onClick={() => {
                      updateKnowledgeBase(activeKbId, form)
                        .then(() => {
                          showMessage("知识库信息已保存");
                          return refreshKbs();
                        })
                        .catch((e) => showMessage((e as Error).message || "保存失败", true));
                    }}
                  >
                    保存设置
                  </button>
                </div>
              </div>
            ) : (
              <div className="panel" style={{ padding: 40, textAlign: "center", color: "#8c8f96", backgroundColor: "#fff", borderRadius: 12, border: "1px dashed #dcdfe6" }}>
                请在左侧选择或创建一个知识库以进行管理
              </div>
            )}

            {/* 模块 2：文档片段管理 */}
            <div className="panel" style={{ padding: 24, backgroundColor: "#fff", borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.03)", border: "1px solid #e5e6eb", opacity: canOperateDoc ? 1 : 0.5, pointerEvents: canOperateDoc ? "auto" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                <div>
                  <h3 style={{ margin: 0, marginBottom: 8, color: "#1c1f23" }}>文档片段管理</h3>
                  <p className="qw-section-tip" style={{ margin: 0, color: "#5c5f66" }}>“X 段”表示该文档被切分后的可检索片段数。已选中 <span style={{color: "#615ced", fontWeight: 600}}>{selectedDocIds.length}</span> 个。</p>
                </div>
                <div className="qw-btn-group" style={{ margin: 0 }}>
                  <input
                    type="file" multiple id="admin-doc-upload" className="qw-hidden" accept=".txt,.md,.pdf,.docx"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (!files.length || !activeKbId) return;
                      uploadDocuments(activeKbId, files)
                        .then(async () => {
                          await refreshDocs(activeKbId);
                          showMessage(`上传成功，文件数：${files.length}`);
                        })
                        .catch((err) => showMessage((err as Error).message || "上传文档失败", true));
                    }}
                  />
                  <label htmlFor="admin-doc-upload" className="qw-btn qw-btn-primary" style={{ cursor: "pointer", backgroundColor: "#615ced", color: "#fff", border: "none" }}>
                    + 上传文档
                  </label>
                  <button className="qw-btn qw-btn-subtle" style={{ color: "#3d3f45", border: "1px solid #e5e6eb" }} onClick={() => refreshDocs(activeKbId).catch((e) => showMessage((e as Error).message || "刷新文档失败", true))}>
                    刷新
                  </button>
                  <button className="qw-btn qw-btn-subtle" style={{ color: "#3d3f45", border: "1px solid #e5e6eb" }} onClick={() => {
                      if (!activeKbId) return;
                      rebuildKnowledgeBaseVectorstore(activeKbId)
                        .then((data) => showMessage(`向量库重建完成：文档 ${data.docs_total}，重建分段 ${data.indexed_chunks}`))
                        .catch((e) => showMessage((e as Error).message || "向量库重建失败", true));
                    }}>
                    向量修复/重建
                  </button>
                  {selectedDocIds.length > 0 && (
                    <button className="qw-btn qw-btn-subtle qw-text-danger" style={{ color: "#e63c3c", border: "1px solid #ffd6d6", backgroundColor: "#fff0f0" }} onClick={async () => {
                        if(!confirm(`确定要删除选中的 ${selectedDocIds.length} 个文档吗？`)) return;
                        batchDeleteDocuments(activeKbId, selectedDocIds)
                          .then(async (data) => {
                            if (!data.deleted && selectedDocIds.length) {
                              const settled = await Promise.allSettled(selectedDocIds.map((id) => deleteDocument(activeKbId, id)));
                              const fallbackDeleted = settled.filter((item) => item.status === "fulfilled").length;
                              await refreshDocs(activeKbId);
                              if (!fallbackDeleted) return showMessage("批量删除和逐条删除都未成功，请检查权限。", true);
                              return showMessage(`批量删除回退成功，删除 ${fallbackDeleted} 个文档`);
                            }
                            await refreshDocs(activeKbId);
                            showMessage(`批量删除成功，删除 ${data.deleted} 个文档`);
                          })
                          .catch((e) => showMessage((e as Error).message || "删除文档失败", true));
                      }}>
                      批量删除
                    </button>
                  )}
                </div>
              </div>

              <div className="qw-list-container" style={{ maxHeight: 400, overflowY: "auto", border: "1px solid #e5e6eb", borderRadius: 8, padding: 8, backgroundColor: "#f8f9fc" }}>
                {!docs.length && <div className="qw-empty-text" style={{ padding: 20, textAlign: "center", color: "#8c8f96" }}>该知识库暂无文档。</div>}
                {docs.map((doc) => (
                  <div key={doc.id} className="qw-list-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: "1px solid #e5e6eb", backgroundColor: "#fff", marginBottom: 4, borderRadius: 6 }}>
                    <label className="qw-checkbox" style={{ display: "flex", alignItems: "center", gap: 10, margin: 0, flex: 1, minWidth: 0 }}>
                      <input
                        type="checkbox"
                        checked={selectedDocIds.includes(doc.id)}
                        onChange={(e) => setSelectedDocIds((prev) => e.target.checked ? [...prev, doc.id] : prev.filter((id) => id !== doc.id))}
                      />
                      <span className="qw-truncate" title={doc.file_name} style={{ fontWeight: 500, color: "#1c1f23" }}>{doc.file_name}</span>
                    </label>
                    <div style={{ display: "flex", gap: 12, fontSize: "0.85rem" }}>
                      <span style={{ backgroundColor: "#f0f1f4", color: "#5c5f66", padding: "2px 8px", borderRadius: 4, border: "1px solid #e5e6eb" }}>{doc.file_type || "未知类型"}</span>
                      <span style={{ backgroundColor: "#f0f0fa", color: "#615ced", padding: "2px 8px", borderRadius: 4, fontWeight: 500 }}>{doc.chunk_count} 段</span>
                      <span style={{
                        backgroundColor: doc.status === 'error' ? "#fff0f0" : "#e6fcf2",
                        color: doc.status === 'error' ? "#e63c3c" : "#00a870",
                        padding: "2px 8px", borderRadius: 4, fontWeight: 500
                      }}>{doc.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 模块 3：会话级检索参数 */}
            <div className="panel" style={{ padding: 24, backgroundColor: "#fff", borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,0.03)", border: "1px solid #e5e6eb" }}>
              <h3 style={{ marginTop: 0, marginBottom: 20, color: "#1c1f23" }}>会话检索参数调优</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", color: "#5c5f66", marginBottom: 6, fontWeight: 500 }}>召回数量 (top_k)</label>
                  <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #dcdfe6", borderRadius: 6, color: "#1c1f23" }} type="number" value={sessionConfig.retrieval_top_k} onChange={(e) => setSessionConfig({ ...sessionConfig, retrieval_top_k: Number(e.target.value) })} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", color: "#5c5f66", marginBottom: 6, fontWeight: 500 }}>评分阈值</label>
                  <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #dcdfe6", borderRadius: 6, color: "#1c1f23" }} type="number" step="0.01" value={sessionConfig.score_threshold} onChange={(e) => setSessionConfig({ ...sessionConfig, score_threshold: Number(e.target.value) })} />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", color: "#5c5f66", marginBottom: 6, fontWeight: 500 }}>融合模式</label>
                  <select style={{ width: "100%", padding: "8px 12px", border: "1px solid #dcdfe6", borderRadius: 6, color: "#1c1f23", backgroundColor: "#fff" }} value={sessionConfig.fusion_mode} onChange={(e) => setSessionConfig({ ...sessionConfig, fusion_mode: e.target.value })}>
                    <option value="weighted">weighted</option>
                    <option value="rrf">rrf</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.875rem", color: "#5c5f66", marginBottom: 6, fontWeight: 500 }}>融合权重 (alpha)</label>
                  <input style={{ width: "100%", padding: "8px 12px", border: "1px solid #dcdfe6", borderRadius: 6, color: "#1c1f23" }} type="number" step="0.01" value={sessionConfig.alpha} onChange={(e) => setSessionConfig({ ...sessionConfig, alpha: Number(e.target.value) })} />
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button
                  className="qw-btn qw-btn-subtle"
                  style={{ color: "#3d3f45", border: "1px solid #e5e6eb" }}
                  onClick={() => {
                    getSessionRetrievalConfig(conversationId)
                      .then((data) => { setSessionConfig(data); showMessage("已重置为会话当前参数"); })
                      .catch((e) => showMessage((e as Error).message || "读取参数失败", true));
                  }}
                >
                  重置参数
                </button>
                <button
                  className="qw-btn qw-btn-primary"
                  style={{ backgroundColor: "#1c1f23", color: "#fff", border: "none" }}
                  onClick={() => {
                    updateSessionRetrievalConfig(conversationId, sessionConfig)
                      .then((data) => {
                        setSessionConfig(data);
                        onApplyRetrievalConfig(data);
                        showMessage("检索参数已保存并同步到主界面");
                      })
                      .catch((e) => showMessage((e as Error).message || "应用参数失败", true));
                  }}
                >
                  应用并同步到主界面
                </button>
              </div>
            </div>

          </div>
        </section>
      </div>
    </main>
  );
}