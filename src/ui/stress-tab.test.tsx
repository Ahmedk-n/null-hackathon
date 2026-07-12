// @vitest-environment jsdom
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup, screen, fireEvent, waitFor } from "@testing-library/react";
import { StressTab } from "./tabs/StressTab";
import { keystoneStore } from "@/store/useKeystone";
import { integrity } from "@/engine";
import {
  fixtureContextGraph,
  fixtureContextAttacks,
  fixtureCompanyContext,
  fixtureDecisionContextPack,
  fixtureContextGraphB,
  fixtureContextAttacksB,
  fixtureCompanyContextB,
  fixtureDecisionContextPackB,
} from "@/context";
import { fixtureCouncil } from "@/agents/council/fixtures";

// React 19 + Testing Library act() flag.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// React Flow measures nodes/viewport via ResizeObserver + matchMedia, neither of
// which jsdom implements. Minimal shims so the canvas mounts without throwing.
beforeAll(() => {
  if (!("ResizeObserver" in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener() {},
      removeListener() {},
      addEventListener() {},
      removeEventListener() {},
      dispatchEvent() {
        return false;
      },
    })) as unknown as typeof window.matchMedia;
  }
});

// Seed the shared singleton store via its actions before each render (selectors
// read the singleton, so seeding it first is enough).
beforeEach(() => {
  keystoneStore.getState().setGraph(fixtureContextGraph());
  keystoneStore.getState().applyLoad(fixtureContextAttacks());
});

afterEach(cleanup);

