'use client'

import { useState, useEffect, useCallback } from 'react'
import { TrendingDown, TrendingUp, Wallet, ArrowUpDown, Plus, RefreshCw, Menu, Terminal, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import Sidebar, { type Section } from '@/components/Sidebar'
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

const SECTION_META: Record<Section, { title: string; subtitle: string }> = {
  overview: { title: 'Overview', subtitle: 'Your financial snapshot for the period' },
  transactions: { title: 'Transactions', subtitle: 'Every transaction, searchable and sortable' },
  categories: { title: 'Categories', subtitle: 'Where your money is going' },
  agent: { title: 'SMS Agent', subtitle: 'Automatic import from your bank SMS' },
}

export default function Dashboard() {
  const now = new Date()
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))
  const [stats, setStats] = useState<Stats | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [section, setSection] = useState<Section>('overview')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [copied, setCopied] = useState(false)

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

  const copyCommand = () => {
    navigator.clipboard.writeText('npm run agent')
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const fmt = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
  const monthIdx = parseInt(month) - 1
  const meta = SECTION_META[section]

  return (
    <div className="min-h-screen bg-background">
      <Sidebar
        active={section}
        onChange={setSection}
        userEmail="nivedita.arya.k1@gmail.com"
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              className="text-muted-foreground lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold text-foreground">{meta.title}</h1>
            </div>

            <div className="flex items-center gap-2">
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="h-9 w-[110px] text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="hidden h-9 w-[85px] text-sm sm:flex">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2023, 2024, 2025, 2026].map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="outline" size="icon" className="h-9 w-9" onClick={fetchData} disabled={loading}>
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </Button>

              <Button size="sm" className="h-9" onClick={() => setShowModal(true)}>
                <Plus size={14} />
                <span className="hidden sm:inline">Add</span>
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6">
          <div className="mb-5 flex items-baseline gap-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              {SHORT_MONTHS[monthIdx]} {year}
            </h2>
            <span className="text-sm text-muted-foreground">· {meta.subtitle}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                <p className="text-sm text-muted-foreground">Loading expenses...</p>
              </div>
            </div>
          ) : (
            <>
              {section === 'overview' && (
                <div className="animate-fade-in space-y-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <StatsCard
                      title="Total Spent"
                      value={stats ? fmt(stats.summary.totalSpend) : '—'}
                      subtitle={`${transactions.filter(t => t.type === 'debit').length} transactions`}
                      icon={TrendingDown}
                      iconClassName="bg-status-critical/10 text-status-critical"
                    />
                    <StatsCard
                      title="Total Income"
                      value={stats ? fmt(stats.summary.totalIncome) : '—'}
                      subtitle={`${transactions.filter(t => t.type === 'credit').length} credits`}
                      icon={TrendingUp}
                      iconClassName="bg-status-good/10 text-status-good"
                    />
                    <StatsCard
                      title="Net Savings"
                      value={stats ? fmt(stats.summary.savings) : '—'}
                      subtitle={stats && stats.summary.savings >= 0 ? 'Saved this period' : 'Over budget'}
                      icon={Wallet}
                      iconClassName={stats && stats.summary.savings >= 0 ? 'bg-cat-1/10 text-cat-1' : 'bg-status-serious/10 text-status-serious'}
                    />
                    <StatsCard
                      title="Avg Transaction"
                      value={stats ? fmt(stats.summary.avgTransaction) : '—'}
                      subtitle="per transaction"
                      icon={ArrowUpDown}
                      iconClassName="bg-cat-5/10 text-cat-5"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          Daily Spend — {SHORT_MONTHS[monthIdx]}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <DailyTrendChart trend={stats?.trend || []} />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                          6-Month Comparison
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <MonthlyComparisonChart monthly={stats?.monthly || []} />
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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

                  <button
                    onClick={() => setSection('agent')}
                    className="flex w-full items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-left transition-colors hover:bg-primary/10"
                  >
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Terminal size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">Background SMS Agent</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Auto-import transactions from iMessage. View setup instructions →
                      </p>
                    </div>
                  </button>
                </div>
              )}

              {section === 'transactions' && (
                <Card className="animate-fade-in">
                  <CardHeader className="flex flex-row items-center justify-between pb-3">
                    <div>
                      <CardTitle>All Transactions</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
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
              )}

              {section === 'categories' && (
                <div className="animate-fade-in grid grid-cols-1 gap-5 lg:grid-cols-3">
                  <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                        Spending by Category — {SHORT_MONTHS[monthIdx]} {year}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <CategoryBreakdown
                        categories={stats?.categories || []}
                        totalSpend={stats?.summary.totalSpend || 0}
                      />
                    </CardContent>
                  </Card>

                  <div className="space-y-4">
                    <StatsCard
                      title="Total Spent"
                      value={stats ? fmt(stats.summary.totalSpend) : '—'}
                      subtitle={`across ${stats?.categories.length || 0} categories`}
                      icon={TrendingDown}
                      iconClassName="bg-status-critical/10 text-status-critical"
                    />
                    <StatsCard
                      title="Top Category"
                      value={stats?.categories[0]?.category || '—'}
                      subtitle={stats?.categories[0] ? fmt(stats.categories[0].amount) : undefined}
                      icon={Wallet}
                      iconClassName="bg-cat-1/10 text-cat-1"
                    />
                  </div>
                </div>
              )}

              {section === 'agent' && (
                <div className="animate-fade-in mx-auto max-w-2xl">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Terminal size={20} />
                        </div>
                        <div>
                          <CardTitle>Background SMS Agent</CardTitle>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            Automatically parse and import bank SMS as they arrive
                          </p>
                        </div>
                      </div>
                    </CardHeader>
                    <Separator />
                    <CardContent className="space-y-4 pt-5">
                      <p className="text-sm text-muted-foreground">
                        Run the watcher in your terminal to continuously import transactions detected
                        from iMessage/SMS forwarding. It categorizes and adds new transactions automatically.
                      </p>
                      <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 px-4 py-3">
                        <code className="font-mono text-sm text-foreground">npm run agent</code>
                        <Button variant="outline" size="sm" onClick={copyCommand}>
                          {copied ? <Check size={14} /> : <Copy size={14} />}
                          {copied ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Don&apos;t have SMS forwarding set up? Use the <span className="font-medium text-foreground">Add</span> button
                        to paste a bank SMS manually and it&apos;ll be parsed the same way.
                      </p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </>
          )}
        </main>
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
