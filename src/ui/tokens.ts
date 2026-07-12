// TS mirror of the theme.css accents (clean-modern redesign) for inline styles —
// React Flow node styling, SVG strokes, and anywhere a CSS variable can't reach
// (e.g. the WebGL 3D leg). Keep these in exact sync with src/ui/theme.css.
// NOTE: surfaces the 2D canvas paints via inline style / React Flow <Background> now use CSS
// vars directly (var(--panel-2), var(--hair)) so the board is theme-aware; the hexes below are
// the light-mode source of truth + the fallback for the WebGL leg.

export const THESIS = "#4a5ad4"; // accent (indigo)
export const CLAIM = "#1f9d57"; // green
export const ASSUMPTION = "#8a93a2"; // grey
export const KEYSTONE = "#e0484d"; // red
export const INCREASE = "#c98a0e"; // amber
export const DECREASE = "#8a93a2"; // grey
export const OK = "#1f9d57";
export const WARN = "#c98a0e";
export const BAD = "#e0484d";
export const BAD_BG = "#fcecec"; // failed-node fill (--bad-bg)

export const HAIR = "#e7eaf0";
export const HAIR_STRONG = "#dde1ea";
export const INK = "#14161c";
export const INK_2 = "#545c6b";
export const MUTED = "#8a93a2";
export const BG = "#f5f7fa";
export const PANEL = "#ffffff";
export const PANEL_2 = "#fbfcfd";

// ── Driver-cluster palette (Task 7) ──────────────────────────────────────
// Distinct, clean accents used ONLY to tag/group assumption nodes by their dominant latent
// driver (the correlation clusters from the probabilistic brain). Ordered so cluster #i always
// draws the same colour and the GRAPH legend row #i matches. Keystone-red (#e0484d) is
// deliberately EXCLUDED — it stays reserved for the load-bearing keystone signal.
export const CLUSTER_PALETTE = ["#4a5ad4", "#2fa3b8", "#c98a0e", "#8b5cf6", "#1f9d57"] as const;
