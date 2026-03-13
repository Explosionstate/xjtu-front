import { useEffect, useMemo, useState } from "react";

import { uploadDocuments } from "../api/documents";
import {
  listKnowledgeBases,
  updateKnowledgeBase,
  type KnowledgeBaseUpdatePayload
} from "../api/knowledgeBases";
import type { KnowledgeBaseItem } from "../types/api";

type Props = {
  onError: (message: string) => void;
  onBack: () => void;
};

export default function KbUpdateUploadPage({ onError, onBack }: Props) {
  const [kbs, setKbs] = useState<KnowledgeBaseItem[]>([]);
  const [selectedKbId, setSelectedKbId] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [tip, setTip] = useState("");

  const [form, setForm] = useState<KnowledgeBaseUpdatePayload>({
    name: "",
    description: "",
    department: "",
    owner: "",
    embedding_model: ""
  });

  const selectedKb = useMemo(
    () => kbs.find((item) => item.id === selectedKbId) || null,
    [kbs, selectedKbId]
  );

  async function refreshKbs() {
    const data = await listKnowledgeBases({ limit: 100 });
    setKbs(data.items);
    if (!selectedKbId && data.items.length > 0) {
      setSelectedKbId(data.items[0].id);
    }
  }

  useEffect(() => {
    refreshKbs().catch((e) => onError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedKb) return;
    setForm({
      name: selectedKb.name,
      description: selectedKb.description,
      department: selectedKb.department,
      owner: selectedKb.owner,
      embedding_model: selectedKb.embedding_model
    });
  }, [selectedKb]);

  async function submitUpdate() {
    if (!selectedKbId) {
      onError("请先选择知识库");
      return;
    }
    setSaving(true);
    setTip("");
    try {
      await updateKnowledgeBase(selectedKbId, form);
      setTip("知识库信息已保存");
      await refreshKbs();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function submitUpload() {
    if (!selectedKbId) {
      onError("请先选择知识库");
      return;
    }
    if (!selectedFiles.length) {
      onError("请至少选择一个文件");
      return;
    }
    setUploading(true);
    setTip("");
    try {
      const created = await uploadDocuments(selectedKbId, selectedFiles);
      setTip(`上传成功，共 ${created.length} 个文件`);
      setSelectedFiles([]);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="qw-layout" style={{ display: "block", minHeight: "100vh" }}>
      <div style={{ padding: 16, display: "flex", gap: 10 }}>
        <button className="qw-btn qw-btn-subtle" onClick={onBack}>返回 AI 主界面</button>
      </div>

      <section className="panel" style={{ margin: "0 16px 16px" }}>
        <h2>专用界面：知识库更新 + 批量上传</h2>
        <p style={{ color: "#9ca3af", margin: "8px 0 16px" }}>
          对应后端接口：PUT /knowledge-bases/{"{kb_id}"} 与 POST /knowledge-bases/{"{kb_id}"}/documents/upload
        </p>

        <div className="row" style={{ marginBottom: 16 }}>
          <label>知识库：</label>
          <select value={selectedKbId} onChange={(e) => setSelectedKbId(e.target.value)}>
            {kbs.map((kb) => (
              <option key={kb.id} value={kb.id}>
                {kb.name}
              </option>
            ))}
          </select>
          <button onClick={() => refreshKbs().catch((e) => onError((e as Error).message))}>刷新</button>
        </div>

        <h3>1) 更新知识库</h3>
        <div className="grid2">
          <label>名称</label>
          <input value={form.name || ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />

          <label>描述</label>
          <input
            value={form.description || ""}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />

          <label>部门</label>
          <input
            value={form.department || ""}
            onChange={(e) => setForm({ ...form, department: e.target.value })}
          />

          <label>负责人</label>
          <input value={form.owner || ""} onChange={(e) => setForm({ ...form, owner: e.target.value })} />

          <label>Embedding 模型</label>
          <input
            value={form.embedding_model || ""}
            onChange={(e) => setForm({ ...form, embedding_model: e.target.value })}
          />
        </div>
        <div className="row" style={{ margin: "12px 0 20px" }}>
          <button disabled={saving} onClick={submitUpdate}>
            {saving ? "保存中..." : "提交更新"}
          </button>
        </div>

        <h3>2) 批量上传文档</h3>
        <div className="row" style={{ marginBottom: 10 }}>
          <input
            type="file"
            multiple
            accept=".txt,.md,.pdf,.docx"
            onChange={(e) => setSelectedFiles(Array.from(e.target.files || []))}
          />
          <button disabled={uploading} onClick={submitUpload}>
            {uploading ? "上传中..." : "上传到当前知识库"}
          </button>
        </div>
        <p style={{ color: "#9ca3af", marginTop: 4 }}>
          已选择 {selectedFiles.length} 个文件。后端参数为 files: list[UploadFile]，支持一次选择多个文件。
        </p>

        {tip && <div style={{ marginTop: 12, color: "#22c55e" }}>{tip}</div>}
      </section>
    </main>
  );
}
