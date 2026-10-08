"use client";

import { FlaskConical } from "lucide-react";
import { useData } from "@/features/data/data-provider";
import { switchDataMode } from "@/lib/db/mode";

/** Always-visible reminder that the demo database is open, with a one-tap way back. */
export function DemoBanner() {
  const { mode } = useData();
  if (mode !== "demo") return null;
  return (
    <div className="sticky top-0 z-30 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
      <div className="flex items-center gap-2 rounded-full border border-chart-6/40 bg-card/90 py-1.5 pr-1.5 pl-3 text-xs shadow-lg backdrop-blur-xl">
        <FlaskConical className="size-3.5 shrink-0 text-chart-6" />
        <span className="flex-1 truncate">Demo mode — sample data, not yours</span>
        <button
          type="button"
          onClick={() => switchDataMode("real")}
          className="h-7 shrink-0 rounded-full bg-primary px-3 font-medium text-primary-foreground"
        >
          My data
        </button>
      </div>
    </div>
  );
}
