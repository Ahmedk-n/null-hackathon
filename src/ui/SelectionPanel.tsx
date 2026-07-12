"use client";
import { useMemo, useState } from "react";
import type { Graph, GraphNode } from "@/engine";
import { computeSupport, rankLoadBearing } from "@/engine";
// P3-T8 · type-only — the council's per-node contextual weighting is server-produced and pushed
// into the store; this client only READS it (boundary-clean; no `@/agents` value import).
import type { NodeWeighting } from "@/agents/council/types";
import { THESIS, CLAIM, ASSUMPTION, KEYSTONE, HAIR_STRONG, OK, WARN, BAD } from "@/ui/tokens";
import { LedgerRow, SectionHeader, Field, Button, Chip } from "@/ui/primitives";
import { ConfidenceSlider } from "@/ui/ConfidenceSlider";

const TYPE_COLOR: Record<string, string> = { thesis: THESIS, claim: CLAIM, assumption: ASSUMPTION };

const ENCODING: { label: string; color: string }[] = [
  { label: "Thesis", color: THESIS },
  { label: "Claim", color: CLAIM },
  { label: "Assumption", color: ASSUMPTION },
  { label: "Keystone", color: KEYSTONE },
  { label: "Load-path", color: KEYSTONE },
  { label: "Support-edge", color: HAIR_STRONG },
];

function ColorChip({ label, color }: { label: string; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, height: 22 }}>
      <span
        style={{ width: 12, height: 12, background: color, border: "1px solid var(--ink)", flex: "0 0 auto" }}
      />
      <span className="label">{label}</span>
    </div>
  );
}

