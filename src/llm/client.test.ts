// Module-mocked SDK unit tests for the live chain (V3-4). The real @anthropic-ai/sdk is replaced
// with a stub whose messages.create we drive per-test, so we can prove:
//  - valid live JSON  → live graph/attacks that pass the validation wall (NOT the fixture),
//  - malformed reply  → fixture fallback (and retryOnce fired a second attempt),
//  - cyclic graph     → fixture (validateGraph rejects it before it can reach the engine).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { validateGraph } from "./validate";
import { normaliseCategory } from "@/context/weights";
import {
  fixtureContextGraph,
  fixtureContextAttacks,
  fixtureContextGraphR,
  fixtureContextAttacksR,
} from "@/context";
import type { Graph } from "@/engine";

// The attack prompt pins these exact category strings; every one MUST normalise to a WeightCategory,
// or context reweighting is a no-op and validateAttacks would reject the live set.
const PINNED_ATTACK_CATEGORIES = [
  "execution risk",
  "reliability",
  "auditability",
  "timeline",
  "market",
  "technical",
  "second-order",
];

describe("pinned attack categories normalise via normaliseCategory", () => {
  for (const cat of PINNED_ATTACK_CATEGORIES) {
    it(`"${cat}" → a WeightCategory`, () => {
      expect(normaliseCategory(cat)).not.toBeNull();
    });
  }
});

// vi.hoisted so the mock factory can reference the spy (vi.mock is hoisted above imports).
const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: createMock };
  },
}));

// Imported AFTER the mock is registered so the live path uses the stub SDK.
import {
  extractStructure,
  extractStructureWithSource,
  generateAttacks,
  generateAttacksWithSource,
} from "./client";

const msg = (obj: unknown) => ({ content: [{ type: "text", text: JSON.stringify(obj) }] });
const pack = { relevantBusinessFacts: ["x"], contextWeightAdjustments: [] };

const VALID_GRAPH = {
  thesisId: "t_migrate",
  nodes: [
    { id: "t_migrate", type: "thesis", label: "Migrate", confidence: 1, groups: [{ kind: "AND", childIds: ["c_scale", "c_ops"] }] },
    { id: "c_scale", type: "claim", label: "Scaling solved", confidence: 1, groups: [{ kind: "AND", childIds: ["a_load"] }] },
    { id: "c_ops", type: "claim", label: "Ops ready", confidence: 1, groups: [{ kind: "AND", childIds: ["a_dev"] }] },
    { id: "a_load", type: "assumption", label: "Load uneven", confidence: 0.7, groups: [] },
    { id: "a_dev", type: "assumption", label: "Devops mature", confidence: 0.6, groups: [] },
  ],
};

// Same graph but a_load points back to c_scale → c_scale→a_load→c_scale cycle (validateGraph rejects).
const CYCLIC_GRAPH = {
  ...VALID_GRAPH,
  nodes: VALID_GRAPH.nodes.map((n) =>
    n.id === "a_load" ? { ...n, groups: [{ kind: "AND", childIds: ["c_scale"] }] } : n,
  ),
};

const VALID_ATTACKS = {
  attacks: [
    { id: "atk_load", targetId: "a_load", category: "execution risk", severity: 0.4, rationale: "near-term delivery risk" },
    { id: "atk_dev", targetId: "a_dev", category: "reliability", severity: 0.3, rationale: "ops maturity unproven" },
  ],
};

