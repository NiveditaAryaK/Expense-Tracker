'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface CategoryData {
  category: string
  amount: number
  count: number
}

const COLORS = [
  '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
  '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899',
]

const CATEGORY_EMOJI: Record<string, string> = {
  Food: '🍕',
  Shopping: '🛍️',
  Transport: '🚗',
  Entertainment: '🎬',
  Health: '💊',
  Utilities: '💡',
  Finance: '💰',
  Education: '📚',
  Income: '💵',
  Uncategorized: '📦',
}

interface Props {
  categories: CategoryData[]
  totalSpend: number
}

export default function CategoryBreakdown({ categories, totalSpend }: Props) {
  if (!categories || categories.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        No category data yet
      </div>
    )
  }

  const data = categories.slice(0, 8)

  return (
    <div className="space-y-4">
      {/* Pie Chart */}
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            dataKey="amount"
            nameKey="category"
          >
            {data.map((entry, index) => (
              <Cell key={entry.category} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Amount']}
            contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Category list */}
      <div className="space-y-2">
        {data.map((cat, index) => {
          const pct = totalSpend > 0 ? Math.round((cat.amount / totalSpend) * 100) : 0
          return (
            <div key={cat.category} className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <span className="text-sm flex-1 text-gray-700">
                {CATEGORY_EMOJI[cat.category] || '📌'} {cat.category}
              </span>
              <span className="text-xs text-gray-400">{cat.count} txns</span>
              <span className="text-sm font-semibold text-gray-800 w-20 text-right">
                ₹{cat.amount.toLocaleString('en-IN')}
              </span>
              <div className="w-16 bg-gray-100 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: COLORS[index % COLORS.length],
                  }}
                />
              </div>
              <span className="text-xs text-gray-400 w-8">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
