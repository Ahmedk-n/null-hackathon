"use client";
// Reusable UI primitives. The clean-modern redesign (2026-07) adds a card / pill /
// gauge / disclosure vocabulary the tabs compose from; the older ledger primitives
// (LedgerRow, SectionHeader, …) are kept working alongside them.
// No `new Date`/`Math.random`/`Date.now` here — this is a client bundle file.
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

// ── Card ──────────────────────────────────────────────────────────────
// The soft white panel of the redesign (reuses the `.panel` card class). `pad`
// adds interior padding: `true` → the standard 18px, or a custom number.
export function Card({
  children,
  pad,
  style,
}: {
  children: ReactNode;
  pad?: boolean | number;
  style?: CSSProperties;
}) {
  const padding = pad === true ? 18 : typeof pad === "number" ? pad : undefined;
  return (
    <div className="panel" style={{ padding, ...style }}>
      {children}
    </div>
  );
}

// ── Eyebrow ───────────────────────────────────────────────────────────
// The small uppercase section caption (a lighter, less-shouty `.label`).
export function Eyebrow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span className="label" style={style}>
      {children}
    </span>
  );
}

// ── Pill ──────────────────────────────────────────────────────────────
// Status pill — weak-bg + strong-fg per tone, rounded, sans, with a leading dot.
export type PillTone = "hold" | "warn" | "crack" | "accent" | "neutral";
const PILL_TONES: Record<PillTone, { bg: string; fg: string }> = {
  hold: { bg: "var(--ok-weak)", fg: "var(--ok)" },
  warn: { bg: "color-mix(in srgb, var(--warn) 15%, var(--panel))", fg: "var(--warn)" },
  crack: { bg: "var(--bad-bg)", fg: "var(--bad)" },
  accent: { bg: "var(--accent-weak)", fg: "var(--accent)" },
  neutral: { bg: "var(--panel-2)", fg: "var(--muted)" },
};
export function Pill({
  tone = "neutral",
  children,
  dot = true,
}: {
  tone?: PillTone;
  children: ReactNode;
  dot?: boolean;
}) {
  const { bg, fg } = PILL_TONES[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontFamily: "var(--sans)",
        fontSize: 12,
        fontWeight: 600,
        padding: "5px 11px",
        borderRadius: 999,
        background: bg,
        color: fg,
        whiteSpace: "nowrap",
      }}
    >
      {dot && (
        <span
          aria-hidden
          style={{ width: 7, height: 7, borderRadius: 999, background: "currentColor" }}
        />
      )}
      {children}
    </span>
  );
}

// ── Gauge ─────────────────────────────────────────────────────────────
// Pure radial SVG gauge from the mockup: grey track + a colored arc + a centered
// big number. Deterministic — the dash offset is computed straight from value/max,
// no Date/Math.random. `tone` selects the arc color; `label` is the small caption
// beneath the number.
export type GaugeTone = "ok" | "warn" | "bad" | "accent";
const GAUGE_TONES: Record<GaugeTone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--bad)",
  accent: "var(--accent)",
};
export function Gauge({
  value,
  max = 100,
  tone = "ok",
  size = 118,
  label,
}: {
  value: number;
  max?: number;
  tone?: GaugeTone;
  size?: number;
  label?: ReactNode;
}) {
  const r = 52;
  const circumference = 2 * Math.PI * r;
  const frac = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  // The arc is drawn from the 12-o'clock position (rotate -90); dashoffset shrinks
  // as the filled fraction grows.
  const dashoffset = circumference * (1 - frac);
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}>
      <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden>
        <circle cx={60} cy={60} r={r} fill="none" stroke="var(--hair-strong)" strokeWidth={9} />
        <circle
          cx={60}
          cy={60}
          r={r}
          fill="none"
          stroke={GAUGE_TONES[tone]}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeContent: "center",
          textAlign: "center",
        }}
      >
        <div
          className="mono"
          style={{ fontSize: 30, fontWeight: 680, letterSpacing: "-0.02em", lineHeight: 1 }}
        >
          {Math.round(value)}
          <span style={{ fontSize: 15 }}>%</span>
        </div>
        {label && (
          <div
            style={{
              fontSize: 10,
              color: "var(--muted)",
              marginTop: 3,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Disclosure ────────────────────────────────────────────────────────
// Clean expandable `<details>` with a rotating chevron. Reuses `.ledger-details`
// (theme.css strips the native marker). Controlled so the chevron reflects state
// without any `[open]` CSS rule.
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
  testId,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details
      className="ledger-details"
      data-testid={testId}
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      style={{ borderTop: "1px solid var(--hair)" }}
    >
      <summary
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "11px 0",
          fontFamily: "var(--sans)",
          fontSize: 13,
          fontWeight: 550,
          color: "var(--ink)",
        }}
      >
        <span>{summary}</span>
        <span
          aria-hidden
          style={{
            color: "var(--muted)",
            fontSize: 15,
            lineHeight: 1,
            transition: "transform 0.15s ease",
            transform: open ? "rotate(90deg)" : "none",
          }}
        >
          ›
        </span>
      </summary>
      <div style={{ paddingBottom: 12 }}>{children}</div>
    </details>
  );
}

