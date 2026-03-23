import { http } from "./http";

export type AgentProfileItem = {
  key: string;
  title: string;
  mission: string;
  retrieval_focus_terms: string[];
  needs_profile_context: boolean;
};

export async function listAgentProfiles(): Promise<{
  total: number;
  items: AgentProfileItem[];
}> {
  const { data } = await http.get<{ total: number; items: AgentProfileItem[] }>("/chat/agents");
  return data;
}
