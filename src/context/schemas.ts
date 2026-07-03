import { z } from "zod";
import type { ContextCompileResult } from "./types";

/* Scores use z.number() (not .min/.max) so a slightly out-of-range model value
 * is tolerated and clamped by postClamp() rather than rejected into fallback. */

const BusinessContextSchema = z.object({
  companyStage: z.string().optional(),
  industry: z.string().optional(),
  customers: z.array(z.string()),
  revenueModel: z.string().optional(),
  competitors: z.array(z.string()),
  strategicGoals: z.array(z.string()),
  growthBottlenecks: z.array(z.string()),
  marketConstraints: z.array(z.string()),
});

const TechnicalContextSchema = z.object({
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

const UpcomingEventSchema = z.object({
  id: z.string(),
  type: z.enum([
    "investor_meeting",
    "customer_call",
    "board_update",
    "architecture_review",
    "incident_review",
    "launch",
    "hiring_deadline",
    "fundraising_deadline",
    "other",
  ]),
  title: z.string(),
  dateDescription: z.string(),
  relevanceToDecision: z.string(),
  importance: z.number(),
});

const DeadlineSchema = z.object({
  id: z.string(),
  title: z.string(),
  dateDescription: z.string(),
  consequenceIfMissed: z.string(),
  severity: z.number(),
});

const TemporalContextSchema = z.object({
  upcomingEvents: z.array(UpcomingEventSchema),
  deadlines: z.array(DeadlineSchema),
  urgencyLevel: z.number(),
});

const ConstraintSchema = z.object({
  id: z.string(),
  type: z.enum(["time", "budget", "team", "technical", "market", "regulatory"]),
  statement: z.string(),
  severity: z.number(),
});

const ObjectiveSchema = z.object({
  id: z.string(),
  statement: z.string(),
  priority: z.number(),
});

const KnownRiskSchema = z.object({
  id: z.string(),
  category: z.enum(["market", "execution", "technical", "competitor", "opportunity_cost"]),
  statement: z.string(),
  likelihood: z.number(),
  severity: z.number(),
});

export const CompanyContextSchema = z.object({
  business: BusinessContextSchema,
  technical: TechnicalContextSchema,
  temporal: TemporalContextSchema,
  constraints: z.array(ConstraintSchema),
  objectives: z.array(ObjectiveSchema),
  knownRisks: z.array(KnownRiskSchema),
  missingInfo: z.array(z.string()),
});

const WeightCategorySchema = z.enum([
  "market",
  "execution",
  "technical",
  "competitor",
  "opportunity_cost",
  "timeline",
  "reliability",
  "auditability",
]);

const ContextWeightAdjustmentSchema = z.object({
  targetCategory: WeightCategorySchema,
  direction: z.enum(["increase", "decrease"]),
  magnitude: z.number(),
  reason: z.string(),
});

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

export const ContextCompileSchema = z.object({
  companyContext: CompanyContextSchema,
  decisionContextPack: DecisionContextPackSchema,
});

/**
 * Inferred type of the combined schema. Kept structurally identical to the
 * hand-written ContextCompileResult (asserted both-ways in schemas.test.ts).
 */
export type ContextCompileOutput = z.infer<typeof ContextCompileSchema>;

const clamp01 = (n: number): number =>
  Number.isNaN(n) ? 0 : Math.min(1, Math.max(0, n));

/**
 * Clamp every 0..1 score into range and normalise teamSize to a non-negative
 * integer. Tolerates slightly-off model outputs instead of failing validation.
 * Pure — returns a new object.
 */
export function postClamp(result: ContextCompileResult): ContextCompileResult {
  const cc = result.companyContext;
  const dp = result.decisionContextPack;
  return {
    companyContext: {
      ...cc,
      technical: {
        ...cc.technical,
        teamSize:
          cc.technical.teamSize === undefined
            ? undefined
            : Math.max(0, Math.round(cc.technical.teamSize)),
      },
      temporal: {
        ...cc.temporal,
        urgencyLevel: clamp01(cc.temporal.urgencyLevel),
        upcomingEvents: cc.temporal.upcomingEvents.map((e) => ({ ...e, importance: clamp01(e.importance) })),
        deadlines: cc.temporal.deadlines.map((d) => ({ ...d, severity: clamp01(d.severity) })),
      },
      constraints: cc.constraints.map((c) => ({ ...c, severity: clamp01(c.severity) })),
      objectives: cc.objectives.map((o) => ({ ...o, priority: clamp01(o.priority) })),
      knownRisks: cc.knownRisks.map((r) => ({ ...r, likelihood: clamp01(r.likelihood), severity: clamp01(r.severity) })),
    },
    decisionContextPack: {
      ...dp,
      relevantConstraints: dp.relevantConstraints.map((c) => ({ ...c, severity: clamp01(c.severity) })),
      relevantObjectives: dp.relevantObjectives.map((o) => ({ ...o, priority: clamp01(o.priority) })),
      relevantKnownRisks: dp.relevantKnownRisks.map((r) => ({ ...r, likelihood: clamp01(r.likelihood), severity: clamp01(r.severity) })),
      contextWeightAdjustments: dp.contextWeightAdjustments.map((w) => ({ ...w, magnitude: clamp01(w.magnitude) })),
    },
  };
}