describe("StressTab (R4)", () => {
  it("renders an APPLY LOAD button", () => {
    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);
    expect(screen.getByRole("button", { name: /apply load/i })).toBeDefined();
  });

  it("shows at least one attack row with a mono severity value", () => {
    const { container } = render(
      <StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />,
    );
    const monos = Array.from(container.querySelectorAll(".mono"));
    const severities = monos.filter((el) => /^\d\.\d{2}$/.test(el.textContent ?? ""));
    expect(severities.length).toBeGreaterThanOrEqual(1);
  });

  it("renders the integrity value", () => {
    const { container } = render(
      <StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />,
    );
    // IntegrityGauge renders its label + a numeric percentage. (The keystone-explanation
    // sentence also contains the phrase "structural integrity", so match ≥ 1, not exactly one.)
    expect(screen.getAllByText(/structural integrity/i).length).toBeGreaterThanOrEqual(1);
    const value = keystoneStore.getState().workingGraph
      ? Math.round(
          Array.from(container.querySelectorAll("text"))
            .map((t) => Number(t.textContent))
            .find((n) => !Number.isNaN(n)) ?? -1,
        )
      : -1;
    expect(value).toBeGreaterThanOrEqual(0);
  });

  // ── The A/B toggle: IGNORE CONTEXT ⟷ GROUND IN CONTEXT ────────────────
  it("renders the IGNORE CONTEXT / GROUND IN CONTEXT toggle", () => {
    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);
    expect(screen.getByRole("button", { name: /ignore context/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /ground in context/i })).toBeDefined();
  });

  it("flipping the toggle flips survive⟷collapse", () => {
    // Seed a grounded, loaded state with the hero pack present.
    const s = keystoneStore.getState();
    s.setGraph(fixtureContextGraph());
    s.setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");
    s.setApplyContextWeights(true);
    s.applyLoad(fixtureContextAttacks());

    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);

    // GROUND IN CONTEXT → keystone cracks, structure collapses.
    expect(integrity(keystoneStore.getState().workingGraph!)).toBeLessThan(10);
    expect(keystoneStore.getState().failures.has("k_credible")).toBe(true);

    // Flip to IGNORE CONTEXT → keystone holds, structure survives.
    fireEvent.click(screen.getByRole("button", { name: /ignore context/i }));
    expect(keystoneStore.getState().applyContextWeights).toBe(false);
    expect(integrity(keystoneStore.getState().workingGraph!)).toBeGreaterThan(15);
    expect(keystoneStore.getState().failures.has("k_credible")).toBe(false);

    // Flip back to GROUND IN CONTEXT → collapse returns.
    fireEvent.click(screen.getByRole("button", { name: /ground in context/i }));
    expect(integrity(keystoneStore.getState().workingGraph!)).toBeLessThan(10);
    expect(keystoneStore.getState().failures.has("k_credible")).toBe(true);
  });

  // ── W2-1 · knock-out sensitivity bars ─────────────────────────────────
  it("renders knock-out sensitivity rows sorted by impact with the keystone first + accented", () => {
    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);

    const rows = screen.getAllByTestId("sensitivity-row");
    expect(rows.length).toBeGreaterThanOrEqual(2);

    // Impact values are mono, formatted as "−NN.N", sorted descending by magnitude.
    const impacts = rows.map((row) => {
      const mono = row.querySelector(".mono")!;
      return Math.abs(Number((mono.textContent ?? "").replace("−", "")));
    });
    for (let i = 1; i < impacts.length; i++) {
      expect(impacts[i - 1]).toBeGreaterThanOrEqual(impacts[i]);
    }

    // The keystone dominates (~60pts vs ~2pts next) and is the accented first row.
    expect(impacts[0]).toBeGreaterThan(impacts[1] + 10);
    expect(rows[0].getAttribute("data-keystone")).toBe("true");
    expect(rows[0].querySelector(".label")!.textContent).toBe(
      keystoneStore.getState().baseGraph!.nodes.find((n) => n.id === "k_credible")!.label,
    );
  });

  // ── V7-3 · attack rationale + target LABEL (not raw id) ───────────────
  it("renders each attack's rationale + the target's label beneath the severity", () => {
    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);
    const rationales = screen.getAllByTestId("attack-rationale");
    expect(rationales.length).toBeGreaterThanOrEqual(1);
    // Every rationale carries the engine's specific "why it breaks" text.
    const attacks = keystoneStore.getState().attacks;
    const someRationale = attacks.find((a) => a.rationale)?.rationale;
    expect(someRationale).toBeTruthy();
    expect(rationales.some((r) => (r.textContent ?? "").includes(someRationale!))).toBe(true);
    // The target is shown by LABEL, not raw id — the "→ <label>" line resolves through the graph.
    const base = keystoneStore.getState().baseGraph!;
    const targetLabel = base.nodes.find((n) => n.id === attacks[0].targetId)!.label;
    expect(screen.getAllByText(new RegExp(targetLabel.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).length).toBeGreaterThanOrEqual(1);
  });

  // ── V7-3 · load-result summary + ordered failure cascade ──────────────
  it("renders the LOAD RESULT summary with baseline→post-load and an ordered cascade", () => {
    const s = keystoneStore.getState();
    s.setGraph(fixtureContextGraph());
    s.setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");
    s.setApplyContextWeights(true);
    s.applyLoad(fixtureContextAttacks());

    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);

    const panel = screen.getByTestId("load-result");
    expect(panel.textContent).toMatch(/BASELINE.*POST-LOAD/i);
    expect(panel.textContent).toMatch(/→/);

    // Grounded hero A collapses → a non-empty cascade, ordered lowest-support-first.
    const rows = screen.getAllByTestId("cascade-row");
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const supports = rows.map((r) => Number(r.querySelector(".ledger-value")!.textContent));
    for (let i = 1; i < supports.length; i++) {
      expect(supports[i - 1]).toBeLessThanOrEqual(supports[i]);
    }
  });

  it("hides the LOAD RESULT panel before load is applied", () => {
    keystoneStore.getState().setGraph(fixtureContextGraph()); // setGraph clears loadApplied
    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);
    expect(screen.queryByTestId("load-result")).toBeNull();
  });

  // ── V7-3 · keystone explanation (deterministic sentence + dominance ratio) ──
  it("renders the keystone explanation sentence + a dominance-ratio chip", () => {
    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);
    const box = screen.getByTestId("keystone-explanation");
    // Number-derived sentence naming the impact in points.
    expect(box.textContent).toMatch(/points/i);
    // Dominance ratio chip: "N× more load-bearing than next".
    expect(screen.getByTestId("keystone-ratio").textContent).toMatch(/MORE LOAD-BEARING/i);
  });

  // ── V7-3 · support breakdown (own × dependency = support) ──────────────
  it("shows the support breakdown (own × dependency = support) when expanded", () => {
    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);
    const panel = screen.getByTestId("support-breakdown");
    // Collapsed by default — no rows.
    expect(screen.queryAllByTestId("support-row").length).toBe(0);
    fireEvent.click(panel.querySelector("button")!);
    const rows = screen.getAllByTestId("support-row");
    expect(rows.length).toBeGreaterThanOrEqual(3); // deep graph: assumptions + claims + thesis
    // Each row shows the own × dependency = support decomposition.
    expect(rows[0].querySelector(".ledger-value")!.textContent).toMatch(/\d\.\d{2} × \d\.\d{2} = \d\.\d{2}/);
  });

  // ── V3-2 · DE-RISKING PLAN panel ──────────────────────────────────────
  it("renders the DE-RISKING PLAN panel after reinforce with PROVE + integrity rows", () => {
    keystoneStore.getState().setGraph(fixtureContextGraph());
    keystoneStore.getState().setContext(
      fixtureCompanyContext(),
      fixtureDecisionContextPack(),
      "fixture",
    );
    keystoneStore.getState().applyLoad(fixtureContextAttacks());

    render(
      <StressTab
        onApplyLoad={() => {}}
        onReset={() => {}}
        onReinforce={() => keystoneStore.getState().reinforce()}
        loading={false}
      />,
    );

    // No plan yet → no panel.
    expect(screen.queryByTestId("derisking-plan")).toBeNull();

    // Click REINFORCE → the store computes a plan and the panel appears.
    fireEvent.click(screen.getByRole("button", { name: /reinforce/i }));

    const panel = screen.getByTestId("derisking-plan");
    expect(panel).toBeDefined();

    // One PROVE row per targetId; the keystone label appears.
    const proveRows = screen.getAllByTestId("prove-row");
    expect(proveRows.length).toBeGreaterThanOrEqual(1);
    const keystoneLabel = keystoneStore
      .getState()
      .baseGraph!.nodes.find((n) => n.id === "k_credible")!.label.toUpperCase();
    expect(
      proveRows.some((r) => (r.textContent ?? "").toUpperCase().includes(keystoneLabel)),
    ).toBe(true);

    // INTEGRITY before→after row + determinism caption.
    expect(panel.textContent).toMatch(/INTEGRITY/i);
    expect(panel.textContent).toMatch(/→/);
    expect(panel.textContent).toMatch(/DETERMINISTIC/i);

    // V7-3 · firm-up payoff — a "FIRM UP THIS FIRST" line + a "+N" gain on the prove row.
    expect(screen.getByTestId("firm-up-first").textContent).toMatch(/FIRM UP THIS FIRST/i);
    const gains = screen.getAllByTestId("prove-gain");
    expect(gains.length).toBeGreaterThanOrEqual(1);
    expect(gains[0].textContent).toMatch(/^\+\d/);
  });

  it("does not render the REINFORCE button when no onReinforce prop is passed", () => {
    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);
    expect(screen.queryByRole("button", { name: /reinforce/i })).toBeNull();
  });

  // ── V3-7 · TIMELINE scrub + FAILS/SURVIVES chip ───────────────────────
  it("renders the TIMELINE scrub slider + FAILS IN N DAYS chip when grounded", () => {
    keystoneStore.getState().setGraph(fixtureContextGraph());
    keystoneStore.getState().setContext(
      fixtureCompanyContext(),
      fixtureDecisionContextPack(),
      "fixture",
    );
    keystoneStore.getState().applyLoad(fixtureContextAttacks());

    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);

    const slider = screen.getByTestId("timeline-slider") as HTMLInputElement;
    expect(slider.getAttribute("type")).toBe("range");
    expect(slider.getAttribute("max")).toBe("30");
    expect(slider.className).toContain("ledger-range"); // zero-radius track

    // Hero A grounded → craters below the crater line at day 8.
    const chip = screen.getByTestId("timeline-chip");
    expect(chip.textContent).toMatch(/FAILS IN 9 DAYS/i);

    // Dragging re-runs the engine live: day 13 craters (deadline imminent),
    // day 0 holds (deadline a fortnight out) — pressure builds as the horizon advances.
    fireEvent.change(slider, { target: { value: "13" } });
    expect(keystoneStore.getState().timelineDay).toBe(13);
    expect(screen.getByText(/T\+13D/)).toBeDefined();
    const collapsed = integrity(keystoneStore.getState().workingGraph!);
    expect(collapsed).toBeLessThan(10);

    fireEvent.change(slider, { target: { value: "0" } });
    expect(keystoneStore.getState().timelineDay).toBe(0);
    const healthy = integrity(keystoneStore.getState().workingGraph!);
    expect(healthy).toBeGreaterThan(collapsed);
  });

  it("hides the TIMELINE section in RAW (ungrounded) mode", () => {
    keystoneStore.getState().setGraph(fixtureContextGraph());
    keystoneStore.getState().setContext(
      fixtureCompanyContext(),
      fixtureDecisionContextPack(),
      "fixture",
    );
    keystoneStore.getState().applyLoad(fixtureContextAttacks());
    keystoneStore.getState().setApplyContextWeights(false);

    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);
    expect(screen.queryByTestId("timeline-section")).toBeNull();
  });

  // ── W2-2 · deterministic re-run beat ──────────────────────────────────
  // ── V6-2 · WIND TUNNEL section ────────────────────────────────────────
  it("renders the WIND TUNNEL section and streams a role-tagged transcript + verdict", async () => {
    keystoneStore.getState().setGraph(fixtureContextGraph());
    keystoneStore.getState().setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");
    keystoneStore.getState().setApplyContextWeights(true); // singleton store — a prior test may have flipped it
    keystoneStore.getState().applyLoad(fixtureContextAttacks());

    const frames = [
      { type: "round", round: 1, ts: "T" },
      {
        type: "proposal",
        round: 1,
        role: "PROSECUTOR",
        targetId: "k_credible",
        category: "execution",
        severity: 0.5,
        rationale: "no spare capacity",
        ts: "T",
      },
      { type: "verdict", round: 1, role: "SOLVER", step: "proposal", valid: true, reason: null, integrity: 26.3, delta: -26, ts: "T" },
      { type: "counter", round: 1, role: "ADVOCATE", kind: "restore", targetId: "k_credible", value: 0.72, citation: "notes: hiring", ts: "T" },
      { type: "verdict", round: 1, role: "SOLVER", step: "counter", valid: true, reason: null, integrity: 47.4, delta: 21, verdict: "HOLD", ts: "T" },
      { type: "done", verdict: "STANDS", holds: 3, cracks: 2, source: "fixture", ts: "T" },
    ];
    const makeStream = () => {
      const enc = new TextEncoder();
      let i = 0;
      return new ReadableStream<Uint8Array>({
        pull(controller) {
          if (i < frames.length) {
            controller.enqueue(enc.encode(`data: ${JSON.stringify(frames[i])}\n\n`));
            i += 1;
          } else {
            controller.close();
          }
        },
      });
    };
    const fetchMock = vi.fn(async () => ({ body: makeStream() }) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);

    // The section + its button are present (grounded + loaded).
    const section = screen.getByTestId("wind-tunnel");
    expect(section).toBeDefined();
    const btn = screen.getByRole("button", { name: /wind tunnel/i });
    fireEvent.click(btn);

    await waitFor(() => expect(screen.getAllByTestId("tunnel-row").length).toBeGreaterThan(0));
    expect(fetchMock).toHaveBeenCalledWith("/api/tunnel", expect.objectContaining({ method: "POST" }));

    const verdict = await screen.findByTestId("tunnel-verdict");
    expect(verdict.textContent).toMatch(/STANDS \(3 HOLDS \/ 2 CRACKS\)/);

    vi.unstubAllGlobals();
  });

  it("re-run leaves the verdict identical and flashes the determinism chip", () => {
    keystoneStore.getState().setGraph(fixtureContextGraph());
    keystoneStore.getState().setContext(
      fixtureCompanyContext(),
      fixtureDecisionContextPack(),
      "fixture",
    );
    keystoneStore.getState().applyLoad(fixtureContextAttacks());

    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);

    const before = integrity(keystoneStore.getState().workingGraph!);
    const beforeFailures = [...keystoneStore.getState().failures].sort();

    fireEvent.click(screen.getByRole("button", { name: /re-run analysis/i }));

    expect(integrity(keystoneStore.getState().workingGraph!)).toBe(before);
    expect([...keystoneStore.getState().failures].sort()).toEqual(beforeFailures);
    expect(keystoneStore.getState().rerunIdentical).toBe(true);
    expect(keystoneStore.getState().rerunConfirmed).toBe(true);
    expect(screen.getByTestId("rerun-chip").textContent).toMatch(/IDENTICAL/i);
  });

  // ── P3-T8 · WHAT THE COUNCIL FOUND block ──────────────────────────────
  it("renders the council's fracture narrative + context-keystone line when grounded", () => {
    const council = fixtureCouncil("A");
    const s = keystoneStore.getState();
    s.setGraph(fixtureContextGraph());
    s.setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");
    s.setApplyContextWeights(true);
    s.setCouncil(council);
    s.applyLoad(fixtureContextAttacks());

    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);

    // The block, the exact fracture sentence, and the "real spine" context-keystone line.
    const block = screen.getByTestId("council-findings");
    expect(screen.getByTestId("council-fracture").textContent).toBe(council.fractureNarrative);

    // A's contextKeystoneId (a_audit) ≠ topological keystone → the spine line + label + rationale.
    const spine = screen.getByTestId("council-context-keystone");
    const spineLabel = keystoneStore
      .getState()
      .baseGraph!.nodes.find((n) => n.id === council.contextKeystoneId)!.label;
    expect(spine.textContent).toMatch(/real spine is/i);
    expect(spine.textContent).toContain(spineLabel);
    const spineWeight = council.nodeWeights.find((w) => w.nodeId === council.contextKeystoneId)!;
    expect(spine.textContent).toContain(spineWeight.rationale);

    // The 1–2 hidden assumptions (label + why).
    const hidden = screen.getAllByTestId("council-hidden-assumption");
    expect(hidden.length).toBeGreaterThanOrEqual(1);
    expect(hidden[0].textContent).toContain(council.hiddenAssumptions[0].label);

    // Fixture-sourced → the honesty ILLUSTRATIVE tag.
    expect(screen.getByTestId("council-illustrative").textContent).toMatch(/ILLUSTRATIVE/i);
    expect(block).toBeDefined();
  });

  it("renders nothing council-related when the council is null or not grounded", () => {
    const s = keystoneStore.getState();
    s.setGraph(fixtureContextGraph()); // setGraph nulls any prior council
    s.applyLoad(fixtureContextAttacks());
    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);
    expect(screen.queryByTestId("council-findings")).toBeNull();
    cleanup();

    // A council with grounded:false is likewise suppressed (deterministic view only).
    s.setGraph(fixtureContextGraph());
    s.setCouncil({ ...fixtureCouncil("A"), grounded: false });
    s.applyLoad(fixtureContextAttacks());
    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);
    expect(screen.queryByTestId("council-findings")).toBeNull();
  });

  // ── P4-T5 · DE-RISK THESE action tail ─────────────────────────────────
  it("renders a DE-RISK THESE action per surviving remediation, spine suppressed only when no shift", async () => {
    // Scenario A has a spine-shift (a_audit != topological keystone) -> spine row SHOWN.
    const s = keystoneStore.getState();
    s.setGraph(fixtureContextGraph());
    s.setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");
    s.setApplyContextWeights(true);
    s.setCouncil(fixtureCouncil("A"));
    s.applyLoad(fixtureContextAttacks());

    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);

    const actions = await screen.findAllByTestId("council-remediation");
    // A: 1 spine + 2 hidden = 3 rows.
    expect(actions).toHaveLength(3);
    expect(screen.getByTestId("council-remediation-spine")).toBeDefined();
  });

  it("suppresses the spine remediation when context-keystone == topological keystone", async () => {
    // Scenario B: contextKeystoneId (k_sre) == topological keystone -> spine row SUPPRESSED,
    // only the 2 hidden remediations remain.
    const s = keystoneStore.getState();
    s.setGraph(fixtureContextGraphB());
    s.setContext(fixtureCompanyContextB(), fixtureDecisionContextPackB(), "fixture");
    s.setApplyContextWeights(true);
    s.setCouncil(fixtureCouncil("B"));
    s.applyLoad(fixtureContextAttacksB());

    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);

    const actions = await screen.findAllByTestId("council-remediation");
    expect(actions).toHaveLength(2);
    expect(screen.queryByTestId("council-remediation-spine")).toBeNull();
  });

  it("tags the de-risk actions ILLUSTRATIVE when remediationSource is fixture", async () => {
    const s = keystoneStore.getState();
    s.setGraph(fixtureContextGraph());
    s.setContext(fixtureCompanyContext(), fixtureDecisionContextPack(), "fixture");
    s.setApplyContextWeights(true);
    s.setCouncil(fixtureCouncil("A")); // remediationSource: "fixture"
    s.applyLoad(fixtureContextAttacks());

    render(<StressTab onApplyLoad={() => {}} onReset={() => {}} loading={false} />);
    expect(await screen.findByTestId("council-remediation-illustrative")).toBeDefined();
  });
});
