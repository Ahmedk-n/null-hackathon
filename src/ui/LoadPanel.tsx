"use client";
import type { Attack } from "@/engine";

export function LoadPanel({
  onApplyLoad,
  onReset,
  loading,
  loadApplied,
  attacks,
}: {
  onApplyLoad: () => void;
  onReset: () => void;
  loading: boolean;
  loadApplied: boolean;
  attacks: Attack[];
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={onApplyLoad}
          disabled={loading}
          style={{ flex: 1, padding: "10px 14px", background: "#ef4444", color: "#fff", border: "none", borderRadius: 8, fontWeight: 700, cursor: loading ? "default" : "pointer" }}
        >
          {loading ? "Stressing…" : "⚡ Apply Load"}
        </button>
        {loadApplied && (
          <button onClick={onReset} style={{ padding: "10px 14px", background: "#1b2230", color: "#e6edf3", border: "1px solid #46525f", borderRadius: 8, cursor: "pointer" }}>
            Reset
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
        {attacks.map((a) => (
          <div key={a.id} style={{ border: "1px solid #ef4444", background: "#1a0f11", borderRadius: 8, padding: 10 }}>
            <div style={{ color: "#f87171", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>
              {a.category.toUpperCase()} · severity {a.severity.toFixed(2)}
            </div>
            <div style={{ color: "#e6a5a5", fontSize: 12, marginTop: 4 }}>{a.rationale}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