// ── LedgerRow ─────────────────────────────────────────────────────────
// label left (uppercase muted), value right (mono, tabular). accent recolors
// the value; `mono` (default true) toggles the monospace value styling.
export function LedgerRow({
  label,
  value,
  accent,
  mono = true,
}: {
  label: ReactNode;
  value: ReactNode;
  accent?: string;
  mono?: boolean;
}) {
  return (
    <div className="ledger-row">
      <span className="label">{label}</span>
      <span
        className={mono ? "ledger-value mono" : "ledger-value"}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

// ── SectionHeader ─────────────────────────────────────────────────────
export function SectionHeader({ children }: { children: ReactNode }) {
  return <div className="section-header">{children}</div>;
}

// ── Button ────────────────────────────────────────────────────────────
export function Button({
  children,
  onClick,
  primary,
  disabled,
  style,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={primary ? "btn btn-primary" : "btn"}
      style={style}
    >
      {children}
    </button>
  );
}

// ── Field (labeled input / textarea) ──────────────────────────────────
export function Field({
  label,
  value,
  onChange,
  rows,
  placeholder,
  mono = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  mono?: boolean;
}) {
  const style: CSSProperties | undefined = mono ? undefined : { fontFamily: "var(--sans)" };
  return (
    <label style={{ display: "block" }}>
      <span className="label" style={{ display: "block", marginBottom: 5 }}>
        {label}
      </span>
      {rows && rows > 1 ? (
        <textarea
          className="field-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          style={style}
        />
      ) : (
        <input
          className="field-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={style}
        />
      )}
    </label>
  );
}

// ── Select ────────────────────────────────────────────────────────────
export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "block" }}>
      {label && (
        <span className="label" style={{ display: "block", marginBottom: 5 }}>
          {label}
        </span>
      )}
      <select
        className="field-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ fontFamily: "var(--sans)", cursor: "pointer" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ── Tabs (flat uppercase, active = 2px ink underline) ─────────────────
export interface TabDef {
  id: string;
  label: string;
}
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", borderBottom: "1px solid var(--hair)" }}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          data-tab={t.id}
          onClick={() => onChange(t.id)}
          className={active === t.id ? "tab tab-active" : "tab"}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// Compact "YYYY-MM-DD · HH:MM" stamp from a server-passed ISO string. Plain
// string slicing only — this file is a client component and `new Date(...)` /
// `.toLocaleString()` would read the browser's timezone, causing a
// server/client hydration mismatch. Falls back to the raw value if the input
// doesn't look like ISO-8601.
const ISO_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
function formatStamp(ts: string): string {
  if (!ISO_STAMP.test(ts)) return ts;
  return `${ts.slice(0, 10)} · ${ts.slice(11, 16)}`;
}

// ── TopBar ────────────────────────────────────────────────────────────
export function TopBar({
  title,
  subtitle,
  timestamp,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  timestamp?: string;
  actions?: ReactNode;
}) {
  return (
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
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, minWidth: 0 }}>
        <span
          style={{
            fontFamily: "var(--sans)",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </span>
        {subtitle && (
          <span
            className="label"
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {subtitle}
          </span>
        )}
      </div>
      {/* M-2: the spacer collapses below ~640px (theme.css) so the actions row can claim the
          remaining width and scroll internally instead of pushing the page wider than the viewport. */}
      <div className="topbar-spacer" style={{ flex: 1 }} />
      {timestamp && (
        <span
          className="mono topbar-stamp"
          style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}
        >
          {formatStamp(timestamp)}
        </span>
      )}
      {/* M-2: below ~640px this action cluster becomes a horizontally scrollable, non-wrapping
          row (theme.css) — like the StatusStrip (T1) — so five buttons never force page h-scroll
          and the 52px header height stays fixed. */}
      {actions && <div className="topbar-actions" style={{ display: "flex", gap: 8 }}>{actions}</div>}
    </header>
  );
}

