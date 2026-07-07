// V5-4 / P2-T4 · DECISION LIBRARY — thin re-export. The real implementation now lives in
// src/lib/library/{index,local,remote,types}.ts (split into guest/local + signed-in/remote
// backends behind one resolver). This file exists only so existing imports of "@/lib/library"
// keep working unchanged.
export * from "./library/index";
