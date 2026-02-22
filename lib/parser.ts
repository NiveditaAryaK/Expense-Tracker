// ─────────────────────────────────────────────────────────────────────────────
// SMS Transaction Parser — supports Indian banks (HDFC, SBI, ICICI, Axis,
// Kotak, Yes Bank) + UPI (GPay, PhonePe, Paytm) + generic credit card alerts
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedTransaction {
  amount: number
  type: 'debit' | 'credit'
  merchant?: string
  bank?: string
  account?: string
  upiId?: string
  date: Date
  category: string
  rawSms: string
}

// Category keywords mapping
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Food: ['swiggy', 'zomato', 'uber eats', 'dunzo', 'blinkit', 'grofers', 'bigbasket', 'restaurant', 'cafe', 'food', 'pizza', 'burger', 'dominos', 'mcdonalds', 'kfc'],
  Shopping: ['amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'meesho', 'shopping', 'mall', 'store', 'retail'],
  Transport: ['uber', 'ola', 'rapido', 'metro', 'irctc', 'makemytrip', 'goibibo', 'airlines', 'petrol', 'fuel', 'parking'],
  Entertainment: ['netflix', 'spotify', 'hotstar', 'prime', 'youtube', 'bookmyshow', 'pvr', 'inox', 'game', 'play'],
  Health: ['pharmacy', 'hospital', 'clinic', 'medplus', 'apollo', 'netmeds', 'practo', 'doctor', 'medicine', 'health'],
  Utilities: ['electricity', 'water', 'gas', 'broadband', 'jio', 'airtel', 'vodafone', 'bsnl', 'recharge', 'bill', 'utility'],
  Finance: ['emi', 'loan', 'insurance', 'mutual fund', 'sip', 'tax', 'investment', 'fd', 'bank', 'interest'],
  Education: ['school', 'college', 'university', 'course', 'udemy', 'coursera', 'byju', 'unacademy'],
}

function categorize(merchant: string = ''): string {
  const lower = merchant.toLowerCase()
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return category
    }
  }
  return 'Uncategorized'
}

function extractAmount(text: string): number | null {
  // Match patterns: Rs.1,234.56 | Rs 1234 | INR 1,234.56 | ₹1234
  const patterns = [
    /(?:rs\.?|inr|₹)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i,
    /([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:rs\.?|inr|rupees)/i,
  ]
  for (const p of patterns) {
    const match = text.match(p)
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''))
    }
  }
  return null
}

function extractAccount(text: string): string | undefined {
  const match = text.match(/(?:a\/c|acct|account|card)\s*(?:no\.?|number)?\s*[xX*]+(\d{4})/i)
  return match ? match[1] : undefined
}

function extractUpiId(text: string): string | undefined {
  const match = text.match(/(?:upi\s*id|vpa):?\s*([\w.\-]+@[\w.\-]+)/i)
  return match ? match[1] : undefined
}

function extractMerchant(text: string): string | undefined {
  // Try different merchant patterns
  const patterns = [
    /(?:at|to|towards|@)\s+([A-Za-z0-9 _\-&.']+?)(?:\.|,|\s+on|\s+info|\s+avl|\s+bal|$)/i,
    /info:\s*([A-Za-z0-9 _\-&.']+?)(?:\.|,|$)/i,
    /txn\s+(?:at|to|for)\s+([A-Za-z0-9 _\-&.']+?)(?:\.|,|$)/i,
  ]
  for (const p of patterns) {
    const match = text.match(p)
    if (match) {
      const merchant = match[1].trim()
      if (merchant.length > 2 && merchant.length < 60) return merchant
    }
  }
  return undefined
}

function detectBank(sender: string, body: string): string | undefined {
  const combined = (sender + ' ' + body).toLowerCase()
  const banks: Record<string, string> = {
    'HDFC': 'hdfc',
    'SBI': 'sbi',
    'ICICI': 'icici',
    'Axis': 'axis',
    'Kotak': 'kotak',
    'Yes Bank': 'yesbank',
    'PNB': 'pnb',
    'BOI': 'boi',
    'Canara': 'canara',
    'IndusInd': 'indusind',
    'Citibank': 'citi',
    'American Express': 'amex',
  }
  for (const [name, keyword] of Object.entries(banks)) {
    if (combined.includes(keyword)) return name
  }
  return undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// Main parse function
// ─────────────────────────────────────────────────────────────────────────────
export function parseSmsTransaction(
  sender: string,
  body: string,
  receivedAt: Date = new Date()
): ParsedTransaction | null {
  const lower = body.toLowerCase()

  // Quick filter — must look like a financial SMS
  const isFinancial =
    /rs\.?|inr|₹|rupee/i.test(body) &&
    /debit|credit|spent|paid|payment|withdraw|transfer|emi|purchase/i.test(body)

  if (!isFinancial) return null

  const amount = extractAmount(body)
  if (!amount || amount <= 0) return null

  // Determine transaction type
  let type: 'debit' | 'credit' = 'debit'
  if (/credited|credit|received|refund|cashback|reversal/i.test(body)) {
    type = 'credit'
  }

  const merchant = extractMerchant(body)
  const account = extractAccount(body)
  const upiId = extractUpiId(body)
  const bank = detectBank(sender, body)
  const category = type === 'credit' ? 'Income' : categorize(merchant || body)

  return {
    amount,
    type,
    merchant,
    bank,
    account,
    upiId,
    date: receivedAt,
    category,
    rawSms: body,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Financial SMS sender patterns (for filtering iMessage senders)
// ─────────────────────────────────────────────────────────────────────────────
export const FINANCIAL_SENDER_PATTERNS = [
  /hdfc/i, /sbi/i, /icici/i, /axis/i, /kotak/i, /yesbank/i, /pnb/i,
  /boi/i, /canara/i, /indusind/i, /citi/i, /amex/i, /rbl/i,
  /paytm/i, /phonepe/i, /googlepay/i, /gpay/i, /bhim/i,
  /amazonpay/i, /mobikwik/i,
  /bank/i, /credit/i, /debit/i, /upi/i, /txn/i,
  /JD-/i, /VM-/i, /AD-/i, /BP-/i, /VK-/i, // Indian telecom prefixes
]

export function isFinancialSender(sender: string): boolean {
  return FINANCIAL_SENDER_PATTERNS.some(p => p.test(sender))
}
