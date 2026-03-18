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
  const [kbName, setKbName] = useState("\u6f14\u793a\u77e5\u8bc6\u5e93");
  const [activeKbId, setActiveKbId] = useState("");
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [sessionConfig, setSessionConfig] = useState<RetrievalConfig>(defaultConfig);
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
  const totalChunkCount = useMemo(
    () => docs.reduce((sum, doc) => sum + (Number(doc.chunk_count) || 0), 0),
    [docs]
  );

  function showMessage(message: string, isError = false) {
    if (isError) {
      setLocalError(message);
      setTip("");
      onError(message);
    } else {
      setTip(message);
      setLocalError("");
    }

    window.setTimeout(() => {
      setTip("");
      setLocalError("");
    }, 3000);
  }

  async function refreshKbs(preferredKbId?: string) {
    const result = await listKnowledgeBases({ limit: 100 });
    const items = result.items;
    setKbs(items);

    if (!items.length) {
      setActiveKbId("");
      return;
    }

    const nextActiveKbId =
      (preferredKbId && items.some((item) => item.id === preferredKbId) && preferredKbId) ||
      (activeKbId && items.some((item) => item.id === activeKbId) && activeKbId) ||
      items[0].id;

    setActiveKbId(nextActiveKbId);
  }

  async function refreshDocs(targetKbId: string) {
    if (!targetKbId) {
      setDocs([]);
      setSelectedDocIds([]);
      return;
    }

    const result = await listDocuments(targetKbId);
    const items = result.items;
    setDocs(items);
    setSelectedDocIds((prev) => prev.filter((id) => items.some((doc) => doc.id === id)));
  }

  useEffect(() => {
    refreshKbs().catch((e) => showMessage((e as Error).message || "\u77e5\u8bc6\u5e93\u52a0\u8f7d\u5931\u8d25", true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getSessionRetrievalConfig(conversationId)
      .then((config) => setSessionConfig(config))
      .catch((e) => showMessage((e as Error).message || "\u8bfb\u53d6\u68c0\u7d22\u53c2\u6570\u5931\u8d25", true));
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

    refreshDocs(activeKb.id).catch((e) => showMessage((e as Error).message || "\u6587\u6863\u52a0\u8f7d\u5931\u8d25", true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKb]);

  async function handleCreateKb() {
    if (!kbName.trim()) {
      showMessage("\u8bf7\u8f93\u5165\u77e5\u8bc6\u5e93\u540d\u79f0", true);
      return;
    }

    try {
      await createKnowledgeBase({
        name: kbName.trim(),
        description: "\u524d\u7aef\u521b\u5efa",
        department: "\u6f14\u793a",
        owner: "admin"
      });
      showMessage("\u77e5\u8bc6\u5e93\u5df2\u521b\u5efa");
      setKbName("");
      await refreshKbs();
    } catch (e) {
      showMessage((e as Error).message || "\u65b0\u5efa\u77e5\u8bc6\u5e93\u5931\u8d25", true);
    }
  }

  async function handleSaveKb() {
    if (!activeKbId) {
      showMessage("\u8bf7\u5148\u9009\u62e9\u77e5\u8bc6\u5e93", true);
      return;
    }

    try {
      await updateKnowledgeBase(activeKbId, form);
      showMessage("\u77e5\u8bc6\u5e93\u8bbe\u7f6e\u5df2\u4fdd\u5b58");
      await refreshKbs(activeKbId);
    } catch (e) {
      showMessage((e as Error).message || "\u4fdd\u5b58\u77e5\u8bc6\u5e93\u5931\u8d25", true);
    }
  }

  async function handleDeleteKb() {
    if (!activeKb) return;
    if (!window.confirm(`\u786e\u5b9a\u8981\u5220\u9664\u77e5\u8bc6\u5e93\u201c${activeKb.name}\u201d\u5417\uff1f\u6b64\u64cd\u4f5c\u4e0d\u53ef\u64a4\u9500\u3002`)) {
      return;
    }

    try {
      await deleteKnowledgeBase(activeKb.id, true);
      showMessage("\u77e5\u8bc6\u5e93\u5df2\u5220\u9664");
      await refreshKbs();
    } catch (e) {
      showMessage((e as Error).message || "\u5220\u9664\u77e5\u8bc6\u5e93\u5931\u8d25", true);
    }
  }

  async function handleUploadDocuments(files: File[]) {
    if (!files.length || !activeKbId) return;

    try {
      await uploadDocuments(activeKbId, files);
      await refreshDocs(activeKbId);
      await refreshKbs(activeKbId);
      showMessage(`\u4e0a\u4f20\u6210\u529f\uff0c\u5171 ${files.length} \u4e2a\u6587\u4ef6`);
    } catch (e) {
      showMessage((e as Error).message || "\u4e0a\u4f20\u6587\u6863\u5931\u8d25", true);
    }
  }

  async function handleDeleteDocuments() {
    if (!activeKbId || selectedDocIds.length === 0) return;
    if (!window.confirm(`\u786e\u5b9a\u8981\u5220\u9664\u9009\u4e2d\u7684 ${selectedDocIds.length} \u4e2a\u6587\u6863\u5417\uff1f`)) {
      return;
    }

    try {
      const data = await batchDeleteDocuments(activeKbId, selectedDocIds);
      if (!data.deleted && selectedDocIds.length > 0) {
        const settled = await Promise.allSettled(
          selectedDocIds.map((documentId) => deleteDocument(activeKbId, documentId))
        );
        const fallbackDeleted = settled.filter((item) => item.status === "fulfilled").length;
        await refreshDocs(activeKbId);
        await refreshKbs(activeKbId);

        if (!fallbackDeleted) {
          showMessage("\u6279\u91cf\u5220\u9664\u672a\u6210\u529f\uff0c\u8bf7\u68c0\u67e5\u6743\u9650\u6216\u540e\u7aef\u65e5\u5fd7", true);
          return;
        }

        showMessage(`\u5df2\u5220\u9664 ${fallbackDeleted} \u4e2a\u6587\u6863`);
        return;
      }

      await refreshDocs(activeKbId);
      await refreshKbs(activeKbId);
      showMessage(`\u5df2\u5220\u9664 ${data.deleted} \u4e2a\u6587\u6863`);
    } catch (e) {
      showMessage((e as Error).message || "\u5220\u9664\u6587\u6863\u5931\u8d25", true);
    }
  }

  async function handleRebuildVectorstore() {
    if (!activeKbId) return;

    try {
      const data = await rebuildKnowledgeBaseVectorstore(activeKbId);
      showMessage(`\u91cd\u5efa\u5b8c\u6210\uff1a${data.docs_total} \u4e2a\u6587\u6863\uff0c${data.indexed_chunks} \u4e2a\u7247\u6bb5`);
      await refreshDocs(activeKbId);
      await refreshKbs(activeKbId);
    } catch (e) {
      showMessage((e as Error).message || "\u5411\u91cf\u5e93\u91cd\u5efa\u5931\u8d25", true);
    }
  }

  async function handleResetConfig() {
    try {
      const data = await getSessionRetrievalConfig(conversationId);
      setSessionConfig(data);
      showMessage("\u5df2\u8bfb\u53d6\u5f53\u524d\u4f1a\u8bdd\u68c0\u7d22\u53c2\u6570");
    } catch (e) {
      showMessage((e as Error).message || "\u8bfb\u53d6\u4f1a\u8bdd\u53c2\u6570\u5931\u8d25", true);
    }
  }

  async function handleApplyConfig() {
    try {
      const data = await updateSessionRetrievalConfig(conversationId, sessionConfig);
      setSessionConfig(data);
      onApplyRetrievalConfig(data);
      showMessage("\u68c0\u7d22\u53c2\u6570\u5df2\u540c\u6b65\u5230\u4e3b\u754c\u9762");
    } catch (e) {
      showMessage((e as Error).message || "\u540c\u6b65\u68c0\u7d22\u53c2\u6570\u5931\u8d25", true);
    }
  }

  return (
    <main className="qw-admin-shell">
      <header className="qw-admin-topbar">
        <div className="qw-admin-topbar-left">
          <button className="qw-btn qw-btn-subtle" onClick={onBack}>
            {"\u8fd4\u56de AI \u4e3b\u754c\u9762"}
          </button>
          <div className="qw-admin-topbar-copy">
            <span className="qw-kicker">{"\u7ba1\u7406\u5458\u5de5\u4f5c\u53f0"}</span>
            <h1>{"\u7ba1\u7406\u5458\u77e5\u8bc6\u5e93\u4e2d\u5fc3"}</h1>
            <p>{"\u4ee5\u5361\u7247\u5316\u9762\u677f\u7edf\u4e00\u7ba1\u7406\u77e5\u8bc6\u5e93\u3001\u6587\u6863\u7247\u6bb5\u548c\u5f53\u524d\u4f1a\u8bdd\u7684\u68c0\u7d22\u53c2\u6570\u3002"}</p>
          </div>
        </div>

        <div className="qw-admin-topbar-meta">
          {tip && <span className="qw-admin-inline-note is-success">{tip}</span>}
          {localError && <span className="qw-admin-inline-note is-danger">{localError}</span>}
          <span className="qw-admin-badge">{`\u4f1a\u8bdd\uff1a${conversationId.slice(-8)}`}</span>
        </div>
      </header>

      <div className="qw-admin-body">
        <aside className="qw-admin-sidebar">
          <section className="qw-admin-panel">
            <div className="qw-admin-panel-head">
              <div>
                <span className="qw-kicker">{"\u77e5\u8bc6\u5e93\u5217\u8868"}</span>
                <h2>{"\u5de6\u4fa7\u5bfc\u822a"}</h2>
                <p>{"\u56fa\u5b9a\u77e5\u8bc6\u5e93\u5217\u8868\uff0c\u53f3\u4fa7\u5185\u5bb9\u533a\u72ec\u7acb\u6eda\u52a8\uff0c\u6574\u4f53\u66f4\u63a5\u8fd1\u7ba1\u7406\u4e2d\u5fc3\u5e03\u5c40\u3002"}</p>
              </div>
              <span className="qw-admin-badge">{`${kbs.length} \u4e2a\u77e5\u8bc6\u5e93`}</span>
            </div>

            <div className="qw-admin-create-row">
              <input
                value={kbName}
                onChange={(e) => setKbName(e.target.value)}
                placeholder="\u8f93\u5165\u65b0\u77e5\u8bc6\u5e93\u540d\u79f0"
              />
              <button className="qw-btn qw-btn-primary" onClick={() => void handleCreateKb()}>
                {"\u65b0\u5efa"}
              </button>
            </div>

            <div className="qw-admin-list-scroll">
              {kbs.length === 0 ? (
                <div className="qw-admin-empty">
                  {"\u6682\u65e0\u77e5\u8bc6\u5e93\uff0c\u8bf7\u5148\u521b\u5efa\u4e00\u4e2a\u77e5\u8bc6\u5e93\u5f00\u59cb\u914d\u7f6e\u3002"}
                </div>
              ) : (
                kbs.map((kb) => (
                  <button
                    key={kb.id}
                    type="button"
                    className={`qw-admin-kb-item ${activeKbId === kb.id ? "is-active" : ""}`}
                    onClick={() => setActiveKbId(kb.id)}
                  >
                    <div className="qw-admin-kb-main">
                      <div className="qw-admin-kb-title">{kb.name}</div>
                      <div className="qw-admin-kb-meta">
                        <span className="qw-admin-pill">{kb.department || "\u672a\u8bbe\u7f6e\u90e8\u95e8"}</span>
                        <span className="qw-admin-pill">{kb.owner || "\u672a\u8bbe\u7f6e\u8d1f\u8d23\u4eba"}</span>
                      </div>
                    </div>
                    <span className="qw-admin-count-pill">{`${kb.document_count} \u7bc7`}</span>
                  </button>
                ))
              )}
            </div>
          </section>
        </aside>

        <section className="qw-admin-main">
          <div className="qw-admin-scroll">
            {activeKb ? (
              <section className="qw-admin-card">
                <div className="qw-admin-card-head">
                  <div className="qw-admin-card-title">
                    <span className="qw-kicker">{"\u77e5\u8bc6\u5e93\u8bbe\u7f6e"}</span>
                    <h2>{activeKb.name}</h2>
                    <p>{"\u6309\u7167\u53c2\u8003\u56fe\u65b9\u5411\u5f3a\u5316\u5361\u7247\u611f\u3001\u7559\u767d\u548c\u6a21\u5757\u5c42\u7ea7\uff0c\u4fdd\u7559\u539f\u6709\u914d\u7f6e\u80fd\u529b\u3002"}</p>
                  </div>
                  <div className="qw-admin-actions">
                    <span className="qw-admin-badge">{`\u6587\u6863\uff1a${activeKb.document_count}`}</span>
                    <button className="qw-btn qw-btn-danger" onClick={() => void handleDeleteKb()}>
                      {"\u5220\u9664\u77e5\u8bc6\u5e93"}
                    </button>
                  </div>
                </div>

                <div className="qw-admin-form-grid">
                  <label className="qw-admin-field">
                    <span>{"\u540d\u79f0"}</span>
                    <input
                      value={form.name || ""}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                    />
                  </label>
                  <label className="qw-admin-field">
                    <span>{"\u63cf\u8ff0"}</span>
                    <input
                      value={form.description || ""}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </label>
                  <label className="qw-admin-field">
                    <span>{"\u90e8\u95e8"}</span>
                    <input
                      value={form.department || ""}
                      onChange={(e) => setForm({ ...form, department: e.target.value })}
                    />
                  </label>
                  <label className="qw-admin-field">
                    <span>{"\u8d1f\u8d23\u4eba"}</span>
                    <input
                      value={form.owner || ""}
                      onChange={(e) => setForm({ ...form, owner: e.target.value })}
                    />
                  </label>
                  <label className="qw-admin-field qw-admin-field-full">
                    <span>{"Embedding \u6a21\u578b"}</span>
                    <input
                      value={form.embedding_model || ""}
                      onChange={(e) => setForm({ ...form, embedding_model: e.target.value })}
                      placeholder="\u5982\u9700\u81ea\u5b9a\u4e49\uff0c\u53ef\u5728\u6b64\u586b\u5199"
                    />
                  </label>
                </div>

                <div className="qw-admin-card-footer">
                  <button className="qw-btn qw-btn-strong" onClick={() => void handleSaveKb()}>
                    {"\u4fdd\u5b58\u8bbe\u7f6e"}
                  </button>
                </div>
              </section>
            ) : (
              <section className="qw-admin-card">
                <div className="qw-admin-empty">
                  {"\u8bf7\u9009\u62e9\u5de6\u4fa7\u77e5\u8bc6\u5e93\uff0c\u6216\u5148\u65b0\u5efa\u4e00\u4e2a\u77e5\u8bc6\u5e93\u4ee5\u7ee7\u7eed\u7ba1\u7406\u3002"}
                </div>
              </section>
            )}

            <section className={`qw-admin-card ${!canOperateDoc ? "is-disabled" : ""}`}>
              <div className="qw-admin-card-head">
                <div className="qw-admin-card-title">
                  <span className="qw-kicker">{"\u6587\u6863\u7247\u6bb5\u7ba1\u7406"}</span>
                  <h2>{"\u6587\u6863\u4e0e\u5411\u91cf\u7247\u6bb5"}</h2>
                  <p>{"\u4e0a\u4f20\u3001\u5237\u65b0\u3001\u6279\u91cf\u5220\u9664\u548c\u91cd\u5efa\u5411\u91cf\u5e93\u90fd\u4fdd\u7559\uff0c\u5217\u8868\u9605\u8bfb\u6027\u4e0e\u7a7a\u72b6\u6001\u66f4\u6e05\u6670\u3002"}</p>
                </div>
                <div className="qw-admin-actions">
                  <span className="qw-admin-badge">{`\u5df2\u9009\u4e2d\u6587\u6863\uff1a${selectedDocIds.length}`}</span>
                  <span className="qw-admin-badge">{`\u7247\u6bb5\u603b\u6570\uff1a${totalChunkCount}`}</span>
                </div>
              </div>

              <div className="qw-admin-toolbar">
                <p className="qw-admin-hint">
                  {"\u201cX \u6bb5\u201d\u8868\u793a\u6587\u6863\u5207\u5206\u540e\u7684\u53ef\u68c0\u7d22\u7247\u6bb5\u6570\u91cf\u3002\u53f3\u4fa7\u5217\u8868\u533a\u652f\u6301\u72ec\u7acb\u6eda\u52a8\uff0c\u4e0d\u4f1a\u5f71\u54cd\u9876\u90e8\u548c\u6574\u4f53\u5e03\u5c40\u3002"}
                </p>
                <div className="qw-btn-group">
                  <input
                    id="admin-doc-upload"
                    className="qw-hidden"
                    type="file"
                    multiple
                    accept=".txt,.md,.pdf,.docx"
                    onChange={(e) => void handleUploadDocuments(Array.from(e.target.files || []))}
                    disabled={!canOperateDoc}
                  />
                  <label
                    htmlFor="admin-doc-upload"
                    className={`qw-btn qw-btn-primary ${!canOperateDoc ? "disabled" : ""}`}
                  >
                    {"\u4e0a\u4f20\u6587\u6863"}
                  </label>
                  <button className="qw-btn qw-btn-subtle" disabled={!canOperateDoc} onClick={() => void refreshDocs(activeKbId)}>
                    {"\u5237\u65b0"}
                  </button>
                  <button className="qw-btn qw-btn-subtle" disabled={!canOperateDoc} onClick={() => void handleRebuildVectorstore()}>
                    {"\u5411\u91cf\u4fee\u590d/\u91cd\u5efa"}
                  </button>
                  <button
                    className="qw-btn qw-btn-danger"
                    disabled={!canOperateDoc || selectedDocIds.length === 0}
                    onClick={() => void handleDeleteDocuments()}
                  >
                    {"\u6279\u91cf\u5220\u9664"}
                  </button>
                </div>
              </div>

              <div className="qw-admin-data-shell">
                {docs.length === 0 ? (
                  <div className="qw-admin-empty">{"\u5f53\u524d\u77e5\u8bc6\u5e93\u6682\u65e0\u6587\u6863\u3002"}</div>
                ) : (
                  docs.map((doc) => (
                    <label key={doc.id} className="qw-admin-doc-row">
                      <div className="qw-admin-doc-main">
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
                        <div className="qw-admin-doc-copy">
                          <span className="qw-admin-doc-name" title={doc.file_name}>{doc.file_name}</span>
                          <div className="qw-admin-doc-meta">
                            <span className="qw-admin-pill">{doc.file_type || "\u672a\u77e5\u7c7b\u578b"}</span>
                            <span className="qw-admin-pill">{`${doc.chunk_count} \u6bb5`}</span>
                            <span className={`qw-admin-pill ${doc.status === "error" ? "is-danger" : "is-success"}`}>
                              {doc.status}
                            </span>
                          </div>
                        </div>
                      </div>
                    </label>
                  ))
                )}
              </div>
            </section>

            <section className="qw-admin-card">
              <div className="qw-admin-card-head">
                <div className="qw-admin-card-title">
                  <span className="qw-kicker">{"\u4f1a\u8bdd\u68c0\u7d22\u53c2\u6570"}</span>
                  <h2>{"\u68c0\u7d22\u53c2\u6570\u8c03\u4f18"}</h2>
                  <p>{"\u4fdd\u6301\u539f\u6709 retrieval \u914d\u7f6e\u903b\u8f91\uff0c\u4ec5\u4f18\u5316\u5c55\u793a\u5c42\u6b21\u4e0e\u64cd\u4f5c\u53cd\u9988\u3002"}</p>
                </div>
                <span className="qw-admin-badge">{`\u4f1a\u8bdd\uff1a${conversationId.slice(-8)}`}</span>
              </div>

              <div className="qw-admin-param-grid">
                <label className="qw-admin-field">
                  <span>{"\u53ec\u56de\u6570\u91cf (top_k)"}</span>
                  <input
                    type="number"
                    value={sessionConfig.retrieval_top_k}
                    onChange={(e) => setSessionConfig({ ...sessionConfig, retrieval_top_k: Number(e.target.value) })}
                  />
                </label>
                <label className="qw-admin-field">
                  <span>{"\u8bc4\u5206\u9608\u503c"}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={sessionConfig.score_threshold}
                    onChange={(e) => setSessionConfig({ ...sessionConfig, score_threshold: Number(e.target.value) })}
                  />
                </label>
                <label className="qw-admin-field">
                  <span>{"\u878d\u5408\u6a21\u5f0f"}</span>
                  <select
                    value={sessionConfig.fusion_mode}
                    onChange={(e) => setSessionConfig({ ...sessionConfig, fusion_mode: e.target.value })}
                  >
                    <option value="weighted">weighted</option>
                    <option value="rrf">rrf</option>
                  </select>
                </label>
                <label className="qw-admin-field">
                  <span>{"\u878d\u5408\u6743\u91cd (alpha)"}</span>
                  <input
                    type="number"
                    step="0.01"
                    value={sessionConfig.alpha}
                    onChange={(e) => setSessionConfig({ ...sessionConfig, alpha: Number(e.target.value) })}
                  />
                </label>
              </div>

              <div className="qw-admin-card-footer">
                <button className="qw-btn qw-btn-subtle" onClick={() => void handleResetConfig()}>
                  {"\u91cd\u7f6e\u53c2\u6570"}
                </button>
                <button className="qw-btn qw-btn-strong" onClick={() => void handleApplyConfig()}>
                  {"\u5e94\u7528\u5e76\u540c\u6b65\u5230\u4e3b\u754c\u9762"}
                </button>
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