// Confidence + provenance (V3-6 · V5-3). For an ASSUMPTION we make the number traceable:
//  - human-edited (provenance "modified") → "0.50 · MODIFIED — UNVERIFIED" (--warn); the cited
//    evidence no longer backs the edited belief, so it takes priority over grounding (mirrors
//    memo/derive provenanceOf).
//  - evidence present  → "0.72 · GROUNDED" (--ok) + the fact + source in mono muted.
//  - evidence null/none → "0.85 · UNGROUNDED — ASSUMED" (--warn), disarming "you invented these".
// A MODIFIED thesis/claim shows the MODIFIED row too; otherwise thesis/claim keep the plain row.
function ConfidenceRow({ node }: { node: GraphNode }) {
  const conf = node.confidence.toFixed(2);
  if (node.provenance === "modified") {
    return (
      <div data-evidence="modified">
        <LedgerRow label="Confidence" value={`${conf} · MODIFIED — UNVERIFIED`} accent={WARN} />
      </div>
    );
  }
  if (node.type !== "assumption") {
    return <LedgerRow label="Confidence" value={conf} />;
  }
  // V7-4 · evidence is a multi-citation array. Order supporting first, then contradicting; show
  // up to 2 so a conflicting finding surfaces alongside the corroboration instead of being dropped.
  const evidence = node.evidence ?? null;
  if (evidence && evidence.length > 0) {
    const ordered = [...evidence].sort(
      (a, b) => (a.stance === "contradicts" ? 1 : 0) - (b.stance === "contradicts" ? 1 : 0),
    );
    const shown = ordered.slice(0, 2);
    return (
      <div data-evidence="grounded">
        <LedgerRow label="Confidence" value={`${conf} · GROUNDED`} accent={OK} />
        {shown.map((e, i) => {
          const contradicts = e.stance === "contradicts";
          return (
            <div key={i} data-evidence-stance={contradicts ? "contradicts" : "supports"} style={{ marginTop: 3 }}>
              {contradicts ? (
                <div
                  className="label"
                  style={{ fontSize: 10, letterSpacing: "0.1em", color: BAD }}
                >
                  CONTRADICTS
                </div>
              ) : null}
              <div
                className="mono"
                style={{ fontSize: 11, lineHeight: 1.5, color: contradicts ? BAD : "var(--ink-2)" }}
              >
                {e.fact}
              </div>
              <div className="mono" style={{ fontSize: 11, lineHeight: 1.5, color: "var(--muted)" }}>
                [{e.source}]
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div data-evidence="ungrounded">
      <LedgerRow label="Confidence" value={`${conf} · UNGROUNDED — ASSUMED`} accent={WARN} />
    </div>
  );
}

// V5-3 · how many OTHER nodes a delete would take with it. Simulate the store's cascade:
// drop the node, unwire it from every group, then count nodes no longer reachable from the
// thesis (excluding the deleted node itself). Pure — mirrors validate's reachability repair.
function dependentsRemovedByDelete(graph: Graph, id: string): number {
  if (id === graph.thesisId) return 0;
  const remaining = graph.nodes.filter((n) => n.id !== id);
  const byId = new Map(remaining.map((n) => [n.id, n]));
  const seen = new Set<string>();
  const stack = [graph.thesisId];
  while (stack.length > 0) {
    const cur = stack.pop() as string;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const node = byId.get(cur);
    if (!node) continue;
    for (const group of node.groups) {
      for (const childId of group.childIds) {
        if (childId !== id && !seen.has(childId)) stack.push(childId);
      }
    }
  }
  const survivors = remaining.filter((n) => seen.has(n.id)).length;
  // removed total = (all - survivors); minus 1 for the deleted node → its orphaned dependents.
  return graph.nodes.length - survivors - 1;
}

// V5-3 · handlers the studio wires to the store's editing actions. Optional: when absent the
// panel stays a pure read-only display (the V3-6 selection-panel test renders it that way).
export interface SelectionEditHandlers {
  onRename?: (id: string, label: string) => void;
  onSetConfidence?: (id: string, value: number) => void;
  onAddAssumption?: (parentId: string, label: string) => void;
  onFlipGroup?: (nodeId: string, groupIndex: number) => void;
  onDelete?: (id: string) => void;
  editError?: string | null;
}

// V5-3 · EDIT section. Terminal styling (.label/.mono, zero radius, hairlines). Keyed by node.id
// in the parent so its local field state resets cleanly when the selection changes.
function EditSection({
  graph,
  node,
  onRename,
  onSetConfidence,
  onAddAssumption,
  onFlipGroup,
  onDelete,
  editError,
}: {
  graph: Graph;
  node: GraphNode;
} & SelectionEditHandlers) {
  const [newLabel, setNewLabel] = useState("");
  const canParent = node.type === "claim" || node.type === "thesis";
  const dependents = onDelete && node.id !== graph.thesisId
    ? dependentsRemovedByDelete(graph, node.id)
    : 0;

  return (
    <div>
      <SectionHeader>Edit</SectionHeader>

      {editError ? (
        <div style={{ marginBottom: 8 }} data-testid="edit-error">
          <Chip tone="warn">{editError}</Chip>
        </div>
      ) : null}

      {/* RENAME — commit on blur / Enter. Uncontrolled (keyed by node in parent) so it seeds
          from the current label without a controlled-state round-trip. */}
      {onRename ? (
        <label style={{ display: "block", marginBottom: 10 }}>
          <span className="label" style={{ display: "block", marginBottom: 5 }}>
            Rename
          </span>
          <input
            className="field-input"
            data-testid="rename-input"
            defaultValue={node.label}
            style={{ fontFamily: "var(--sans)" }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== node.label) onRename(node.id, v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const v = (e.target as HTMLInputElement).value.trim();
                if (v && v !== node.label) onRename(node.id, v);
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </label>
      ) : null}

      {/* CONFIDENCE — assumptions only (grounding/knock-out is an assumption concept). */}
      {onSetConfidence && node.type === "assumption" ? (
        <ConfidenceSlider
          id={node.id}
          label="Confidence"
          value={node.confidence}
          onChange={(id, v) => onSetConfidence(id, v)}
        />
      ) : null}

      {/* ADD ASSUMPTION — on claims + the thesis. */}
      {onAddAssumption && canParent ? (
        <div style={{ marginBottom: 10 }}>
          <Field
            label="Add Assumption"
            value={newLabel}
            onChange={setNewLabel}
            placeholder="New assumption…"
            mono={false}
          />
          <Button
            style={{ marginTop: 6 }}
            disabled={newLabel.trim().length === 0}
            onClick={() => {
              const v = newLabel.trim();
              if (v) {
                onAddAssumption(node.id, v);
                setNewLabel("");
              }
            }}
          >
            Add
          </Button>
        </div>
      ) : null}

      {/* AND↔OR toggle per dependency group. */}
      {onFlipGroup && node.groups.length > 0 ? (
        <div style={{ marginBottom: 10 }}>
          <span className="label" style={{ display: "block", marginBottom: 5 }}>
            Groups
          </span>
          {node.groups.map((g, i) => (
            <div
              key={i}
              style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}
            >
              <button
                type="button"
                data-testid="group-toggle"
                onClick={() => onFlipGroup(node.id, i)}
                className="mono"
                style={{
                  padding: "3px 8px",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  border: "1px solid var(--hair-strong)",
                  borderRadius: 0,
                  background: "transparent",
                  color: "var(--ink)",
                  cursor: "pointer",
                }}
              >
                {g.kind}
              </button>
              <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                {g.childIds.length} child{g.childIds.length === 1 ? "" : "ren"}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {/* DELETE — refused for the thesis (root); note the orphaned dependents count. */}
      {onDelete && node.id !== graph.thesisId ? (
        <div>
          <Button
            style={{ color: "var(--bad)", borderColor: "var(--bad)" }}
            onClick={() => onDelete(node.id)}
          >
            Delete Node
          </Button>
          <div
            className="mono"
            data-testid="delete-note"
            style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}
          >
            removes {dependents} dependent node{dependents === 1 ? "" : "s"}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SelectionPanel({
  graph,
  selectedNodeId,
  keystoneId,
  nodeWeights,
  onRename,
  onSetConfidence,
  onAddAssumption,
  onFlipGroup,
  onDelete,
  editError,
}: {
  graph: Graph | null;
  selectedNodeId: string | null;
  keystoneId: string | null;
  // P3-T8 · the grounded council's per-node contextual weightings (undefined when no grounded
  // council). When the selected node has an entry, its context weight + rationale surface below
  // the metrics — the situation-aware "how load-bearing is THIS node given the decision".
  nodeWeights?: readonly NodeWeighting[];
} & SelectionEditHandlers) {
  // Editing is enabled when the studio wires at least one action (kept off for the pure
  // read-only render in the V3-6 provenance test).
  const editable = !!(onRename || onSetConfidence || onAddAssumption || onFlipGroup || onDelete);
  const detail = useMemo(() => {
    if (!graph || !selectedNodeId) return null;
    const node = graph.nodes.find((n) => n.id === selectedNodeId);
    if (!node) return null;

    const support = computeSupport(graph).get(node.id) ?? 0;

    // Knock-out impact only exists for assumptions (rankLoadBearing scans assumptions).
    const impact =
      node.type === "assumption"
        ? rankLoadBearing(graph).find((k) => k.id === node.id)?.impact ?? 0
        : null;

    // FEEDS: labels of parents that depend on this node.
    const feeds = graph.nodes
      .filter((p) => p.groups.some((g) => g.childIds.includes(node.id)))
      .map((p) => p.label);

    return { node, support, impact, feeds };
  }, [graph, selectedNodeId]);

  // P3-T8 · the council's contextual weighting for the selected node (if a grounded council
  // scored it). Read-only; resolves by id straight from the props.
  const weight = useMemo(
    () => (selectedNodeId ? nodeWeights?.find((w) => w.nodeId === selectedNodeId) ?? null : null),
    [nodeWeights, selectedNodeId],
  );

  return (
    // Task 7 · roomier detail panel. The old panel crammed the label, four metric rows, the FEEDS
    // list, the EDIT controls and the ENCODING key into one undifferentiated stack. It now breathes:
    // the selected node's LABEL + TYPE lead as a header block over a hairline, the read-out metrics
    // sit in their own quiet group, and EDIT / ENCODING are set off by full-width hairline rules so
    // the hierarchy (what · its numbers · how to change it · the key) reads top-to-bottom.
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <SectionHeader>Selection</SectionHeader>
        {detail ? (
          <>
            {/* Header block — the node's identity, given room to be the first thing read. */}
            <div style={{ paddingBottom: 10, borderBottom: "1px solid var(--hair)", marginBottom: 12 }}>
              <div
                style={{ fontFamily: "var(--sans)", fontWeight: 600, fontSize: 14, lineHeight: 1.35, marginBottom: 8 }}
              >
                {detail.node.label}
              </div>
              <LedgerRow
                label="Type"
                value={detail.node.id === keystoneId ? "KEYSTONE" : detail.node.type.toUpperCase()}
                accent={detail.node.id === keystoneId ? KEYSTONE : TYPE_COLOR[detail.node.type]}
              />
            </div>
            {/* Metrics group — confidence/support/knock-out read as one cluster of numbers. */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <ConfidenceRow node={detail.node} />
              <LedgerRow label="Support" value={`${Math.round(detail.support * 100)}%`} />
              <LedgerRow
                label="Knock-out Impact"
                value={detail.impact === null ? "—" : `${detail.impact.toFixed(1)} pts`}
                accent={detail.impact !== null && detail.impact > 0 ? KEYSTONE : undefined}
              />
            </div>
            <div style={{ marginTop: 14 }}>
              <span className="label" style={{ display: "block", marginBottom: 6 }}>
                Feeds
              </span>
              {detail.feeds.length ? (
                detail.feeds.map((f) => (
                  <div key={f} className="mono" style={{ fontSize: 11, lineHeight: 1.6 }}>
                    → {f}
                  </div>
                ))
              ) : (
                <span className="mono" style={{ fontSize: 11 }}>
                  — (root thesis)
                </span>
              )}
            </div>
            {/* P3-T8 · CONTEXT WEIGHT — the council's situation-aware read of how load-bearing this
                node is GIVEN the decision, with its grounded rationale. Only when the (grounded)
                council scored this node; otherwise the panel is unchanged. */}
            {weight ? (
              <div style={{ marginTop: 14 }} data-testid="council-node-weight">
                <span className="label" style={{ display: "block", marginBottom: 6 }}>
                  Context Weight
                </span>
                <LedgerRow label="Weight" value={weight.contextWeight.toFixed(2)} accent={KEYSTONE} />
                <div
                  className="mono"
                  data-testid="council-node-rationale"
                  style={{ fontSize: 11, lineHeight: 1.5, color: "var(--ink-2)", marginTop: 4 }}
                >
                  {weight.rationale}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="label" style={{ marginTop: 8, color: "var(--muted)" }}>
            Select a node
          </div>
        )}
      </div>

      {/* V5-3 · EDIT section — only when editing is wired AND a node is selected. Keyed by node
          id so field state resets on selection change. The solver re-verdicts live: structural
          edits rebuild workingGraph and the integrity/keystone selectors recompute immediately.
          Task 7 · set off by a full-width hairline so it reads as a distinct band, not a fifth
          row in the metrics stack. */}
      {editable && detail ? (
        <div style={{ borderTop: "1px solid var(--hair-strong)", paddingTop: 16 }}>
          <EditSection
            key={detail.node.id}
            graph={graph as Graph}
            node={detail.node}
            onRename={onRename}
            onSetConfidence={onSetConfidence}
            onAddAssumption={onAddAssumption}
            onFlipGroup={onFlipGroup}
            onDelete={onDelete}
            editError={editError}
          />
        </div>
      ) : null}

      <div style={{ borderTop: "1px solid var(--hair-strong)", paddingTop: 16 }}>
        <SectionHeader>Encoding</SectionHeader>
        {ENCODING.map((e) => (
          <ColorChip key={e.label} label={e.label} color={e.color} />
        ))}
      </div>
    </div>
  );
}
