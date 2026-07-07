import type { CompanyContext, ContextInput, DecisionContextPack } from "@/context";
import type { Graph } from "@/engine";

export interface DecisionRow {
  id: string; user_id: string; title: string; mode: string;
  input: ContextInput; company_context: CompanyContext | null;
  pack: DecisionContextPack | null; graph: Graph;
  verdict: { integrity: number; keystoneId: string | null; failedIds: string[]; loadApplied: boolean };
  seq: number; is_public: boolean; created_at: string; updated_at: string;
}
export type ConnectionKind = "github" | "linear" | "notion" | "jira" | "calendar" | "custom";
export interface ConnectionRow {           // server-side shape (includes secret)
  id: string; user_id: string; kind: ConnectionKind; name: string;
  url: string; secret: string | null; status: "untested" | "ok" | "error";
  last_used_at: string | null; created_at: string;
}
export type ConnectionPublic = Omit<ConnectionRow, "secret">;   // what the client ever sees
export interface RunRow { id: string; user_id: string; kind: string; source: "live" | "fixture"; tokens_in: number; tokens_out: number; created_at: string; }
