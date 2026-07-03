import type { ReactNode } from "react";

export const metadata = { title: "Keystone", description: "CAD for decisions" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#0d1117", color: "#e6edf3" }}>
        {children}
      </body>
    </html>
  );
}
