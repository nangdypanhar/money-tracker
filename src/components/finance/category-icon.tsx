import {
  ArrowLeftRight,
  Banknote,
  Briefcase,
  Car,
  Ellipsis,
  Film,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  Landmark,
  type LucideIcon,
  Percent,
  PiggyBank,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  SlidersHorizontal,
  Store,
  TrendingUp,
  Utensils,
  Wallet,
  Zap,
  CreditCard,
} from "lucide-react";

/** Category icons are stored by name so records stay serializable. */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  house: House,
  "shopping-cart": ShoppingCart,
  utensils: Utensils,
  "heart-pulse": HeartPulse,
  car: Car,
  zap: Zap,
  "shopping-bag": ShoppingBag,
  film: Film,
  receipt: Receipt,
  percent: Percent,
  ellipsis: Ellipsis,
  briefcase: Briefcase,
  "trending-up": TrendingUp,
  store: Store,
  gift: Gift,
  plane: Plane,
  "graduation-cap": GraduationCap,
  smartphone: Smartphone,
  banknote: Banknote,
};

export const ACCOUNT_ICONS: Record<string, LucideIcon> = {
  cash: Wallet,
  bank: Landmark,
  ewallet: Smartphone,
  credit: CreditCard,
};

export const TRANSFER_ICON = ArrowLeftRight;
export const ADJUSTMENT_ICON = SlidersHorizontal;
export const GOAL_ICON = PiggyBank;

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = CATEGORY_ICONS[name] ?? Ellipsis;
  return <Icon className={className} />;
}

/** CSS color for a palette index (Category.color). */
export function paletteColor(index: number): string {
  return `var(--chart-${(((index % 6) + 6) % 6) + 1})`;
}
