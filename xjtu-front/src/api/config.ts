import { http } from "./http";

export async function getContextPolicy() {
  const { data } = await http.get<{ max_rounds: number; max_tokens: number }>("/system-config/context-policy");
  return data;
}

export async function setSensitiveWords(words: string) {
  const { data } = await http.put("/system-config/sensitive_words", {
    config_value: words,
    value_type: "string",
    description: "Sensitive words, comma separated"
  });
  return data;
}
