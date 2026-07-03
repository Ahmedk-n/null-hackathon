// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.

/* ---------- Raw input from the four textareas ---------- */
export interface ContextInput {
  businessContextText: string;
  technicalContextText: string;
  temporalContextText: string;
  decisionText: string;
}

/* ---------- Business ---------- */
export interface BusinessContext {
  companyStage?: string; // e.g. "seed", "Series A", "growth"
  industry?: string;
  customers: string[]; // segments; [] if unknown
  revenueModel?: string;
  competitors: string[];
  strategicGoals: string[];
  growthBottlenecks: string[];
  marketConstraints: string[];
}

/* ---------- Technical ---------- */
export interface TechnicalContext {
  stack: string[];
  architecture?: string;
  infrastructure: string[];
  integrations: string[];
  deploymentProcess?: string;
  observability?: string;
  teamSize?: number; // integer ≥ 0
  technicalDebt: string[];
  engineeringConstraints: string[];
}

/* ---------- Temporal ---------- */
export type UpcomingEventType =
  | "investor_meeting"
  | "customer_call"
  | "board_update"
  | "architecture_review"
  | "incident_review"
  | "launch"
  | "hiring_deadline"
  | "fundraising_deadline"
  | "other";

export interface UpcomingEvent {
  id: string;
  type: UpcomingEventType;
  title: string;
  dateDescription: string; // natural language, e.g. "tomorrow", "next Tuesday"
  relevanceToDecision: string;
  importance: number; // 0..1
}

export interface Deadline {
  id: string;
  title: string;
  dateDescription: string;
  consequenceIfMissed: string;
  severity: number; // 0..1
}

export interface TemporalContext {
  upcomingEvents: UpcomingEvent[];
  deadlines: Deadline[];
  urgencyLevel: number; // 0..1 overall near-term pressure
}

/* ---------- Cross-cutting ---------- */
export type ConstraintType =
  | "time"
  | "budget"
  | "team"
  | "technical"
  | "market"
  | "regulatory";
export interface Constraint {
  id: string;
  type: ConstraintType;
  statement: string;
  severity: number; // 0..1
}

export interface Objective {
  id: string;
  statement: string;
  priority: number; // 0..1
}

export type RiskCategory =
  | "market"
  | "execution"
  | "technical"
  | "competitor"
  | "opportunity_cost";
export interface KnownRisk {
  id: string;
  category: RiskCategory;
  statement: string;
  likelihood: number; // 0..1
  severity: number; // 0..1
}

/* ---------- The compiled company model ---------- */
export interface CompanyContext {
  business: BusinessContext;
  technical: TechnicalContext;
  temporal: TemporalContext;
  constraints: Constraint[];
  objectives: Objective[];
  knownRisks: KnownRisk[];
  missingInfo: string[]; // what the model could NOT infer from the inputs
}

/* ---------- Weight adjustments (the important output) ---------- */
export type WeightCategory =
  | "market"
  | "execution"
  | "technical"
  | "competitor"
  | "opportunity_cost"
  | "timeline"
  | "reliability"
  | "auditability";

export interface ContextWeightAdjustment {
  targetCategory: WeightCategory;
  direction: "increase" | "decrease";
  magnitude: number; // 0..1, how strongly context shifts this category
  reason: string; // one sentence, shown in Context Used panel
}

/* ---------- The decision-specific pack (grounds extraction) ---------- */
export interface DecisionContextPack {
  decision: string;

  relevantBusinessFacts: string[];
  relevantTechnicalFacts: string[];
  relevantTemporalFacts: string[];

  relevantConstraints: Constraint[];
  relevantObjectives: Objective[];
  relevantKnownRisks: KnownRisk[];

  contextWeightAdjustments: ContextWeightAdjustment[];
  missingInformation: string[];
}

/* ---------- What the pure compiler returns (no transport concerns) ---------- */
export interface ContextCompileResult {
  companyContext: CompanyContext;
  decisionContextPack: DecisionContextPack;
}

/* ---------- What POST /api/context returns over the wire ---------- */
// The compiler stamps the provenance flag itself (v3: compileContext returns
// ContextRouteResponse), because only it knows whether the live model answered or
// the fixture fallback fired. The UI shows a "demo fallback" chip when source==="fixture".
// The route just forwards compileContext's `source` verbatim.
export interface ContextRouteResponse extends ContextCompileResult {
  source: "live" | "fixture";
}
