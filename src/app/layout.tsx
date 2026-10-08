import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { AppShell } from "@/components/app/app-shell";
import { ThemeProvider } from "@/components/app/theme-provider";
import { STATUS_BAR, THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

/**
 * Runs before first paint: if the user forced Light/Dark in the app, put a theme-color tag first in <head>
 * (browsers use the first matching one; Next's own tags come later) so the bar never flashes the phone's
 * theme color before React loads.
 */
const statusBarScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var c=t==="dark"?${JSON.stringify(STATUS_BAR.dark)}:t==="light"?${JSON.stringify(STATUS_BAR.light)}:null;if(c){var m=document.createElement("meta");m.name="theme-color";m.content=c;document.head.prepend(m)}}catch(e){}`;

export const metadata: Metadata = {
  title: "MoneyTrack",
  description: "Track income, expenses, budgets, and savings — privately, on your device.",
  applicationName: "MoneyTrack",
  // "default" lets iOS tint the status bar with theme-color and pick readable (dark/light) text.
  appleWebApp: { capable: true, title: "MoneyTrack", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    // Same values as --status-bar in globals.css. StatusBarColorSync overrides these when the in-app theme
    // differs from the phone's setting.
    { media: "(prefers-color-scheme: light)", color: STATUS_BAR.light },
    { media: "(prefers-color-scheme: dark)", color: STATUS_BAR.dark },
  ],
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
