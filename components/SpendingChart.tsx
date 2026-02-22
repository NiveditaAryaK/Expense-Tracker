'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts'
import { format, parseISO } from 'date-fns'

interface TrendData {
  date: string
  amount: number
}

interface MonthlyData {
  month: string
  amount: number
}

interface SpendingChartProps {
  trend: TrendData[]
  monthly: MonthlyData[]
}

function formatCurrency(value: number) {
  return `₹${value.toLocaleString('en-IN')}`
}

function formatDate(dateStr: string) {
  try {
    return format(parseISO(dateStr), 'MMM d')
  } catch {
    return dateStr
  }
}

function formatMonth(monthStr: string) {
  try {
    const [year, month] = monthStr.split('-')
    return format(new Date(parseInt(year), parseInt(month) - 1, 1), 'MMM yy')
  } catch {
    return monthStr
  }
}

export function DailyTrendChart({ trend }: { trend: TrendData[] }) {
  if (!trend || trend.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        No spending data for this period
      </div>
    )
  }

  const data = trend.map(d => ({ ...d, date: formatDate(d.date) }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
          width={45}
        />
        <Tooltip
          formatter={(value: number) => [formatCurrency(value), 'Spent']}
          contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
        />
        <Area
          type="monotone"
          dataKey="amount"
          stroke="#6366f1"
          strokeWidth={2.5}
          fill="url(#spendGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function MonthlyComparisonChart({ monthly }: { monthly: MonthlyData[] }) {
  if (!monthly || monthly.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Not enough history yet
      </div>
    )
  }

  const data = monthly.map(m => ({ ...m, month: formatMonth(m.month) }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#9ca3af' }}
          tickLine={false}
          axisLine={false}
          tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
          width={45}
        />
        <Tooltip
          formatter={(value: number) => [formatCurrency(value), 'Total Spend']}
          contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
        />
        <Bar dataKey="amount" fill="#6366f1" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
