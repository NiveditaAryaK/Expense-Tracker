'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { getCategoryMeta, categoryColor } from '@/lib/category-meta'

interface CategoryData {
  category: string
  amount: number
  count: number
}

interface Props {
  categories: CategoryData[]
  totalSpend: number
}

export default function CategoryBreakdown({ categories, totalSpend }: Props) {
  if (!categories || categories.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No category data yet
      </div>
    )
  }

  const data = categories.slice(0, 8)

  return (
    <div className="space-y-4">
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
            stroke="none"
          >
            {data.map(entry => (
              <Cell key={entry.category} fill={categoryColor(entry.category)} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Amount']}
            contentStyle={{
              borderRadius: 12,
              border: '1px solid hsl(var(--border))',
              boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
              background: 'hsl(var(--popover))',
              color: 'hsl(var(--popover-foreground))',
              fontSize: 13,
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Category list — doubles as the legend (color + icon = identity, never color alone) */}
      <div className="space-y-2.5">
        {data.map(cat => {
          const pct = totalSpend > 0 ? Math.round((cat.amount / totalSpend) * 100) : 0
          const { icon: Icon, textClass, bgClass } = getCategoryMeta(cat.category)
          return (
            <div key={cat.category} className="flex items-center gap-3">
              <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${bgClass} ${textClass}`}>
                <Icon size={14} />
              </div>
              <span className="flex-1 truncate text-sm text-foreground">{cat.category}</span>
              <span className="hidden text-xs text-muted-foreground sm:inline">{cat.count} txns</span>
              <span className="w-20 text-right text-sm font-semibold tabular-nums text-foreground">
                ₹{cat.amount.toLocaleString('en-IN')}
              </span>
              <div className="hidden h-1.5 w-16 rounded-full bg-muted sm:block">
                <div
                  className={`h-1.5 rounded-full ${bgClass.replace('/10', '')}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 text-xs tabular-nums text-muted-foreground">{pct}%</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
