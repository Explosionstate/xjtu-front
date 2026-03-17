import { http } from "./http";
import type { AcademicAnalysisResponse } from "../types/api";

export async function getMyAcademicAnalysis(termCode?: string): Promise<AcademicAnalysisResponse> {
  const { data } = await http.get<AcademicAnalysisResponse>("/academic/analysis/me", {
    params: termCode ? { term_code: termCode } : undefined
  });
  return data;
}
