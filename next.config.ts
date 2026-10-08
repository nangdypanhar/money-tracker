import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev server only: allow opening the app from other devices on the LAN (e.g. a phone).
  // Add your machine's LAN IP here if it changes. Has no effect on production builds.
  allowedDevOrigins: ["192.168.1.235"],
};

export default nextConfig;
