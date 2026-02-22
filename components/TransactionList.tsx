'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Trash2, ChevronDown, ChevronUp, Search } from 'lucide-react'
import { clsx } from 'clsx'

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

const CATEGORY_EMOJI: Record<string, string> = {
  Food: '🍕', Shopping: '🛍️', Transport: '🚗', Entertainment: '🎬',
  Health: '💊', Utilities: '💡', Finance: '💰', Education: '📚',
  Income: '💵', Uncategorized: '📦',
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
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search merchant, category, bank..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
      </div>

      {/* Sort header */}
      <div className="flex gap-2 text-xs text-gray-400 px-4">
        <button onClick={() => toggleSort('date')} className="flex items-center gap-1 hover:text-gray-600">
          Date <SortIcon field="date" />
        </button>
        <span className="ml-auto" />
        <button onClick={() => toggleSort('amount')} className="flex items-center gap-1 hover:text-gray-600">
          Amount <SortIcon field="amount" />
        </button>
      </div>

      {/* Transaction rows */}
      {filtered.length === 0 ? (
        <div className="text-center text-gray-400 text-sm py-12">
          {search ? 'No transactions match your search' : 'No transactions yet — the agent will populate these from your SMS'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(tx => (
            <div
              key={tx.id}
              className="bg-white border border-gray-100 rounded-xl px-4 py-3 flex items-center gap-3 hover:shadow-sm transition-shadow"
            >
              {/* Category emoji */}
              <div className="text-2xl flex-shrink-0 w-10 text-center">
                {CATEGORY_EMOJI[tx.category] || '📌'}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-800 truncate">
                    {tx.merchant || tx.upiId || tx.bank || 'Unknown'}
                  </p>
                  {tx.source === 'sms' && (
                    <span className="text-xs bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded-full flex-shrink-0">SMS</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">{format(new Date(tx.date), 'MMM d, yyyy')}</span>
                  <span className="text-xs text-gray-300">·</span>
                  <span className="text-xs text-gray-400">{tx.category}</span>
                  {tx.bank && (
                    <>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">{tx.bank}{tx.account ? ` ••${tx.account}` : ''}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Amount */}
              <div className="text-right flex-shrink-0">
                <p className={clsx('text-sm font-bold', tx.type === 'debit' ? 'text-red-500' : 'text-green-500')}>
                  {tx.type === 'debit' ? '−' : '+'}₹{tx.amount.toLocaleString('en-IN')}
                </p>
              </div>

              {/* Delete */}
              {onDelete && (
                <button
                  onClick={() => onDelete(tx.id)}
                  className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-center text-xs text-gray-400 pt-1">
          Showing {filtered.length} of {transactions.length} transactions
        </p>
      )}
    </div>
  )
}
