"use client";
import { useMemo } from "react";
import type { Attack } from "@/engine";
import {
  keystoneStore,
  useKeystone,
  selectIntegrity,
  selectKeystoneId,
  selectFailures,
} from "@/store/useKeystone";
import { KeystoneCanvas } from "@/canvas/KeystoneCanvas";
import { IntegrityGauge } from "@/ui/IntegrityGauge";
import { ContextUsedPanel } from "@/ui/ContextUsedPanel";
import { SectionHeader, Button } from "@/ui/primitives";

const RAIL: React.CSSProperties = {
  width: 340,
  minWidth: 340,
  borderRight: "1px solid var(--hair)",
  padding: "var(--pad)",
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: "var(--gap)",
  background: "var(--panel)",
};

const RIGHT: React.CSSProperties = {
  width: 300,
  minWidth: 300,
  borderLeft: "1px solid var(--hair)",
  padding: "var(--pad)",
  overflowY: "auto",
  background: "var(--panel)",
};

// A/B toggle — the demo. IGNORE CONTEXT (raw attacks, structure survives) ⟷
// GROUND IN CONTEXT (hero pack reweights severities, keystone cracks, collapse).
// Terminal/ledger styling: uppercase tracked labels, mono, zero radius.
function ContextToggle({
  grounded,
  onChange,
  disabled,
}: {
  grounded: boolean;
  onChange: (grounded: boolean) => void;
  disabled?: boolean;
}) {
  const seg = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "7px 8px",
    fontFamily: "var(--mono)",
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    textAlign: "center",
    cursor: disabled ? "default" : "pointer",
    border: "none",
    borderRadius: 0,
    background: active ? (grounded ? "var(--bad)" : "var(--ink)") : "transparent",
    color: active ? "var(--bg)" : "var(--muted)",
    opacity: disabled ? 0.5 : 1,
  });
  return (
    <div>
      <span className="label" style={{ display: "block", marginBottom: 5 }}>
        Attack Basis
      </span>
      <div
        data-testid="context-toggle"
        style={{ display: "flex", border: "1px solid var(--hair-strong)", borderRadius: 0 }}
      >
        <button
          type="button"
          aria-pressed={!grounded}
          disabled={disabled}
          onClick={() => onChange(false)}
          style={seg(!grounded)}
        >
          Ignore Context
        </button>
        <button
          type="button"
          aria-pressed={grounded}
          disabled={disabled}
          onClick={() => onChange(true)}
          style={seg(grounded)}
        >
          Ground In Context
        </button>
      </div>
    </div>
  );
}

// One attack rendered as a ledger block: CATEGORY (uppercase) + SEVERITY (mono),
// the target id muted beneath, and a severity bar (width = severity, red).
function AttackRow({ attack }: { attack: Attack }) {
  return (
    <div style={{ borderBottom: "1px solid var(--hair)", padding: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="label">{attack.category}</span>
        <span className="mono" style={{ fontSize: 12, color: "var(--bad)" }}>
          {attack.severity.toFixed(2)}
        </span>
      </div>
      <div className="mono" style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
        {attack.targetId}
      </div>
      <div style={{ marginTop: 5, height: 3, background: "var(--panel-2)" }}>
        <div
          style={{
            height: "100%",
            width: `${Math.min(100, Math.max(0, attack.severity * 100))}%`,
            background: "var(--bad)",
          }}
        />
      </div>
    </div>
  );
}

export function StressTab({
  onApplyLoad,
  onReset,
  onReinforce,
  loading,
}: {
  onApplyLoad: () => void;
  onReset: () => void;
  onReinforce?: () => void;
  loading: boolean;
}) {
  const graph = useKeystone((s) => s.workingGraph);
  const attacks = useKeystone((s) => s.attacks);
  const loadApplied = useKeystone((s) => s.loadApplied);
  const keystoneId = useKeystone(selectKeystoneId);
  const failures = useKeystone(selectFailures);
  const integrityValue = useKeystone(selectIntegrity);
  const tilt = useKeystone((s) => s.tilt);
  const pack = useKeystone((s) => s.decisionContextPack);
  const source = useKeystone((s) => s.contextSource);
  const applyContextWeights = useKeystone((s) => s.applyContextWeights);

  // Sort by severity desc — highest-impact attack reads first.
  const sorted = useMemo(
    () => [...attacks].sort((a, b) => b.severity - a.severity),
    [attacks],
  );

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* LEFT — ATTACK LEDGER + actions */}
      <div style={RAIL}>
        <div>
          <SectionHeader>Attack Ledger</SectionHeader>
          {sorted.length === 0 ? (
            <div className="label" style={{ padding: "12px 0" }}>
              Apply load to stress the structure
            </div>
          ) : (
            sorted.map((a) => <AttackRow key={a.id} attack={a} />)
          )}
        </div>

        <ContextToggle
          grounded={applyContextWeights}
          disabled={loading}
          onChange={(g) => keystoneStore.getState().setApplyContextWeights(g)}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <Button primary onClick={onApplyLoad} disabled={loading}>
            Apply Load
          </Button>
          <Button onClick={onReset}>Reset</Button>
          {onReinforce && loadApplied && (
            <Button onClick={onReinforce}>Reinforce</Button>
          )}
        </div>
      </div>

      {/* CENTER — 3D adaptive canvas + integrity gauge overlay */}
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        {graph ? (
          <KeystoneCanvas
            graph={graph}
            keystoneId={keystoneId}
            failures={failures}
            tilt={tilt}
            onSelect={(id) => keystoneStore.getState().setSelectedNode(id)}
          />
        ) : (
          <div className="label" style={{ padding: "var(--pad)" }}>
            No structure yet — analyse a decision first.
          </div>
        )}
        <div
          style={{
            position: "absolute",
            top: "var(--pad)",
            right: "var(--pad)",
            background: "var(--panel)",
            border: "1px solid var(--hair)",
            padding: 8,
          }}
        >
          <IntegrityGauge value={integrityValue} />
        </div>
      </div>

      {/* RIGHT — CONTEXT USED */}
      <div style={RIGHT}>
        {pack ? (
          <ContextUsedPanel pack={pack} source={source ?? "fixture"} />
        ) : (
          <div className="label" style={{ padding: "var(--pad)" }}>
            Run analyse to ground the decision
          </div>
        )}
      </div>
    </div>
  );
}
