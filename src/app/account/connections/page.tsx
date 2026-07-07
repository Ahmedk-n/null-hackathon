import { ConnectionsPanel } from "@/ui/ConnectionsPanel";

// SERVER component (own route — does not touch src/app/account/page.tsx, owned by
// the concurrent auth-UI work). Plain shell around the client ConnectionsPanel;
// no wall-clock reads here, so nothing hydration-unsafe to keep server-only.
export default function AccountConnectionsPage() {
  return (
    <main
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "var(--pad)",
      }}
    >
      <ConnectionsPanel />
    </main>
  );
}
