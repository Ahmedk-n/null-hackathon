/**
 * Context-layer contracts. Pure types — safe to import anywhere (client or
 * server). No `any`. All scores are 0..1. Arrays default to [] (never optional
 * arrays) so the UI can `.map` without guards.
 */

/* ---------- Raw input from the four textareas ---------- */
export interface ContextInput {
  businessContextText: string;
  technicalContextText: string;
  temporalContextText: string;
  decisionText: string;
}

/* ---------- Business ---------- */
export interface BusinessContext {
  companyStage?: string;
  industry?: string;
  customers: string[];
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
  teamSize?: number;
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
  dateDescription: string;
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
  urgencyLevel: number; // 0..1
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

/* ---------- Compiled company model ---------- */
export interface CompanyContext {
  business: BusinessContext;
  technical: TechnicalContext;
  temporal: TemporalContext;
  constraints: Constraint[];
  objectives: Objective[];
  knownRisks: KnownRisk[];
  missingInfo: string[];
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
  magnitude: number; // 0..1
  reason: string;
}

/* ---------- Decision-specific pack (grounds extraction) ---------- */
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

/* ---------- Pure compiler output (NO transport concerns) ---------- */
export interface ContextCompileResult {
  companyContext: CompanyContext;
  decisionContextPack: DecisionContextPack;
}

/**
 * What POST /api/context returns over the wire. `source` is a ROUTE-level
 * transport flag (live model vs fixture fallback), NOT part of the pure
 * compiler output above.
 */
export interface ContextRouteResponse extends ContextCompileResult {
  source: "live" | "fixture";
}
