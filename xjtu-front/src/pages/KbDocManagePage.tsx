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
};

export default function KbDocManagePage({ onError }: Props) {
  const [kbs, setKbs] = useState<KnowledgeBaseItem[]>([]);
  const [selectedKbId, setSelectedKbId] = useState("");
  const [saving, setSaving] = useState(false);

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
    try {
      await updateKnowledgeBase(selectedKbId, form);
      await refreshKbs();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(files: File[]) {
    if (!selectedKbId) {
      onError("请先选择知识库");
      return;
    }
    if (!files.length) return;
    try {
      await uploadDocuments(selectedKbId, files);
      await refreshKbs();
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <section className="panel" style={{ margin: 12 }}>
      <h2>知识库编辑 + 文档批量上传</h2>

      <div className="row">
        <label>选择知识库：</label>
        <select value={selectedKbId} onChange={(e) => setSelectedKbId(e.target.value)}>
          {kbs.map((kb) => (
            <option key={kb.id} value={kb.id}>
              {kb.name}
            </option>
          ))}
        </select>
        <button onClick={() => refreshKbs().catch((e) => onError((e as Error).message))}>刷新</button>
      </div>

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

        <label>Embedding模型</label>
        <input
          value={form.embedding_model || ""}
          onChange={(e) => setForm({ ...form, embedding_model: e.target.value })}
        />
      </div>

      <div className="row">
        <button disabled={saving} onClick={submitUpdate}>
          {saving ? "保存中..." : "保存知识库编辑"}
        </button>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <label>批量上传文档：</label>
        <input
          type="file"
          multiple
          onChange={(e) => handleUpload(Array.from(e.target.files || []))}
          accept=".txt,.md,.pdf,.docx"
        />
      </div>
      <p style={{ color: "#9ca3af", marginTop: 8 }}>
        支持格式：txt / md / pdf / docx。一次可选多个文件。
      </p>
    </section>
  );
}
