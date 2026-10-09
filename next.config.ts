import type { NextConfig } from "next";
import packageJson from "./package.json" with { type: "json" };

// Changes on every build: the service worker URL includes it, so an installed app picks up new versions.
const appVersion = new Date().toISOString().slice(0, 16).replace(/\D/g, "");

const nextConfig: NextConfig = {
  // Dev server only: allow opening the app from other devices on the LAN (e.g. a phone).
  // Add your machine's LAN IP here if it changes. Has no effect on production builds.
  allowedDevOrigins: ["192.168.1.235"],
  // APP_VERSION is the build stamp (drives service-worker updates); APP_RELEASE is the human version
  // from package.json ("1.0.0-beta.1"), bumped per release and tagged in git as v<release>.
  env: { NEXT_PUBLIC_APP_VERSION: appVersion, NEXT_PUBLIC_APP_RELEASE: packageJson.version },
  // Lets a verification build use its own folder so it can't disturb a running `pnpm dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
