"use client";
// P2-T7 · the read-only structure rendered on a share link (/d/[id]). Deliberately NOT wired to
// the global keystoneStore (a share visitor may have no session/local state at all) — every value
// is a prop straight from the fetched row, and this reuses the SAME read-only components the
// studio itself uses (KeystoneCanvas, ContextUsedPanel), just without any onSelect/edit wiring.
import { useState } from "react";
import Link from "next/link";
import type { Graph } from "@/engine";
import { constraintPlanes as deriveConstraintPlanes } from "@/context/constraints";
import type { CompanyContext, ContextInput, DecisionContextPack } from "@/context";
import { KeystoneCanvas } from "@/canvas/KeystoneCanvas";
import { ContextUsedPanel } from "@/ui/ContextUsedPanel";
import { SectionHeader, LedgerRow, Button } from "@/ui/primitives";
import { statusWord, statusAccent } from "@/ui/memo/derive";

export interface ShareDecision {
  id: string;
  title: string;
  savedAtISO: string;
  mode: string;
  input: ContextInput;
  companyContext: CompanyContext | null;
  pack: DecisionContextPack | null;
  graph: Graph;
  verdict: { integrity: number; keystoneId: string | null; failedIds: string[]; loadApplied: boolean };
}

export function ShareView({ decision }: { decision: ShareDecision }) {
  const [copied, setCopied] = useState(false);
  const word = statusWord(decision.verdict.integrity);
  const failures = new Set(decision.verdict.failedIds);
  const planes = deriveConstraintPlanes(decision.pack); // accepts null pack -> []

  function copyLink() {
    try {
      const url = typeof window !== "undefined" ? window.location.href : "";
      if (url && navigator.clipboard) {
        void navigator.clipboard.writeText(url).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }
    } catch {
      // clipboard permission denied / unavailable — the URL is still visible in the address bar
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          height: 52,
          padding: "0 var(--pad)",
          borderBottom: "1px solid var(--hair-strong)",
          background: "var(--panel)",
          gap: "var(--gap)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--sans)",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          ▣ Keystone — Shared decision
        </span>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
          {decision.savedAtISO}
        </span>
        <Button onClick={copyLink} title="Copy this share link">
          {copied ? "Copied" : "Copy link"}
        </Button>
        <Link href="/" className="btn" style={{ textDecoration: "none" }}>
          Keystone
        </Link>
      </header>

      <main style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "var(--gap)", padding: "var(--pad)" }}>
        <div className="panel" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="label" style={{ letterSpacing: "0.14em" }}>
            Decision
          </span>
          <span
            data-testid="share-title"
            style={{ fontFamily: "var(--sans)", fontWeight: 700, fontSize: 17, lineHeight: 1.3 }}
          >
            {decision.title}
          </span>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 4 }}>
            <LedgerRow
              label="Integrity"
              value={`${Math.round(decision.verdict.integrity)}% ${word}`}
              accent={statusAccent(word)}
            />
            <LedgerRow label="Keystone" value={decision.verdict.keystoneId ?? "—"} />
            <LedgerRow label="Mode" value={decision.mode.toUpperCase()} />
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 420, display: "flex", gap: "var(--gap)" }}>
          <div className="panel" style={{ flex: 1, minWidth: 0, padding: 4 }} data-testid="share-canvas">
            <KeystoneCanvas
              graph={decision.graph}
              keystoneId={decision.verdict.keystoneId}
              failures={failures}
              loadApplied={decision.verdict.loadApplied}
              constraintPlanes={planes}
              detail={true}
            />
          </div>
        </div>

        {decision.pack ? (
          <ContextUsedPanel pack={decision.pack} source="fixture" />
        ) : (
          <div className="panel" style={{ padding: 14 }}>
            <SectionHeader>Context used</SectionHeader>
            <p className="label" style={{ textTransform: "none" }}>
              No context pack was recorded with this snapshot.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
