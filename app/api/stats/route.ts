import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

// GET /api/stats — aggregated stats for dashboard
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : new Date().getMonth() + 1
  const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear()

  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59)

  try {
    // Total spend & income this month
    const [allTransactions, categoryBreakdown, dailySpend] = await Promise.all([
      prisma.transaction.findMany({
        where: { date: { gte: startDate, lte: endDate } },
        orderBy: { date: 'asc' },
      }),
      prisma.transaction.groupBy({
        by: ['category', 'type'],
        where: { date: { gte: startDate, lte: endDate }, type: 'debit' },
        _sum: { amount: true },
        _count: true,
        orderBy: { _sum: { amount: 'desc' } },
      }),
      prisma.transaction.groupBy({
        by: ['date'],
        where: { date: { gte: startDate, lte: endDate }, type: 'debit' },
        _sum: { amount: true },
      }),
    ])

    const totalSpend = allTransactions
      .filter(t => t.type === 'debit')
      .reduce((sum, t) => sum + t.amount, 0)

    const totalIncome = allTransactions
      .filter(t => t.type === 'credit')
      .reduce((sum, t) => sum + t.amount, 0)

    const transactionCount = allTransactions.length
    const avgTransaction = totalSpend / (allTransactions.filter(t => t.type === 'debit').length || 1)

    // Daily spend trend — aggregate by day
    const dailyMap: Record<string, number> = {}
    dailySpend.forEach(({ date, _sum }) => {
      const day = new Date(date).toISOString().split('T')[0]
      dailyMap[day] = (dailyMap[day] || 0) + (_sum.amount || 0)
    })

    const trend = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount: Math.round(amount * 100) / 100 }))

    // Category breakdown (top categories)
    const categories = categoryBreakdown.map(c => ({
      category: c.category,
      amount: Math.round((c._sum.amount || 0) * 100) / 100,
      count: c._count,
    }))

    // Last 6 months comparison
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5)
    sixMonthsAgo.setDate(1)

    const historicalRaw = await prisma.transaction.groupBy({
      by: ['date', 'type'],
      where: { date: { gte: sixMonthsAgo }, type: 'debit' },
      _sum: { amount: true },
    })

    const monthlyMap: Record<string, number> = {}
    historicalRaw.forEach(({ date, _sum }) => {
      const d = new Date(date)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyMap[key] = (monthlyMap[key] || 0) + (_sum.amount || 0)
    })

    const monthly = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, amount]) => ({
        month,
        amount: Math.round(amount * 100) / 100,
      }))

    return NextResponse.json({
      summary: {
        totalSpend: Math.round(totalSpend * 100) / 100,
        totalIncome: Math.round(totalIncome * 100) / 100,
        transactionCount,
        avgTransaction: Math.round(avgTransaction * 100) / 100,
        savings: Math.round((totalIncome - totalSpend) * 100) / 100,
      },
      categories,
      trend,
      monthly,
    })
  } catch (error) {
    console.error('GET /api/stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
