/** @type {import('next').NextConfig} */
// NEXT_DIST lets two dev servers run side by side without sharing a build folder.
// Dynamic pages are not kept in the browser's router cache, so Home and the game strip never show old numbers.
const nextConfig = {
  distDir: process.env.NEXT_DIST || ".next",
  experimental: { staleTimes: { dynamic: 0 } },
  // nothing here uses the image optimizer, so its endpoint is switched off
  images: { unoptimized: true },
  // browser-side protections on every page; the camera and microphone are only for this site (the Studio needs them)
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=()" },
      ],
    }];
  },
};

export default nextConfig;
