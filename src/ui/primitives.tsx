"use client";
// Ledger-style reusable primitives (plan §1.2). Every component is hairline,
// sharp-cornered, with uppercase tracked labels and monospace tabular values.
// No `new Date`/`Math.random`/`Date.now` here — this is a client bundle file.
import type { CSSProperties, ReactNode } from "react";

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
      <div style={{ flex: 1 }} />
      {timestamp && (
        <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
          {timestamp}
        </span>
      )}
      {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
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
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 6,
        height: 30,
        padding: "0 var(--pad)",
        borderTop: "1px solid var(--hair-strong)",
        background: "var(--panel)",
      }}
    >
      {items.map((it, i) => (
        <span key={it.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {i > 0 && <span style={{ color: "var(--hair-strong)" }}>·</span>}
          <span className="label">{it.key}</span>
          <span
            className="mono"
            style={{ fontSize: 11, color: it.accent ?? "var(--ink)" }}
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