// ── StatusStrip (uppercase `KEY value · KEY value` segments) ──────────
export interface StatusItem {
  key: string;
  value: ReactNode;
  accent?: string;
}
export function StatusStrip({ items }: { items: StatusItem[] }) {
  return (
    <footer
      className="status-strip"
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "nowrap",
        gap: 6,
        height: 30,
        padding: "0 var(--pad)",
        borderTop: "1px solid var(--hair-strong)",
        background: "var(--panel)",
        overflowX: "auto",
        overflowY: "hidden",
      }}
    >
      {items.map((it, i) => (
        <span
          key={it.key}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, flex: "0 0 auto" }}
        >
          {i > 0 && <span style={{ color: "var(--hair-strong)" }}>·</span>}
          <span className="label" style={{ whiteSpace: "nowrap" }}>
            {it.key}
          </span>
          <span
            className="mono"
            style={{ fontSize: 11, color: it.accent ?? "var(--ink)", whiteSpace: "nowrap" }}
          >
            {it.value}
          </span>
        </span>
      ))}
    </footer>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────
export function Chip({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: "ok" | "warn" | "bad" | "muted";
}) {
  const color =
    tone === "ok"
      ? "var(--ok)"
      : tone === "warn"
        ? "var(--warn)"
        : tone === "bad"
          ? "var(--bad)"
          : "var(--muted)";
  return (
    <span className="chip" style={{ color, borderColor: color }}>
      {children}
    </span>
  );
}

// ── EmptyCanvas ────────────────────────────────────────────────────────
// Centered placeholder for a canvas area with no structure yet (W3-3): a faint
// wireframe keystone arch drawn in hairline --muted strokes, with an "AWAITING
// STRUCTURE" label beneath. Fills its container and centers both axes.
export function EmptyCanvas({ label = "Awaiting Structure" }: { label?: string }) {
  return (
    <div
      data-testid="empty-canvas"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        width: "100%",
        height: "100%",
        userSelect: "none",
      }}
    >
      {/* Wireframe keystone arch — voussoirs fanning around a highlighted keystone. */}
      <svg
        width={148}
        height={104}
        viewBox="0 0 148 104"
        fill="none"
        stroke="var(--muted)"
        strokeWidth={1}
        aria-hidden
        style={{ opacity: 0.55 }}
      >
        {/* springing line + piers */}
        <line x1={10} y1={92} x2={138} y2={92} />
        <line x1={24} y1={92} x2={24} y2={64} />
        <line x1={124} y1={92} x2={124} y2={64} />
        {/* outer + inner arch curves */}
        <path d="M24 64 A50 50 0 0 1 124 64" />
        <path d="M40 64 A34 34 0 0 1 108 64" />
        {/* voussoir joints radiating from the arch centre (74,64) */}
        <line x1={24} y1={64} x2={40} y2={64} />
        <line x1={124} y1={64} x2={108} y2={64} />
        <line x1={34.5} y1={40.5} x2={46.9} y2={49.6} />
        <line x1={113.5} y1={40.5} x2={101.1} y2={49.6} />
        {/* keystone wedge at the crown, emphasized */}
        <path d="M64 26 L84 26 L80 46 L68 46 Z" stroke="var(--muted)" strokeWidth={1.4} />
      </svg>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span className="label" style={{ letterSpacing: "0.16em" }}>
          {label}
        </span>
        {/* The manifesto, whispered: structure is not decoration — thought has load paths. */}
        <span
          className="label"
          style={{ letterSpacing: "0.14em", color: "var(--muted)", opacity: 0.7 }}
        >
          BELIEFS HAVE DEPENDENCIES · PLANS HAVE LOAD-BEARING ASSUMPTIONS
        </span>
      </div>
    </div>
  );
}
