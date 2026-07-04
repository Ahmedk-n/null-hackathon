import { describe, it, expect, beforeEach } from "vitest";
import { runTunnel } from "./tunnel";
import { scriptedDuelGraphR, type TunnelEvent } from "@/context/tunnel";

const FIXED_TS = "2026-07-04T00:00:00Z";

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

async function drive(scenario?: string): Promise<TunnelEvent[]> {
  const events: TunnelEvent[] = [];
  await runTunnel(scriptedDuelGraphR(), undefined, (e) => events.push(e), () => FIXED_TS, 5, scenario);
  return events;
}

describe("runTunnel (offline: scripted scenario-R duel)", () => {
  it("streams a well-formed round cadence ending in a STANDS done (3/2), source fixture", async () => {
    const events = await drive();

    // Terminal event is a done with the pinned verdict.
    const last = events[events.length - 1];
    expect(last.type).toBe("done");
    if (last.type === "done") {
      expect(last.verdict).toBe("STANDS");
      expect(last.holds).toBe(3);
      expect(last.cracks).toBe(2);
      expect(last.source).toBe("fixture");
    }

    // Five rounds, each: round → proposal → verdict → counter → verdict.
    const rounds = events.filter((e) => e.type === "round");
    expect(rounds.length).toBe(5);
    expect(events.filter((e) => e.type === "proposal").length).toBe(5);
    expect(events.filter((e) => e.type === "counter").length).toBe(5);
    expect(events.filter((e) => e.type === "verdict").length).toBe(10);

    // Every event's ts is stamped by the supplied clock (never a client/pure clock).
    expect(events.every((e) => e.ts === FIXED_TS)).toBe(true);
  });

  it("emits both roles and a SOLVER rejection for the round-2 weak rebuttal", async () => {
    const events = await drive();
    expect(events.some((e) => e.type === "proposal" && e.role === "PROSECUTOR")).toBe(true);
    expect(events.some((e) => e.type === "counter" && e.role === "ADVOCATE")).toBe(true);
    // The scripted round-2 rebuttal is below the floor → the SOLVER rejects it.
    const rejected = events.filter(
      (e) => e.type === "verdict" && e.step === "counter" && !e.valid,
    );
    expect(rejected.length).toBe(1);
    if (rejected[0].type === "verdict") expect(rejected[0].reason).toBe("rebuttal too weak");
  });

  it("scenario short-circuits to the scripted duel even with the same cadence", async () => {
    const events = await drive("R");
    const last = events[events.length - 1];
    expect(last.type).toBe("done");
    if (last.type === "done") expect(last.source).toBe("fixture");
    expect(events.filter((e) => e.type === "round").length).toBe(5);
  });

  it("never throws", async () => {
    await expect(drive()).resolves.toBeDefined();
  });
});
