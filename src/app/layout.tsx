import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible, Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display" });
const body = Atkinson_Hyperlegible({ subsets: ["latin"], weight: ["400", "700"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "Verbalore",
  description: "A daily video plan from what your market is saying, recorded in minutes and edited for you.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Applies the saved text size and appearance before the first paint, so there is no flash.
const restore = `try{var s=JSON.parse(localStorage.getItem("vl-display")||"{}");var r=document.documentElement;if(s.scale)r.style.setProperty("--scale",s.scale);if(s.theme==="light"||s.theme==="dark")r.setAttribute("data-theme",s.theme);r.setAttribute("data-game",s.game||"light")}catch(e){document.documentElement.setAttribute("data-game","light")}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-game="light" className={`${display.variable} ${body.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: restore }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
