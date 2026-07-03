import Link from "next/link";
import { SectionHeader } from "@/ui/primitives";
import { HAIR_STRONG, MUTED } from "@/ui/tokens";

// V5-1 · DECISIONS ledger — the clean seam for V5-4 (decision library). It takes the
// recent analyses to list; today they are always empty (the library is wired later),
// so it renders the empty-state. When V5-4 lands it will pass real `entries` (title,
// integrity stamp, keystone, date) that link to /studio?open=<id>.
export interface RecentDecisionEntry {
  id: string;
  title: string;
  integrity: number;
  keystone: string;
  dateISO: string;
}

export function RecentDecisions({ entries }: { entries: RecentDecisionEntry[] }) {
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
          {entries.map((e) => (
            <Link
              key={e.id}
              href={`/studio?open=${e.id}`}
              className="ledger-row"
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <span className="label">{e.title}</span>
              <span className="ledger-value mono">
                {Math.round(e.integrity)}% · {e.keystone}
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
