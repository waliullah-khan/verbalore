/** @type {import('next').NextConfig} */
// NEXT_DIST lets two dev servers run side by side without sharing a build folder.
const nextConfig = { distDir: process.env.NEXT_DIST || ".next" };

export default nextConfig;
