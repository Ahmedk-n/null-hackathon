/** @type {import('next').NextConfig} */
const nextConfig = {
  // Gate builds set NEXT_DIST_DIR so `next build` never clobbers the running
  // dev server's .next cache (which corrupts its webpack runtime → API 500s).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};
export default nextConfig;
