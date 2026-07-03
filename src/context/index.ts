// Public context-layer surface for Founder B.
// NOTE: `compile.ts` is intentionally NOT re-exported here — it is server-only
// (loads the Anthropic SDK). Import it directly from "@/context/compile" inside
// the API route, never from client/store/UI code.
export * from "./types";
export * from "./schemas";
export * from "./weights";
export * from "./fixtures";
