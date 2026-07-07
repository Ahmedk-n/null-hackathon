// P2-T7 · the clean 404 state for /d/[id] — a missing, unpublished, or bad-id share link.
// Ledger-styled to match the rest of the app rather than Next's bare default not-found page.
import Link from "next/link";

export default function SharedDecisionNotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: 24,
      }}
    >
      <div
        className="panel"
        data-testid="share-not-found"
        style={{
          padding: 28,
          maxWidth: 420,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          textAlign: "center",
          alignItems: "center",
        }}
      >
        <span className="label" style={{ letterSpacing: "0.16em" }}>
          NOT FOUND
        </span>
        <p className="label" style={{ textTransform: "none", color: "var(--muted)" }}>
          This share link doesn&apos;t exist, or the owner has turned sharing off for this
          decision.
        </p>
        <Link href="/" className="btn" style={{ textDecoration: "none" }}>
          Go to Keystone
        </Link>
      </div>
    </div>
  );
}
