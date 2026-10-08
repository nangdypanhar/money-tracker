import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MoneyTrack",
    short_name: "MoneyTrack",
    description: "Personal finance tracker that keeps your data on your device.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e1424",
    theme_color: "#0e1424",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
