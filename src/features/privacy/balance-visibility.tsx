"use client";

import { Eye, EyeOff } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { CurrencyCode } from "@/lib/money/currency";
import { type FormatOptions, formatMoney, type Minor } from "@/lib/money/money";
import { cn } from "@/lib/utils";

/** UI preference only (like the theme): whether balances are masked, ABA-style. */
const HIDE_BALANCES_KEY = "moneytrack:hide-balances";

interface BalanceVisibility {
  hidden: boolean;
  toggle: () => void;
  /** formatMoney, or a blurred placeholder while balances are hidden. Use for balances and totals, not form hints. */
  balance: (amount: Minor, currency: CurrencyCode, options?: FormatOptions) => React.ReactNode;
}

const BalanceVisibilityContext = createContext<BalanceVisibility | null>(null);

export function BalanceVisibilityProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(HIDE_BALANCES_KEY) === "1";
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setHidden((was) => {
      try {
        localStorage.setItem(HIDE_BALANCES_KEY, was ? "0" : "1");
      } catch {
        // Storage blocked: the choice still applies until reload.
      }
      return !was;
    });
  }, []);

  const value = useMemo<BalanceVisibility>(
    () => ({
      hidden,
      toggle,
      balance: (amount, currency, options) =>
        hidden ? <BlurredAmount currency={currency} /> : formatMoney(amount, currency, options),
    }),
    [hidden, toggle],
  );

  return <BalanceVisibilityContext.Provider value={value}>{children}</BalanceVisibilityContext.Provider>;
}

export function useBalanceVisibility(): BalanceVisibility {
  const ctx = useContext(BalanceVisibilityContext);
  if (!ctx) throw new Error("useBalanceVisibility must be used inside <BalanceVisibilityProvider>");
  return ctx;
}

/** A real-length but fake figure ($8,888.88 / ៛888,888), so neither the DOM nor the blur reveals the balance. */
const PLACEHOLDER: Record<CurrencyCode, Minor> = { USD: 888_888, KHR: 888_888 };

/**
 * Soft rounded-rectangle mask for the blurred number: the inner shape gets rounded corners and fades out
 * toward its edges. The SVG stretches to the number's box, so corner radii are set per axis (a number is
 * about 5× wider than tall) to stay round.
 */
const ROUNDED_FADE_MASK = `url("data:image/svg+xml,${encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'>" +
    "<filter id='f' x='-20%' y='-50%' width='140%' height='200%'><feGaussianBlur stdDeviation='1.5 6'/></filter>" +
    "<rect x='5' y='16' width='90' height='68' rx='6' ry='30' filter='url(#f)'/></svg>",
)}")`;

function BlurredAmount({ currency }: { currency: CurrencyCode }) {
  return (
    // Same size and weight as the text around it — blurred until unreadable, inside a soft rounded shape
    // (ROUNDED_FADE_MASK) with no hard edge, border, or shadow. The outer span's small radius trims what's left.
    // Always the same light grey (`masked` token) in light and dark mode — never black or the text's own color.
    // Callers drop their red "negative" color while hidden, so the color can't give the sign away.
    <span className="inline-block overflow-hidden rounded-[0.35em] align-bottom">
      <span className="sr-only">Hidden</span>
      <span
        aria-hidden
        className="pointer-events-none inline-block text-masked blur-[max(0.2em,4px)] select-none"
        style={{ maskImage: ROUNDED_FADE_MASK, maskSize: "100% 100%", WebkitMaskImage: ROUNDED_FADE_MASK, WebkitMaskSize: "100% 100%" }}
      >
        {formatMoney(PLACEHOLDER[currency], currency)}
      </span>
    </span>
  );
}

/** Eye button that hides / shows balances everywhere they're masked. */
export function BalanceToggle({ className }: { className?: string }) {
  const { hidden, toggle } = useBalanceVisibility();
  const Icon = hidden ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={hidden ? "Show balances" : "Hide balances"}
      aria-pressed={hidden}
      className={cn(
        "grid size-11 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
