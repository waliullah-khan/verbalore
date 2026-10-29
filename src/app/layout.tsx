import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./studio.css";

export const metadata: Metadata = {
  title: "Verbalore",
  description: "A daily video plan from what your market is saying, recorded in minutes and edited for you.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

// Applies the saved text size, appearance and game level before the first paint, so there is no flash.
const restore = `try{var s=JSON.parse(localStorage.getItem("vl-display")||"{}");var r=document.documentElement;if(s.scale)r.style.setProperty("--scale",s.scale);if(s.theme==="light"||s.theme==="dark")r.setAttribute("data-theme",s.theme);document.body&&(document.body.dataset.game=s.game||"light")}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=IBM+Plex+Mono:wght@500;600&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: restore }} />
      </head>
      <body data-game="light">{children}</body>
    </html>
  );
}
