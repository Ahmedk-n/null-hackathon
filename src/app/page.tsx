import Landing from "@/landing/Landing";

// SERVER component (V5-1): the LANDING at /. It stamps the session timestamp
// server-side (the only place `new Date(` is allowed) and passes it down, so no
// "use client" landing file reads the wall clock. The working app is at /studio.
export default function Page() {
  const startedAt = new Date().toISOString();
  return <Landing startedAt={startedAt} />;
}
