"use client";
// P2-T6 · /login — email magic-link + GitHub OAuth. Uses ONLY createBrowserSupabase (publishable
// key). Three states beyond IDLE: SENDING, SENT (magic-link email dispatched), ERROR (honest
// message, never a crash). Ledger styling (panel/label/mono/btn from theme.css + primitives.tsx).
import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { Button, Field } from "@/ui/primitives";

type Status = "idle" | "sending" | "sent" | "error";

function originCallback(): string | undefined {
  return typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined;
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function sendMagicLink() {
    setStatus("sending");
    setError(null);
    try {
      const { error: err } = await createBrowserSupabase().auth.signInWithOtp({
        email,
        options: { emailRedirectTo: originCallback() },
      });
      if (err) {
        setStatus("error");
        setError(err.message);
        return;
      }
      setStatus("sent");
    } catch {
      setStatus("error");
      setError("Could not send the sign-in link — check your connection and try again.");
    }
  }

  async function signInWithGitHub() {
    setError(null);
    try {
      const { error: err } = await createBrowserSupabase().auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: originCallback() },
      });
      if (err) {
        setStatus("error");
        setError(err.message);
      }
    } catch {
      setStatus("error");
      setError("Could not start GitHub sign-in — check your connection and try again.");
    }
  }

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
        style={{
          padding: 28,
          width: 360,
          maxWidth: "100%",
          display: "flex",
          flexDirection: "column",
          gap: "var(--gap)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--sans)",
            fontWeight: 700,
            fontSize: 15,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          ▣ Keystone — Sign in
        </span>

        {status === "sent" ? (
          <p
            data-testid="login-sent"
            className="label"
            style={{ textTransform: "none", color: "var(--ok)" }}
          >
            Check {email} for a sign-in link.
          </p>
        ) : (
          <>
            <Field
              label="Email"
              value={email}
              onChange={setEmail}
              placeholder="you@company.com"
              mono={false}
            />
            <Button
              primary
              onClick={sendMagicLink}
              disabled={status === "sending" || !email.includes("@")}
            >
              {status === "sending" ? "Sending…" : "Email me a sign-in link"}
            </Button>
            <div style={{ borderTop: "1px solid var(--hair)", paddingTop: "var(--gap)" }}>
              <Button onClick={signInWithGitHub} disabled={status === "sending"}>
                Continue with GitHub
              </Button>
            </div>
          </>
        )}

        {status === "error" && error && (
          <p
            data-testid="login-error"
            className="label"
            style={{ textTransform: "none", color: "var(--bad)" }}
          >
            {error}
          </p>
        )}

        <Link href="/" className="label" style={{ textDecoration: "none", color: "var(--ink-2)" }}>
          ← Continue as guest
        </Link>
      </div>
    </div>
  );
}
