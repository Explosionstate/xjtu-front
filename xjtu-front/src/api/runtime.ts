import { http } from "./http";

export async function getRuntimeDebug() {
  const { data } = await http.get("/debug/runtime");
  return data;
}
