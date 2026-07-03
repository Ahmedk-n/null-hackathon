import KeystoneApp from "../KeystoneApp";
import { FIXTURE_DECISION } from "@/llm/fixture";

// SERVER component: the session timestamp is stamped here and passed down as a
// prop, keeping `new Date(` out of every "use client" file (hydration safety, T8).
// The working app lives at /studio (V5-1); / is the concept landing.
export default function StudioPage() {
  const ts = new Date().toISOString();
  return <KeystoneApp startedAt={ts} decision={FIXTURE_DECISION} />;
}