beforeEach(() => {
  createMock.mockReset();
  process.env.ANTHROPIC_API_KEY = "sk-test";
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("extractStructure (live, mocked SDK)", () => {
  it("valid live JSON → live graph that passes validateGraph (not the fixture)", async () => {
    createMock.mockResolvedValue(msg(VALID_GRAPH));
    const graph = await extractStructure("Should we migrate?", pack);
    expect(graph.thesisId).toBe("t_migrate");
    expect(graph.nodes.length).toBe(5);
    expect(validateGraph(graph)).not.toBeNull();
    // NOT the offline context fixture.
    expect(graph.nodes.some((n) => n.id === "k_credible")).toBe(false);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("malformed reply → fixture fallback, and retryOnce fired a second attempt", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "sorry, no json here" }] });
    const graph = await extractStructure("Should we migrate?", pack);
    expect(graph).toEqual(fixtureContextGraph());
    expect(createMock).toHaveBeenCalledTimes(2); // one call + one retry
  });

  it("cyclic graph from model → fixture (validateGraph rejects the cycle)", async () => {
    createMock.mockResolvedValue(msg(CYCLIC_GRAPH));
    const graph = await extractStructure("Should we migrate?", pack);
    expect(graph).toEqual(fixtureContextGraph());
  });

  it("live call that throws → fixture (never 500)", async () => {
    createMock.mockRejectedValue(new Error("timeout"));
    const graph = await extractStructure("Should we migrate?", pack);
    expect(graph).toEqual(fixtureContextGraph());
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});

describe("extractStructure — evidence provenance (V3-6)", () => {
  const GRAPH_WITH_EVIDENCE = {
    ...VALID_GRAPH,
    nodes: VALID_GRAPH.nodes.map((n) =>
      n.id === "a_load"
        ? { ...n, confidence: 0.8, evidence: { source: "pyproject.toml", fact: "FastAPI monolith" } }
        : n.id === "a_dev"
          ? { ...n, evidence: null }
          : n,
    ),
  };

  it("live graph carries assumption evidence (coerced to the multi-citation array) through the wall", async () => {
    createMock.mockResolvedValue(msg(GRAPH_WITH_EVIDENCE));
    const graph = await extractStructure("Should we migrate?", pack);
    const aLoad = graph.nodes.find((n) => n.id === "a_load")!;
    const aDev = graph.nodes.find((n) => n.id === "a_dev")!;
    // V7-4 · a lone {source,fact} object from the model is coerced to a 1-element array.
    expect(aLoad.evidence).toEqual([{ source: "pyproject.toml", fact: "FastAPI monolith" }]);
    expect(aDev.evidence).toBeNull();
  });

  it("live graph carries a multi-citation evidence ARRAY (supporting + contradicting)", async () => {
    const MULTI = {
      ...VALID_GRAPH,
      nodes: VALID_GRAPH.nodes.map((n) =>
        n.id === "a_load"
          ? {
              ...n,
              evidence: [
                { source: "pyproject.toml", fact: "FastAPI monolith", stance: "supports" },
                { source: "src/", fact: "No tracing wiring", stance: "contradicts" },
              ],
            }
          : n,
      ),
    };
    createMock.mockResolvedValue(msg(MULTI));
    const graph = await extractStructure("Should we migrate?", pack);
    const aLoad = graph.nodes.find((n) => n.id === "a_load")!;
    expect(aLoad.evidence).toEqual([
      { source: "pyproject.toml", fact: "FastAPI monolith", stance: "supports" },
      { source: "src/", fact: "No tracing wiring", stance: "contradicts" },
    ]);
  });

  it("threads gathered findings into the extraction prompt (citable sources)", async () => {
    createMock.mockResolvedValue(msg(VALID_GRAPH));
    await extractStructure("Should we migrate?", pack, undefined, [
      { source: "pyproject.toml", fact: "FastAPI monolith (Python)" },
      { source: "notes", fact: "Enterprise meeting tomorrow" },
    ]);
    const userContent = createMock.mock.calls[0][0].messages[0].content as string;
    expect(userContent).toContain("GATHERED FINDINGS");
    expect(userContent).toContain("[pyproject.toml] FastAPI monolith (Python)");
    expect(userContent).toContain("[notes] Enterprise meeting tomorrow");
  });

  it("omits the findings block when none are supplied", async () => {
    createMock.mockResolvedValue(msg(VALID_GRAPH));
    await extractStructure("Should we migrate?", pack);
    const userContent = createMock.mock.calls[0][0].messages[0].content as string;
    expect(userContent).not.toContain("GATHERED FINDINGS");
  });
});

describe("generateAttacks (live, mocked SDK)", () => {
  const graph = VALID_GRAPH as unknown as Graph;

  it("valid live JSON → live attacks that pass validateAttacks", async () => {
    createMock.mockResolvedValue(msg(VALID_ATTACKS));
    const attacks = await generateAttacks(graph, pack);
    expect(attacks.length).toBe(2);
    expect(attacks.map((a) => a.targetId).sort()).toEqual(["a_dev", "a_load"]);
    expect(attacks.every((a) => a.severity <= 0.6)).toBe(true);
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it("malformed reply → fixture fallback", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "no json" }] });
    const attacks = await generateAttacks(graph, pack);
    expect(attacks).toEqual(fixtureContextAttacks());
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});

