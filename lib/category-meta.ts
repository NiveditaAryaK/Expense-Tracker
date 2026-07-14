import {
  UtensilsCrossed,
  Car,
  ShoppingBag,
  Clapperboard,
  HeartPulse,
  Zap,
  Landmark,
  GraduationCap,
  Wallet,
  Package,
  type LucideIcon,
} from 'lucide-react'

export const CATEGORIES = [
  'Food', 'Transport', 'Shopping', 'Entertainment', 'Health',
  'Utilities', 'Finance', 'Education', 'Income', 'Uncategorized',
] as const

export type Category = (typeof CATEGORIES)[number]

interface CategoryMeta {
  icon: LucideIcon
  /** CSS custom property (without var()) driving color in both themes */
  cssVar: string
  /** Tailwind utility for icon color, matches cssVar */
  textClass: string
  /** Tailwind utility for soft icon-badge background */
  bgClass: string
}

// Fixed identity mapping — colors never change with sort order or filters.
export const CATEGORY_META: Record<string, CategoryMeta> = {
  Food: { icon: UtensilsCrossed, cssVar: '--cat-1', textClass: 'text-cat-1', bgClass: 'bg-cat-1/10' },
  Transport: { icon: Car, cssVar: '--cat-2', textClass: 'text-cat-2', bgClass: 'bg-cat-2/10' },
  Shopping: { icon: ShoppingBag, cssVar: '--cat-3', textClass: 'text-cat-3', bgClass: 'bg-cat-3/10' },
  Entertainment: { icon: Clapperboard, cssVar: '--cat-4', textClass: 'text-cat-4', bgClass: 'bg-cat-4/10' },
  Health: { icon: HeartPulse, cssVar: '--cat-5', textClass: 'text-cat-5', bgClass: 'bg-cat-5/10' },
  Utilities: { icon: Zap, cssVar: '--cat-6', textClass: 'text-cat-6', bgClass: 'bg-cat-6/10' },
  Finance: { icon: Landmark, cssVar: '--cat-7', textClass: 'text-cat-7', bgClass: 'bg-cat-7/10' },
  Education: { icon: GraduationCap, cssVar: '--cat-8', textClass: 'text-cat-8', bgClass: 'bg-cat-8/10' },
  Income: { icon: Wallet, cssVar: '--status-good', textClass: 'text-status-good', bgClass: 'bg-status-good/10' },
  Uncategorized: { icon: Package, cssVar: '--cat-muted', textClass: 'text-cat-muted', bgClass: 'bg-cat-muted/10' },
}

const FALLBACK: CategoryMeta = CATEGORY_META.Uncategorized

export function getCategoryMeta(category: string): CategoryMeta {
  return CATEGORY_META[category] || FALLBACK
}

/** Raw `hsl(var(--x))` string for use in SVG/recharts fill/stroke props. */
export function categoryColor(category: string): string {
  return `hsl(var(${getCategoryMeta(category).cssVar}))`
}
