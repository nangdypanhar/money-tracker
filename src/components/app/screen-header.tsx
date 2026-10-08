"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface ScreenHeaderProps {
  title: string;
  /** Show the circular back button (sub-screens). */
  back?: boolean;
  action?: React.ReactNode;
  className?: string;
}

/** Centered title with optional back button and right action, as in the sample. */
export function ScreenHeader({ title, back, action, className }: ScreenHeaderProps) {
  const router = useRouter();
  return (
    <header className={cn("grid grid-cols-[2.75rem_1fr_auto] items-center gap-2 px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-4", className)}>
      <div>
        {back && (
          <button
            type="button"
            aria-label="Back"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
            className="grid size-11 place-items-center rounded-full border bg-card/60 transition-colors hover:bg-accent"
          >
            <ArrowLeft className="size-4" />
          </button>
        )}
      </div>
      <h1 className="truncate text-center text-xl font-medium">{title}</h1>
      <div className="flex min-w-11 justify-end">{action}</div>
    </header>
  );
}