// ── provenance-carrying variants (source reporting for the route header) ──────────────────
describe("extractStructureWithSource — provenance", () => {
  it("valid live JSON → source 'live' with the SAME graph the bare fn returns", async () => {
    createMock.mockResolvedValue(msg(VALID_GRAPH));
    const { graph, source } = await extractStructureWithSource("Should we migrate?", pack);
    expect(source).toBe("live");
    expect(graph.thesisId).toBe("t_migrate");
    // Body byte-identical to the bare-return function for the same inputs.
    createMock.mockResolvedValue(msg(VALID_GRAPH));
    expect(graph).toEqual(await extractStructure("Should we migrate?", pack));
  });

  it("malformed reply → source 'fixture' (the live path fell back)", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "no json" }] });
    const { graph, source } = await extractStructureWithSource("Should we migrate?", pack);
    expect(source).toBe("fixture");
    expect(graph).toEqual(fixtureContextGraph());
  });

  it("scenario pin → source 'fixture', never constructs the SDK", async () => {
    createMock.mockResolvedValue(msg(VALID_GRAPH));
    const { source } = await extractStructureWithSource("x", pack, "A");
    expect(source).toBe("fixture");
    expect(createMock).not.toHaveBeenCalled();
  });

  it("no key → source 'fixture', never constructs the SDK", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    createMock.mockResolvedValue(msg(VALID_GRAPH));
    const { source } = await extractStructureWithSource("x", pack);
    expect(source).toBe("fixture");
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("generateAttacksWithSource — provenance", () => {
  const graph = VALID_GRAPH as unknown as Graph;

  it("valid live JSON → source 'live'", async () => {
    createMock.mockResolvedValue(msg(VALID_ATTACKS));
    const { attacks, source } = await generateAttacksWithSource(graph, pack);
    expect(source).toBe("live");
    expect(attacks.length).toBe(2);
  });

  it("malformed reply → source 'fixture'", async () => {
    createMock.mockResolvedValue({ content: [{ type: "text", text: "no json" }] });
    const { attacks, source } = await generateAttacksWithSource(graph, pack);
    expect(source).toBe("fixture");
    expect(attacks).toEqual(fixtureContextAttacks());
  });

  it("scenario pin → source 'fixture', never constructs the SDK", async () => {
    createMock.mockResolvedValue(msg(VALID_ATTACKS));
    const { source } = await generateAttacksWithSource(fixtureContextGraph(), pack, "B");
    expect(source).toBe("fixture");
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("scenario short-circuit beats the live key (FIXTURES ALWAYS WIN)", () => {
  it("extract with a scenario never calls the SDK even with a key set", async () => {
    createMock.mockResolvedValue(msg(VALID_GRAPH));
    const graph = await extractStructure("x", pack, "A");
    expect(graph).toEqual(fixtureContextGraph());
    expect(createMock).not.toHaveBeenCalled();
  });

  it("generateAttacks with scenario B never calls the SDK", async () => {
    createMock.mockResolvedValue(msg(VALID_ATTACKS));
    const attacks = await generateAttacks(fixtureContextGraph(), pack, "B");
    expect(createMock).not.toHaveBeenCalled();
    expect(attacks.some((a) => a.targetId === "k_sre")).toBe(true);
  });

  // ── Scenario R (real Excalidraw) replays offline too — never touches the SDK ──
  it("extract with scenario R replays the pinned real graph without the SDK", async () => {
    createMock.mockResolvedValue(msg(VALID_GRAPH));
    const graph = await extractStructure("x", pack, "R");
    expect(createMock).not.toHaveBeenCalled();
    expect(graph).toEqual(fixtureContextGraphR());
    expect(graph.thesisId).toBe("build_own_realtime_backend_now");
  });

  it("generateAttacks with scenario R replays the pinned real attacks without the SDK", async () => {
    createMock.mockResolvedValue(msg(VALID_ATTACKS));
    const attacks = await generateAttacks(fixtureContextGraphR(), pack, "R");
    expect(createMock).not.toHaveBeenCalled();
    expect(attacks).toEqual(fixtureContextAttacksR());
    expect(attacks.some((a) => a.targetId === "team_has_backend_capacity")).toBe(true);
  });
});
