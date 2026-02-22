import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { parseSmsTransaction } from '@/lib/parser'

// GET /api/transactions — list transactions with filters
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : null
  const year = searchParams.get('year') ? parseInt(searchParams.get('year')!) : new Date().getFullYear()
  const category = searchParams.get('category')
  const type = searchParams.get('type') as 'debit' | 'credit' | null
  const limit = parseInt(searchParams.get('limit') || '100')
  const offset = parseInt(searchParams.get('offset') || '0')

  try {
    const where: Record<string, unknown> = {}

    if (month && year) {
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0, 23, 59, 59)
      where.date = { gte: startDate, lte: endDate }
    } else if (year) {
      const startDate = new Date(year, 0, 1)
      const endDate = new Date(year, 11, 31, 23, 59, 59)
      where.date = { gte: startDate, lte: endDate }
    }

    if (category) where.category = category
    if (type) where.type = type

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { date: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.transaction.count({ where }),
    ])

    return NextResponse.json({ transactions, total, limit, offset })
  } catch (error) {
    console.error('GET /api/transactions error:', error)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }
}

// POST /api/transactions — add a transaction (manual or from agent)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // If raw SMS provided, parse it
    if (body.rawSms && body.sender) {
      const parsed = parseSmsTransaction(body.sender, body.rawSms, body.date ? new Date(body.date) : new Date())
      if (!parsed) {
        return NextResponse.json({ error: 'Could not parse SMS as a financial transaction' }, { status: 422 })
      }

      // Check for duplicate via SmsLog
      if (body.messageId) {
        const existing = await prisma.smsLog.findUnique({ where: { messageId: body.messageId } })
        if (existing) {
          return NextResponse.json({ message: 'Duplicate — already processed', skipped: true })
        }

        await prisma.smsLog.create({
          data: {
            messageId: body.messageId,
            sender: body.sender,
            body: body.rawSms,
            parsed: true,
          },
        })
      }

      const transaction = await prisma.transaction.create({
        data: {
          amount: parsed.amount,
          type: parsed.type,
          merchant: parsed.merchant,
          category: parsed.category,
          bank: parsed.bank,
          account: parsed.account,
          upiId: parsed.upiId,
          rawSms: parsed.rawSms,
          source: 'sms',
          date: parsed.date,
        },
      })

      return NextResponse.json({ transaction }, { status: 201 })
    }

    // Manual transaction
    const transaction = await prisma.transaction.create({
      data: {
        amount: body.amount,
        type: body.type || 'debit',
        merchant: body.merchant,
        category: body.category || 'Uncategorized',
        bank: body.bank,
        account: body.account,
        rawSms: body.rawSms || '',
        source: 'manual',
        date: body.date ? new Date(body.date) : new Date(),
      },
    })

    return NextResponse.json({ transaction }, { status: 201 })
  } catch (error) {
    console.error('POST /api/transactions error:', error)
    return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 })
  }
}

// DELETE /api/transactions — delete a transaction by id
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  try {
    await prisma.transaction.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 })
  }
}
