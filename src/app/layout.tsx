import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { AppShell } from "@/components/app/app-shell";
import { ThemeProvider } from "@/components/app/theme-provider";
import { STATUS_BAR, STATUS_BAR_META_ID, THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/**
 * Runs before first paint: puts the app's own theme-color tag first in <head> (browsers use the first
 * matching one; Next's tags come later) with the color for the saved theme — or the phone's setting on
 * Auto — so the bar is right before React loads. StatusBarColorSync takes over from there.
 */
const statusBarScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var m=document.createElement("meta");m.name="theme-color";m.id=${JSON.stringify(STATUS_BAR_META_ID)};m.content=d?${JSON.stringify(STATUS_BAR.dark)}:${JSON.stringify(STATUS_BAR.light)};document.head.prepend(m)}catch(e){}`;

export const metadata: Metadata = {
  title: "MoneyTrack",
  description: "Track income, expenses, budgets, and savings — privately, on your device.",
  applicationName: "MoneyTrack",
  // "default" lets iOS tint the status bar with theme-color and pick readable (dark/light) text.
  appleWebApp: { capable: true, title: "MoneyTrack", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  // No themeColor here on purpose: the app owns the single theme-color tag (pre-paint script below +
  // StatusBarColorSync). A React-rendered one with the same color confuses hydration when it's replaced.
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // next-themes sets the theme class before hydration, so the server/client class differs by design.
    <html lang="en" className={poppins.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: statusBarScript }} />
      </head>
      <body>
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
