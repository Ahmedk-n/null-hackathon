// SAMPLE STUB (Founder B, to unblock integration) — Founder A owns the production version; replace on merge.
import { z } from "zod";

/* ---------- Business ---------- */
export const BusinessContextSchema = z.object({
  companyStage: z.string().optional(),
  industry: z.string().optional(),
  customers: z.array(z.string()),
  revenueModel: z.string().optional(),
  competitors: z.array(z.string()),
  strategicGoals: z.array(z.string()),
  growthBottlenecks: z.array(z.string()),
  marketConstraints: z.array(z.string()),
});

/* ---------- Technical ---------- */
export const TechnicalContextSchema = z.object({
  stack: z.array(z.string()),
  architecture: z.string().optional(),
  infrastructure: z.array(z.string()),
  integrations: z.array(z.string()),
  deploymentProcess: z.string().optional(),
  observability: z.string().optional(),
  teamSize: z.number().optional(),
  technicalDebt: z.array(z.string()),
  engineeringConstraints: z.array(z.string()),
});

/* ---------- Temporal ---------- */
export const UpcomingEventTypeSchema = z.enum([
  "investor_meeting",
  "customer_call",
  "board_update",
  "architecture_review",
  "incident_review",
  "launch",
  "hiring_deadline",
  "fundraising_deadline",
  "other",
]);

export const UpcomingEventSchema = z.object({
  id: z.string(),
  type: UpcomingEventTypeSchema,
  title: z.string(),
  dateDescription: z.string(),
  relevanceToDecision: z.string(),
  importance: z.number(),
});

export const DeadlineSchema = z.object({
  id: z.string(),
  title: z.string(),
  dateDescription: z.string(),
  consequenceIfMissed: z.string(),
  severity: z.number(),
});

export const TemporalContextSchema = z.object({
  upcomingEvents: z.array(UpcomingEventSchema),
  deadlines: z.array(DeadlineSchema),
  urgencyLevel: z.number(),
});

/* ---------- Cross-cutting ---------- */
export const ConstraintTypeSchema = z.enum([
  "time",
  "budget",
  "team",
  "technical",
  "market",
  "regulatory",
]);
export const ConstraintSchema = z.object({
  id: z.string(),
  type: ConstraintTypeSchema,
  statement: z.string(),
  severity: z.number(),
});

export const ObjectiveSchema = z.object({
  id: z.string(),
  statement: z.string(),
  priority: z.number(),
});

export const RiskCategorySchema = z.enum([
  "market",
  "execution",
  "technical",
  "competitor",
  "opportunity_cost",
]);
export const KnownRiskSchema = z.object({
  id: z.string(),
  category: RiskCategorySchema,
  statement: z.string(),
  likelihood: z.number(),
  severity: z.number(),
});

/* ---------- The compiled company model ---------- */
export const CompanyContextSchema = z.object({
  business: BusinessContextSchema,
  technical: TechnicalContextSchema,
  temporal: TemporalContextSchema,
  constraints: z.array(ConstraintSchema),
  objectives: z.array(ObjectiveSchema),
  knownRisks: z.array(KnownRiskSchema),
  missingInfo: z.array(z.string()),
});

/* ---------- Weight adjustments ---------- */
export const WeightCategorySchema = z.enum([
  "market",
  "execution",
  "technical",
  "competitor",
  "opportunity_cost",
  "timeline",
  "reliability",
  "auditability",
]);

export const ContextWeightAdjustmentSchema = z.object({
  targetCategory: WeightCategorySchema,
  direction: z.enum(["increase", "decrease"]),
  magnitude: z.number(),
  reason: z.string(),
});

/* ---------- The decision-specific pack ---------- */
export const DecisionContextPackSchema = z.object({
  decision: z.string(),
  relevantBusinessFacts: z.array(z.string()),
  relevantTechnicalFacts: z.array(z.string()),
  relevantTemporalFacts: z.array(z.string()),
  relevantConstraints: z.array(ConstraintSchema),
  relevantObjectives: z.array(ObjectiveSchema),
  relevantKnownRisks: z.array(KnownRiskSchema),
  contextWeightAdjustments: z.array(ContextWeightAdjustmentSchema),
  missingInformation: z.array(z.string()),
});

/* ---------- Combined structured-output schema ---------- */
export const ContextCompileSchema = z.object({
  companyContext: CompanyContextSchema,
  decisionContextPack: DecisionContextPackSchema,
});
export type ContextCompileOutput = z.infer<typeof ContextCompileSchema>;
