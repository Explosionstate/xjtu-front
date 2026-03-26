import { http } from "./http";
import type { AcademicAnalysisResponse, AcademicInterpretResponse } from "../types/api";

export async function getMyAcademicAnalysis(termCode?: string): Promise<AcademicAnalysisResponse> {
  const { data } = await http.get<AcademicAnalysisResponse>("/academic/analysis/me", {
    params: termCode ? { term_code: termCode } : undefined,
    timeout: 120000
  });
  return data;
}

export async function interpretMyAcademicAnalysis(
  termCode?: string,
  detailLevel: "brief" | "detailed" = "brief"
): Promise<AcademicInterpretResponse> {
  const { data } = await http.post<AcademicInterpretResponse>(
    "/academic/analysis/me/interpret",
    {
      term_code: termCode,
      detail_level: detailLevel
    },
    {
      timeout: 120000
    }
  );
  return data;
}
