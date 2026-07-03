import { MemoSheet } from "@/ui/memo/MemoSheet";

// V5-2 · DECISION MEMO — engineering drawing sheet.
//
// SERVER component: the sheet's title-block DATE is stamped here with
// `new Date().toISOString()` and handed to the CLIENT <MemoSheet> as a prop, so no
// `new Date(` / `Date.now()` ever lands in a "use client" bundle (T8 wall-clock guard).
//
// The memo reads the GLOBAL keystoneStore CLIENT-SIDE. Reaching /studio/memo via the
// TopBar's next/link Link is a SPA transition, so the in-memory store survives; a FULL
// browser reload of this URL empties the store → MemoSheet shows its "NO ANALYSIS" state.
export default function MemoPage() {
  const startedAt = new Date().toISOString();
  return <MemoSheet startedAt={startedAt} />;
}
