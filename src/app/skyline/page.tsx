import { SkylineView } from "@/ui/skyline/SkylineView";

// V6-3 · THE SKYLINE at /skyline. The client view reads the decision library on mount (SSR-safe)
// and seeds SAMPLE buildings when it is empty, so no server-side timestamp/state is needed here.
export const metadata = { title: "Keystone — Skyline" };

export default function SkylinePage() {
  return <SkylineView />;
}
