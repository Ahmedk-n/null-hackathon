"use client";

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
    <label style={{ display: "block", marginBottom: 10, fontSize: 12, color: "#cdd6e0" }}>
      <span style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{label}</span>
        <span style={{ color: "#8b98a5" }}>{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(id, Number(e.target.value))}
        style={{ width: "100%" }}
      />
    </label>
  );
}
