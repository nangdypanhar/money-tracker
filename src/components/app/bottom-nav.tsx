"use client";

import { CalendarDays, ChartPie, House, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/", label: "Home", icon: House, match: (p: string) => p === "/" },
  { href: "/transactions", label: "History", icon: CalendarDays, match: (p: string) => p.startsWith("/transactions") },
  { href: "/budget", label: "Budget", icon: ChartPie, match: (p: string) => p.startsWith("/budget") },
  {
    href: "/more",
    label: "More",
    icon: UserRound,
    match: (p: string) => !["/", "/transactions"].includes(p) && !p.startsWith("/budget"),
  },
];

/** Floating pill nav from the sample; the active item is a filled indigo pill. */
export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border bg-card/80 p-1.5 shadow-2xl shadow-black/10 backdrop-blur-xl dark:shadow-black/60">
        {ITEMS.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "grid h-11 place-items-center rounded-full transition-all",
                active
                  ? "w-14 bg-primary text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)]"
                  : "w-11 text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-5" />
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
