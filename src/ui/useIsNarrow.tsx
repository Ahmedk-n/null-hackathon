"use client";
// M-1 · shared narrow-viewport hook + segmented pane switch, used by the GRAPH and STRESS
// tabs to reflow their fixed three-pane row (rail · canvas · rail) into a single scrollable
// column on a phone. Modeled 1:1 on `usePrefersReducedMotion`: hydration-safe (always renders
// `false` — i.e. DESKTOP — on the first client render, matching the server which has no
// `window`), only flips via an effect, and never reads `matchMedia` during render. Defensive:
// jsdom test environments may not implement `matchMedia` (the tab tests shim it to
// `matches:false`, so both rails still render and every existing assertion holds), so a missing
// API is treated as "not narrow" rather than throwing.
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";

export function useIsNarrow(maxWidth: number): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(`(max-width: ${maxWidth}px)`);
    setNarrow(mql.matches);
    const onChange = () => setNarrow(mql.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [maxWidth]);
  return narrow;
}

// PaneSwitch — the mobile-only segmented control that swaps which rail shows beneath the
// stacked canvas. Same terminal/ledger treatment as GraphTab's DepthViewToggle / StressTab's
// ContextToggle (uppercase tracked mono, hairline-strong frame, zero radius, active = ink fill)
// so it reads as native chrome, not a bolt-on. Generic over the option ids so each tab names
// its own panes without duplicating the styling.
export function PaneSwitch<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const seg = (active: boolean): CSSProperties => ({
    flex: 1,
    padding: "8px 8px",
    fontFamily: "var(--mono)",
    fontSize: 10,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    textAlign: "center",
    cursor: "pointer",
    border: "none",
    borderRadius: 0,
    background: active ? "var(--ink)" : "transparent",
    color: active ? "var(--bg)" : "var(--muted)",
  });
  return (
    <div
      data-testid="pane-switch"
      style={{ display: "flex", border: "1px solid var(--hair-strong)", borderRadius: 0 }}
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          style={seg(value === o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
