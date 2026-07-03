"use client";

// Hairline range control (plan §1.2): thin track, square thumb, uppercase label,
// mono tabular value. Thumb/track styling lives in theme.css (.ledger-range).
export function ConfidenceSlider({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (id: string, value: number) => void;
}) {
  return (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="label">{label}</span>
        <span className="mono" style={{ fontSize: 11 }}>
          {value.toFixed(2)}
        </span>
      </span>
      <input
        type="range"
        className="ledger-range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(id, Number(e.target.value))}
        style={{ width: "100%", marginTop: 4 }}
      />
    </label>
  );
}
