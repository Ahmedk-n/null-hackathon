"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SectionHeader } from "@/ui/primitives";
import { HAIR_STRONG, MUTED } from "@/ui/tokens";
import { statusWord, statusAccent } from "@/ui/memo/derive";
// V5-4 · decision library (localStorage snapshot layer). SSR-safe: listEntries() returns []
// off-browser and before the mount effect, so the FIRST render is always the empty-state — this
// is what keeps the server HTML and the first client render identical (no hydration mismatch).
import { listEntries, type LibraryEntry } from "@/lib/library";

// V5-4 · DECISIONS ledger on the landing page. The Landing is a SERVER component and cannot read
// localStorage, so the read lives HERE in a client component: initial render = empty-state, then a
// mount effect reads the recent snapshots. Recent 5, click → /studio?open=<id> restores it.
//
// The V5-1 seam type is preserved for anyone importing it, though the entries now come straight
// from the library rather than a prop.
export interface RecentDecisionEntry {
  id: string;
  title: string;
  integrity: number;
  keystone: string;
  dateISO: string;
}

export function RecentDecisions() {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  useEffect(() => {
    setEntries(listEntries().slice(0, 5));
  }, []);

  return (
    <section data-testid="recent-decisions">
      <SectionHeader>Decisions</SectionHeader>
      {entries.length === 0 ? (
        <div
          style={{
            border: `1px dashed ${HAIR_STRONG}`,
            padding: "28px 18px",
            textAlign: "center",
          }}
        >
          <span className="label" style={{ letterSpacing: "0.16em", color: MUTED }}>
            No analyses yet — enter the studio
          </span>
        </div>
      ) : (
        <div>
          {entries.map((e) => {
            const word = statusWord(e.verdict.integrity);
            return (
              <Link
                key={e.id}
                href={`/studio?open=${e.id}`}
                className="ledger-row"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <span className="label">{e.title}</span>
                <span className="ledger-value mono" style={{ color: statusAccent(word) }}>
                  {Math.round(e.verdict.integrity)}% {word} · {e.verdict.keystoneId ?? "—"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
