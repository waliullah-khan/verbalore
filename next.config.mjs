/** @type {import('next').NextConfig} */
// NEXT_DIST lets two dev servers run side by side without sharing a build folder.
// Dynamic pages are not kept in the browser's router cache, so Home and the game strip never show old numbers.
const nextConfig = {
  distDir: process.env.NEXT_DIST || ".next",
  experimental: { staleTimes: { dynamic: 0 } },
};

export default nextConfig;
