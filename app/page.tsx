'use client'

import { useState, useEffect, useCallback } from 'react'
import { TrendingDown, TrendingUp, Wallet, ArrowUpDown, Plus, RefreshCw, Activity, Terminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import StatsCard from '@/components/StatsCard'
import { DailyTrendChart, MonthlyComparisonChart } from '@/components/SpendingChart'
import CategoryBreakdown from '@/components/CategoryBreakdown'
import TransactionList from '@/components/TransactionList'
import AddTransactionModal from '@/components/AddTransactionModal'

interface Stats {
  summary: {
    totalSpend: number
    totalIncome: number
    transactionCount: number
    avgTransaction: number
    savings: number
  }
  categories: { category: string; amount: number; count: number }[]
  trend: { date: string; amount: number }[]
  monthly: { month: string; amount: number }[]
}

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

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function Dashboard() {
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [stats, setStats] = useState<Stats | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [statsRes, txRes] = await Promise.all([
        fetch(`/api/stats?month=${month}&year=${year}`),
        fetch(`/api/transactions?month=${month}&year=${year}&limit=200`),
      ])
      const statsData = await statsRes.json()
      const txData = await txRes.json()
      setStats(statsData)
      setTransactions(txData.transactions || [])
    } catch (error) {
      console.error('Failed to fetch data:', error)
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useEffect(() => { fetchData() }, [fetchData])

  const handleDelete = async (id: string) => {
    await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  const fmt = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  const monthIdx = parseInt(month) - 1

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top navigation */}
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-sm">
              💸
            </div>
            <span className="font-semibold text-foreground">Expense Tracker</span>
            <Badge variant="secondary" className="text-xs">Beta</Badge>
          </div>

          <div className="flex items-center gap-2">
            {/* Month selector */}
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-[130px] h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Year selector */}
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-[90px] h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2023, 2024, 2025, 2026].map(y => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </Button>

            <Button size="sm" onClick={() => setShowModal(true)}>
              <Plus size={14} />
              Add
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-6 py-6">
        <Tabs defaultValue="overview">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {SHORT_MONTHS[monthIdx]} {year}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">Your financial overview</p>
            </div>
            <TabsList>
              <TabsTrigger value="overview" className="gap-1.5">
                <Activity size={14} /> Overview
              </TabsTrigger>
              <TabsTrigger value="transactions" className="gap-1.5">
                <ArrowUpDown size={14} /> Transactions
              </TabsTrigger>
            </TabsList>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Loading expenses...</p>
              </div>
            </div>
          ) : (
            <>
              <TabsContent value="overview" className="mt-0 space-y-5">
                {/* Stats grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <StatsCard
                    title="Total Spent"
                    value={stats ? fmt(stats.summary.totalSpend) : '—'}
                    subtitle={`${transactions.filter(t => t.type === 'debit').length} transactions`}
                    icon={TrendingDown}
                    iconClassName="bg-red-100 text-red-600"
                  />
                  <StatsCard
                    title="Total Income"
                    value={stats ? fmt(stats.summary.totalIncome) : '—'}
                    subtitle={`${transactions.filter(t => t.type === 'credit').length} credits`}
                    icon={TrendingUp}
                    iconClassName="bg-emerald-100 text-emerald-600"
                  />
                  <StatsCard
                    title="Net Savings"
                    value={stats ? fmt(stats.summary.savings) : '—'}
                    subtitle={stats && stats.summary.savings >= 0 ? '🎉 Saved this month' : '⚠️ Over budget'}
                    icon={Wallet}
                    iconClassName={stats && stats.summary.savings >= 0 ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}
                  />
                  <StatsCard
                    title="Avg Transaction"
                    value={stats ? fmt(stats.summary.avgTransaction) : '—'}
                    subtitle="per transaction"
                    icon={ArrowUpDown}
                    iconClassName="bg-purple-100 text-purple-600"
                  />
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Daily Spend — {SHORT_MONTHS[monthIdx]}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <DailyTrendChart trend={stats?.trend || []} />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        6-Month Comparison
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <MonthlyComparisonChart monthly={stats?.monthly || []} />
                    </CardContent>
                  </Card>
                </div>

                {/* Category + Recent */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Spending by Category
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CategoryBreakdown
                        categories={stats?.categories || []}
                        totalSpend={stats?.summary.totalSpend || 0}
                      />
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                      <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                        Recent Transactions
                      </CardTitle>
                      <Badge variant="secondary">{transactions.length}</Badge>
                    </CardHeader>
                    <CardContent>
                      <TransactionList
                        transactions={transactions.slice(0, 8)}
                        onDelete={handleDelete}
                      />
                    </CardContent>
                  </Card>
                </div>

                {/* Agent CTA */}
                <Card className="bg-primary/5 border-primary/20">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary flex-shrink-0">
                        <Terminal size={16} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">Background SMS Agent</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Auto-import transactions from iMessage. Run{' '}
                          <code className="bg-primary/10 px-1.5 py-0.5 rounded text-primary font-mono text-xs">npm run agent</code>
                          {' '}in your terminal to start the watcher.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="transactions" className="mt-0">
                <Card>
                  <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <div>
                      <CardTitle>All Transactions</CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {SHORT_MONTHS[monthIdx]} {year} · {transactions.length} total
                      </p>
                    </div>
                    <Button size="sm" onClick={() => setShowModal(true)}>
                      <Plus size={14} /> Add
                    </Button>
                  </CardHeader>
                  <Separator />
                  <CardContent className="pt-4">
                    <TransactionList transactions={transactions} onDelete={handleDelete} />
                  </CardContent>
                </Card>
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>

      {showModal && (
        <AddTransactionModal
          onClose={() => setShowModal(false)}
          onAdded={() => { fetchData(); setShowModal(false) }}
        />
      )}
    </div>
  )
}
