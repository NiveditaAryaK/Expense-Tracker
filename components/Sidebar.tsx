'use client'

import { Activity, ArrowUpDown, PieChart, Terminal, X, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import ThemeToggle from './ThemeToggle'

export type Section = 'overview' | 'transactions' | 'categories' | 'agent'

const NAV_ITEMS: { id: Section; label: string; icon: LucideIcon }[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'transactions', label: 'Transactions', icon: ArrowUpDown },
  { id: 'categories', label: 'Categories', icon: PieChart },
  { id: 'agent', label: 'SMS Agent', icon: Terminal },
]

interface Props {
  active: Section
  onChange: (section: Section) => void
  userEmail: string
  mobileOpen: boolean
  onMobileClose: () => void
}

export default function Sidebar({ active, onChange, userEmail, mobileOpen, onMobileClose }: Props) {
  const initials = userEmail.slice(0, 2).toUpperCase()

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/40 backdrop-blur-[1px] lg:hidden"
          onClick={onMobileClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-border bg-card transition-transform duration-200 ease-out lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            ₹
          </div>
          <span className="truncate font-semibold tracking-tight text-foreground">Expense Tracker</span>
          <button
            className="ml-auto text-muted-foreground lg:hidden"
            onClick={onMobileClose}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon
            const isActive = active === item.id
            return (
              <button
                key={item.id}
                onClick={() => {
                  onChange(item.id)
                  onMobileClose()
                }}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon size={16} />
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{userEmail}</p>
              <p className="text-[11px] text-muted-foreground">Free plan</p>
            </div>
            <ThemeToggle />
          </div>
        </div>
      </aside>
    </>
  )
}
