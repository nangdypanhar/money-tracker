import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "MoneyTrack",
  description: "Track income, expenses, budgets, and savings — privately, on your device.",
  applicationName: "MoneyTrack",
  appleWebApp: { capable: true, title: "MoneyTrack", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#05050c",
  colorScheme: "dark",
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
    <html lang="en" className="dark">
      <body className={poppins.variable}>
        {/* Phone-width column on larger screens, matching the sample's mobile layout */}
        <div className="relative mx-auto min-h-dvh w-full max-w-md overflow-x-hidden">{children}</div>
      </body>
    </html>
  );
}
