"use client";
// V6-3 · THE SKYLINE — /skyline. The whole decision library rendered as one load-bearing assembly:
// every saved decision a building, shared foundations (assumptions that recur across decisions) as
// columns beneath. Click a foundation to CRACK IT — every structure resting on it re-verdicts, and
// the buildings that can no longer stand drop and dim. RESET restores.
//
// CLIENT-only, offline, zero LLM, NO wall-clock / NO randomness (T8). Reads the library on the
// client after mount (SSR-safe: listEntries() no-ops server-side); when empty it seeds three SAMPLE
// buildings from the R/A/B fixtures so the view always demos.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { LibraryEntry } from "@/lib/library";
import { listEntries } from "@/lib/library";
import {
  buildSkyline,
  crackFoundation,
  sampleSkylineEntries,
  type CrackResult,
} from "@/lib/skyline";
import { SectionHeader, Button, Chip, LedgerRow } from "@/ui/primitives";
import { OK, WARN, BAD } from "@/ui/tokens";
import { SkylineSvg } from "./SkylineSvg";

function accentFor(v: number): string {
  return v >= 35 ? OK : v >= 10 ? WARN : BAD;
}

export function SkylineView() {
  // Resolve entries on the client only (avoids a hydration mismatch: the server has no library).
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null);
  const [seeded, setSeeded] = useState(false);
  const [crackedId, setCrackedId] = useState<string | null>(null);

  useEffect(() => {
    const real = listEntries();
    if (real.length > 0) {
      setEntries(real);
      setSeeded(false);
    } else {
      setEntries(sampleSkylineEntries());
      setSeeded(true);
    }
  }, []);

  const skyline = useMemo(() => (entries ? buildSkyline(entries) : null), [entries]);

  const crackedFoundation = useMemo(
    () => skyline?.foundations.find((f) => f.id === crackedId) ?? null,
    [skyline, crackedId],
  );

  const crackResults: CrackResult[] = useMemo(
    () => (entries && crackedFoundation ? crackFoundation(entries, crackedFoundation) : []),
    [entries, crackedFoundation],
  );

  const titleOf = (entryId: string) => skyline?.buildings.find((b) => b.entryId === entryId)?.title ?? entryId;

  const collapseCount = crackResults.filter((r) => r.failed).length;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "26px 22px 56px" }}>
      <div style={{ maxWidth: 1040, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* ── Header ──────────────────────────────────────────────── */}
        <header style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--sans)", fontWeight: 700, fontSize: 17, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              SKYLINE — YOUR STRATEGY AS ONE STRUCTURE
            </span>
            {seeded && (
              <span data-testid="sample-chip">
                <Chip tone="muted">SAMPLE</Chip>
              </span>
            )}
          </div>
          <p className="label" style={{ margin: 0, letterSpacing: "0.04em", textTransform: "none", maxWidth: 760, lineHeight: 1.5 }}>
            A SHARED FOUNDATION is an assumption that appears in more than one saved decision — a
            load-bearing column under multiple buildings. Crack it to re-verdict every structure
            resting on it: the ones that can no longer stand drop and dim.
          </p>
          <div style={{ display: "flex", gap: 14, marginTop: 2 }}>
            <Link href="/studio" className="label" style={{ textDecoration: "none", color: "var(--ink-2)" }}>
              ← BACK TO STUDIO
            </Link>
            <Link href="/" className="label" style={{ textDecoration: "none", color: "var(--ink-2)" }}>
              LANDING
            </Link>
          </div>
        </header>

        {/* ── Skyline canvas ──────────────────────────────────────── */}
        <div className="panel" style={{ padding: "16px 12px", overflowX: "auto" }}>
          {skyline && skyline.buildings.length > 0 ? (
            <SkylineSvg
              buildings={skyline.buildings}
              foundations={skyline.foundations}
              crackResults={crackResults}
              selectedFoundationId={crackedId}
              onCrack={(id) => setCrackedId(id)}
            />
          ) : (
            <div className="label" style={{ padding: 40, textAlign: "center" }}>
              {skyline ? "NO SAVED DECISIONS YET" : "LOADING SKYLINE…"}
            </div>
          )}
        </div>

        {/* ── Foundations ledger + crack readout ──────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          <div className="panel" style={{ padding: 14 }}>
            <SectionHeader>SHARED FOUNDATIONS</SectionHeader>
            {skyline && skyline.foundations.length > 0 ? (
              skyline.foundations.map((f) => (
                <div
                  key={f.id}
                  data-testid="foundation-row"
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 2px", borderBottom: "1px solid var(--hair)" }}
                >
                  <span className="mono" style={{ fontSize: 12 }}>
                    {f.label}
                    <span className="label" style={{ marginLeft: 8 }}>
                      {f.count} STRUCTURES
                    </span>
                  </span>
                  <Button
                    onClick={() => setCrackedId(f.id)}
                    primary={crackedId === f.id}
                    title="Re-verdict every structure resting on this foundation"
                  >
                    {crackedId === f.id ? "CRACKED" : "CRACK IT"}
                  </Button>
                </div>
              ))
            ) : (
              <p className="label" style={{ textTransform: "none" }}>
                No assumption is shared across these decisions — no systemic foundation detected.
              </p>
            )}
          </div>

          <div className="panel" style={{ padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <SectionHeader>CRACK READOUT</SectionHeader>
              {crackedId && (
                <Button onClick={() => setCrackedId(null)}>RESET</Button>
              )}
            </div>
            {crackedFoundation ? (
              <div data-testid="crack-panel">
                <div
                  data-testid="crack-readout"
                  className="mono"
                  style={{ fontSize: 13, fontWeight: 600, color: "var(--keystone)", padding: "6px 0 10px" }}
                >
                  1 ASSUMPTION FEEDS {crackResults.length} STRUCTURES · {collapseCount} COLLAPSE
                </div>
                {crackResults.map((r) => (
                  <div key={r.entryId} data-testid="crack-row">
                    <LedgerRow
                      label={titleOf(r.entryId)}
                      value={
                        <span>
                          <span style={{ color: accentFor(r.integrityBefore) }}>{Math.round(r.integrityBefore)}%</span>
                          {" → "}
                          <span style={{ color: accentFor(r.integrityAfter) }}>{Math.round(r.integrityAfter)}%</span>
                          {"  "}
                          <span className="label" style={{ color: r.failed ? BAD : OK }}>
                            {r.failed ? "COLLAPSE" : "HOLDS"}
                          </span>
                        </span>
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="label" style={{ textTransform: "none" }}>
                Select a shared foundation and CRACK IT to see which decisions collapse.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
