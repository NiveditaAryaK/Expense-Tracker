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

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid hsl(var(--border))',
  boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
  background: 'hsl(var(--popover))',
  color: 'hsl(var(--popover-foreground))',
  fontSize: 13,
}

const axisTick = { fontSize: 11, fill: 'hsl(var(--chart-muted))' }

export function DailyTrendChart({ trend }: { trend: TrendData[] }) {
  if (!trend || trend.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
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
            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.18} />
            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" vertical={false} />
        <XAxis dataKey="date" tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
          width={45}
        />
        <Tooltip formatter={(value: number) => [formatCurrency(value), 'Spent']} contentStyle={tooltipStyle} />
        <Area
          type="monotone"
          dataKey="amount"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          fill="url(#spendGradient)"
          activeDot={{ r: 4, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

export function MonthlyComparisonChart({ monthly }: { monthly: MonthlyData[] }) {
  if (!monthly || monthly.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Not enough history yet
      </div>
    )
  }

  const data = monthly.map(m => ({ ...m, month: formatMonth(m.month) }))

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--chart-grid))" vertical={false} />
        <XAxis dataKey="month" tick={axisTick} tickLine={false} axisLine={false} />
        <YAxis
          tick={axisTick}
          tickLine={false}
          axisLine={false}
          tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`}
          width={45}
        />
        <Tooltip formatter={(value: number) => [formatCurrency(value), 'Total Spend']} contentStyle={tooltipStyle} />
        <Bar dataKey="amount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}
