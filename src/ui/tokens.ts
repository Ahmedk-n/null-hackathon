// TS mirror of the theme.css accents (editorial white/near-black/grey/RED — the manifesto scheme)
// for inline styles — React Flow node styling, SVG strokes, and anywhere a CSS variable can't reach
// (e.g. the WebGL 3D leg). Keep these in exact sync with src/ui/theme.css. Light-only.
// NOTE: the 2D canvas paints surfaces via CSS vars (var(--panel-2), var(--hair)) so they follow tokens.

export const THESIS = "#18181b"; // dark-ink anchor
export const CLAIM = "#4b5563"; // slate grey
export const ASSUMPTION = "#9ca3af"; // light grey
export const KEYSTONE = "#c62828"; // red
export const INCREASE = "#b5850f"; // amber
export const DECREASE = "#9ca3af"; // light grey
export const OK = "#2f8a3e"; // green (holds)
export const WARN = "#b5850f"; // amber
export const BAD = "#c62828"; // red
export const BAD_BG = "#fbeaea"; // failed-node fill (--bad-bg)

export const HAIR = "#e4e4e7";
export const HAIR_STRONG = "#d4d4d8";
export const INK = "#18181b";
export const INK_2 = "#3f3f46";
export const MUTED = "#71717a";
export const BG = "#f4f4f5";
export const PANEL = "#ffffff";
export const PANEL_2 = "#f0f0f2";

// ── Driver-cluster palette (Task 7) ──────────────────────────────────────
// Distinct accents used ONLY to tag/group assumption nodes by their dominant latent driver.
// Ordered so cluster #i always draws the same colour and the GRAPH legend row #i matches. The
// keystone RED (#c62828) is deliberately EXCLUDED — it stays reserved for the keystone signal.
export const CLUSTER_PALETTE = ["#4b5563", "#b5850f", "#2f8a3e", "#0e7490", "#7c3aed"] as const;
