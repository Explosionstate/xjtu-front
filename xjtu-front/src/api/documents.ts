import { http } from "./http";
import type { DocumentItem } from "../types/api";

export async function listDocuments(kbId: string): Promise<{ total: number; items: DocumentItem[] }> {
  const { data } = await http.get(`/knowledge-bases/${kbId}/documents`);
  return data;
}

export async function uploadDocuments(kbId: string, files: File[]): Promise<DocumentItem[]> {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  const { data } = await http.post<DocumentItem[]>(
    `/knowledge-bases/${kbId}/documents/upload`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return data;
}

export async function batchDeleteDocuments(kbId: string, documentIds: string[]): Promise<{ deleted: number }> {
  const { data } = await http.post(`/knowledge-bases/${kbId}/documents/batch-delete`, {
    document_ids: documentIds
  });
  return data;
}
