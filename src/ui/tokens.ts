// TS mirror of the theme.css accents (plan §1.1 / §2.201) for inline styles —
// React Flow node styling, SVG strokes, and anywhere a CSS variable can't reach.
// Keep these in exact sync with src/ui/theme.css.

export const THESIS = "#2c4a76";
export const CLAIM = "#2f6b64";
export const ASSUMPTION = "#6f6d64";
export const KEYSTONE = "#b23a2e";
export const INCREASE = "#a9741a";
export const DECREASE = "#7a786f";
export const OK = "#3c7a3a";
export const WARN = "#a9741a";
export const BAD = "#b23a2e";
export const BAD_BG = "#f6ecea"; // failed-node fill (--bad-bg)

export const HAIR = "#d8d5cc";
export const HAIR_STRONG = "#b7b3a7";
export const INK = "#1a1a15";
export const INK_2 = "#45443d";
export const MUTED = "#7a786f";
export const BG = "#f5f4ef";
export const PANEL = "#fbfaf6";
export const PANEL_2 = "#efeee8";

// ── Driver-cluster palette (Task 7) ──────────────────────────────────────
// Muted, ledger-safe accents used ONLY to tag/group assumption nodes by their
// dominant latent driver (the correlation clusters from the probabilistic brain).
// Ordered so cluster #i (by clusters[] index) always draws the same colour, and the
// GRAPH legend row #i matches. Keystone-red (#b23a2e) is deliberately EXCLUDED — it
// stays reserved for the load-bearing keystone signal, never a cluster hue.
export const CLUSTER_PALETTE = ["#2c4a76", "#2f6b64", "#a9741a", "#6d5773", "#4a6b3a"] as const;
