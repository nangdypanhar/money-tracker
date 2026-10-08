import type { NextConfig } from "next";

// Changes on every build: the service worker URL includes it, so an installed app picks up new versions.
const appVersion = new Date().toISOString().slice(0, 16).replace(/\D/g, "");

const nextConfig: NextConfig = {
  // Dev server only: allow opening the app from other devices on the LAN (e.g. a phone).
  // Add your machine's LAN IP here if it changes. Has no effect on production builds.
  allowedDevOrigins: ["192.168.1.235"],
  env: { NEXT_PUBLIC_APP_VERSION: appVersion },
  // Lets a verification build use its own folder so it can't disturb a running `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
