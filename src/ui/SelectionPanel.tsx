"use client";
import { useMemo } from "react";
import type { Graph } from "@/engine";
import { computeSupport, rankLoadBearing } from "@/engine";
import { THESIS, CLAIM, ASSUMPTION, KEYSTONE, HAIR_STRONG } from "@/ui/tokens";
import { LedgerRow, SectionHeader } from "@/ui/primitives";

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

export function SelectionPanel({
  graph,
  selectedNodeId,
  keystoneId,
}: {
  graph: Graph | null;
  selectedNodeId: string | null;
  keystoneId: string | null;
}) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--gap)" }}>
      <div>
        <SectionHeader>Selection</SectionHeader>
        {detail ? (
          <>
            <div
              style={{ fontFamily: "var(--sans)", fontWeight: 600, fontSize: 13, margin: "2px 0 8px" }}
            >
              {detail.node.label}
            </div>
            <LedgerRow
              label="Type"
              value={detail.node.id === keystoneId ? "KEYSTONE" : detail.node.type.toUpperCase()}
              accent={detail.node.id === keystoneId ? KEYSTONE : TYPE_COLOR[detail.node.type]}
            />
            <LedgerRow label="Confidence" value={detail.node.confidence.toFixed(2)} />
            <LedgerRow label="Support" value={`${Math.round(detail.support * 100)}%`} />
            <LedgerRow
              label="Knock-out Impact"
              value={detail.impact === null ? "—" : `${detail.impact.toFixed(1)} pts`}
              accent={detail.impact !== null && detail.impact > 0 ? KEYSTONE : undefined}
            />
            <div style={{ marginTop: 4 }}>
              <span className="label" style={{ display: "block", marginBottom: 4 }}>
                Feeds
              </span>
              {detail.feeds.length ? (
                detail.feeds.map((f) => (
                  <div key={f} className="mono" style={{ fontSize: 11, lineHeight: 1.5 }}>
                    → {f}
                  </div>
                ))
              ) : (
                <span className="mono" style={{ fontSize: 11 }}>
                  — (root thesis)
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="label" style={{ marginTop: 6 }}>
            Select a node
          </div>
        )}
      </div>

      <div>
        <SectionHeader>Encoding</SectionHeader>
        {ENCODING.map((e) => (
          <ColorChip key={e.label} label={e.label} color={e.color} />
        ))}
      </div>
    </div>
  );
}
