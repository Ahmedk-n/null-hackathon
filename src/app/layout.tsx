import type { ReactNode } from "react";
import "../ui/theme.css";

export const metadata = { title: "Keystone", description: "CAD for decisions" };

export default function RootLayout({ children }: { children: ReactNode }) {
  // Body styling (background/ink/font) now comes from tokens in theme.css.
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
