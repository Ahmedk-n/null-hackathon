import KeystoneApp from "./KeystoneApp";
import { FIXTURE_DECISION } from "@/llm/fixture";

// SERVER component: the session timestamp is stamped here and passed down as a
// prop, keeping `new Date(` out of every "use client" file (hydration safety, T8).
export default function Page() {
  const ts = new Date().toISOString();
  return <KeystoneApp startedAt={ts} decision={FIXTURE_DECISION} />;
}
