'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Trash2, ChevronDown, ChevronUp, Search } from 'lucide-react'
import { clsx } from 'clsx'
import { getCategoryMeta } from '@/lib/category-meta'

interface Transaction {
  id: string
  amount: number
  type: 'debit' | 'credit'
  merchant?: string | null
  category: string
  bank?: string | null
  account?: string | null
  upiId?: string | null
  date: string
  source: string
}

interface Props {
  transactions: Transaction[]
  onDelete?: (id: string) => void
}

export default function TransactionList({ transactions, onDelete }: Props) {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<'date' | 'amount'>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [showRaw, setShowRaw] = useState<string | null>(null)

  const filtered = transactions
    .filter(t => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        t.merchant?.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.bank?.toLowerCase().includes(q) ||
        t.amount.toString().includes(q)
      )
    })
    .sort((a, b) => {
      const mult = sortDir === 'asc' ? 1 : -1
      if (sortField === 'date') return mult * (new Date(a.date).getTime() - new Date(b.date).getTime())
      return mult * (a.amount - b.amount)
    })

  const toggleSort = (field: 'date' | 'amount') => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const SortIcon = ({ field }: { field: 'date' | 'amount' }) => {
    if (sortField !== field) return null
    return sortDir === 'desc' ? <ChevronDown size={14} /> : <ChevronUp size={14} />
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search merchant, category, bank..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Sort header */}
      <div className="flex gap-2 px-4 text-xs text-muted-foreground">
        <button onClick={() => toggleSort('date')} className="flex items-center gap-1 hover:text-foreground">
          Date <SortIcon field="date" />
        </button>
        <span className="ml-auto" />
        <button onClick={() => toggleSort('amount')} className="flex items-center gap-1 hover:text-foreground">
          Amount <SortIcon field="amount" />
        </button>
      </div>

      {/* Transaction rows */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          {search ? 'No transactions match your search' : 'No transactions yet — the agent will populate these from your SMS'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(tx => {
            const { icon: Icon, textClass, bgClass } = getCategoryMeta(tx.category)
            return (
              <div
                key={tx.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 transition-shadow hover:shadow-sm"
              >
                <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${bgClass} ${textClass}`}>
                  <Icon size={17} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {tx.merchant || tx.upiId || tx.bank || 'Unknown'}
                    </p>
                    {tx.source === 'sms' && (
                      <span className="flex-shrink-0 rounded-full bg-cat-1/10 px-1.5 py-0.5 text-xs text-cat-1">SMS</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{format(new Date(tx.date), 'MMM d, yyyy')}</span>
                    <span className="text-xs text-muted-foreground/50">·</span>
                    <span className="text-xs text-muted-foreground">{tx.category}</span>
                    {tx.bank && (
                      <>
                        <span className="text-xs text-muted-foreground/50">·</span>
                        <span className="text-xs text-muted-foreground">{tx.bank}{tx.account ? ` ••${tx.account}` : ''}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex-shrink-0 text-right">
                  <p className={clsx('text-sm font-bold tabular-nums', tx.type === 'debit' ? 'text-status-critical' : 'text-status-good')}>
                    {tx.type === 'debit' ? '−' : '+'}₹{tx.amount.toLocaleString('en-IN')}
                  </p>
                </div>

                {onDelete && (
                  <button
                    onClick={() => onDelete(tx.id)}
                    className="flex-shrink-0 text-muted-foreground/50 transition-colors hover:text-status-critical"
                    aria-label="Delete transaction"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="pt-1 text-center text-xs text-muted-foreground">
          Showing {filtered.length} of {transactions.length} transactions
        </p>
      )}
    </div>
  )
}
