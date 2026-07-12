// TS mirror of the theme.css accents (warm-editorial LIGHT redesign) for inline styles —
// React Flow node styling, SVG strokes, and anywhere a CSS variable can't reach (e.g. the WebGL
// 3D leg). Keep these in exact sync with src/ui/theme.css. Light-only: there is no dark variant.
// NOTE: surfaces the 2D canvas paints via inline style / React Flow <Background> use CSS vars
// directly (var(--panel-2), var(--hair)) so they follow the theme tokens.

export const THESIS = "#b24e2a"; // accent (terracotta)
export const CLAIM = "#3f7a34"; // forest green
export const ASSUMPTION = "#8b8377"; // warm grey
export const KEYSTONE = "#a62a28"; // deep crimson
export const INCREASE = "#b5850f"; // gold
export const DECREASE = "#8b8377"; // warm grey
export const OK = "#3f7a34";
export const WARN = "#b5850f";
export const BAD = "#a62a28";
export const BAD_BG = "#f7e4e1"; // failed-node fill (--bad-bg)

export const HAIR = "#e8e0d4";
export const HAIR_STRONG = "#d9cfbf";
export const INK = "#211e19";
export const INK_2 = "#57514a";
export const MUTED = "#786f63";
export const BG = "#f4efe6";
export const PANEL = "#fffdf8";
export const PANEL_2 = "#f2ece1";

// ── Driver-cluster palette (Task 7) ──────────────────────────────────────
// Distinct accents used ONLY to tag/group assumption nodes by their dominant latent driver.
// Ordered so cluster #i always draws the same colour and the GRAPH legend row #i matches.
// Spread across hues so they stay distinguishable on the warm ground; the collapse-crimson
// (#a62a28) is deliberately EXCLUDED — it stays reserved for the load-bearing keystone signal.
export const CLUSTER_PALETTE = ["#b24e2a", "#2f7d78", "#b5850f", "#8c5a83", "#3f7a34"] as const;
