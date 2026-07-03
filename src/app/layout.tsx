import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import "../ui/theme.css";

// Load the real typefaces the design system names (theme.css --sans/--mono).
// CSS-variable strategy: the .variable classes expose --font-inter / --font-jbmono
// on <html>, and theme.css points --sans/--mono at them with fallback stacks.
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jbmono",
});

export const metadata = { title: "Keystone", description: "CAD for decisions" };

export default function RootLayout({ children }: { children: ReactNode }) {
  // Body styling (background/ink/font) now comes from tokens in theme.css.
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
