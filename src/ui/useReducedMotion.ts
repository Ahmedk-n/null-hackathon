"use client";
// A-3 · tiny `prefers-reduced-motion` hook shared by the DESIGN tournament clock and the
// LIVE PIPELINE stage beats. Hydration-safe: always renders `false` on the first client
// render (matching the server, which has no `window`) and only flips via an effect — never
// reads `matchMedia` during render. Defensive: jsdom test environments frequently have no
// `matchMedia` at all (several *.test.tsx files shim it per-file; this one doesn't assume
// it's there), so a missing API is treated as "no preference" rather than throwing.
import { useEffect, useState } from "react";

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}
