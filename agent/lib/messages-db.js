// Shared iMessage/SMS reading + financial-message filtering + API sending
// logic, used by both agent/sms-watcher.js (continuous, cursor-based) and
// agent/backfill.js (one-shot, date-range based). Kept in one place so a fix
// like the multi-line SMS parsing bug only ever needs to happen once.

const { execSync } = require('child_process')
const path = require('path')
const os = require('os')
const fs = require('fs')

// ── Financial content keywords (used when sender is a raw phone number) ────
// Indian banks often send SMS from numeric shortcodes (+9156xxxx) not named IDs.
// So we filter primarily by message CONTENT, not sender.
const FINANCIAL_CONTENT_PATTERNS = [
  /rs\.?\s*[\d,]+/i,           // Rs. 1,234  or Rs 500
  /inr\s*[\d,]+/i,             // INR 1234
  /₹\s*[\d,]+/,                // ₹500
  /debited/i,
  /credited/i,
  /\bupi\b/i,
  /spent.*(?:rs|inr|₹)/i,
  /(?:rs|inr|₹).*spent/i,
  /a\/c.*debited/i,
  /debited.*a\/c/i,
  /transaction.*(?:rs|inr|₹)/i,
  /payment.*(?:rs|inr|₹)/i,
  /(?:rs|inr|₹).*payment/i,
  /balance.*(?:rs|inr|₹)/i,
  /(?:rs|inr|₹).*balance/i,
  /emi.*(?:rs|inr|₹)/i,
  /cashback/i,
  /refund.*(?:rs|inr|₹)/i,
]

// Named sender patterns (alphanumeric IDs from some carriers)
const FINANCIAL_SENDER_PATTERNS = [
  /hdfc/i, /sbi/i, /icici/i, /axis/i, /kotak/i, /yesbank/i, /pnb/i,
  /boi/i, /canara/i, /indusind/i, /citi/i, /amex/i, /rbl/i, /idfc/i,
  /paytm/i, /phonepe/i, /googlepay/i, /gpay/i, /bhim/i, /amazonpay/i,
  /^[A-Z]{2}-[A-Z]{4,8}$/,
  /^VM-/i, /^BP-/i, /^VK-/i, /^AD-/i, /^JD-/i,
  /bank/i, /credit.?card/i, /debit.?card/i,
]

function isFinancialMessage(sender, text) {
  if (!text) return false
  const senderMatch = sender && FINANCIAL_SENDER_PATTERNS.some(p => p.test(sender.trim()))
  if (senderMatch) return true
  return FINANCIAL_CONTENT_PATTERNS.some(p => p.test(text))
}

// Pre-filter by content keywords directly in SQL for performance
const CONTENT_SQL_FILTER = `(
  lower(m.text) LIKE '%rs.%' OR lower(m.text) LIKE '%inr%' OR
  lower(m.text) LIKE '%debited%' OR lower(m.text) LIKE '%credited%' OR
  lower(m.text) LIKE '%₹%' OR lower(m.text) LIKE '%upi%' OR
  lower(m.text) LIKE '%spent%' OR lower(m.text) LIKE '%cashback%' OR
  lower(m.text) LIKE '%emi%' OR lower(m.text) LIKE '%refund%' OR
  lower(m.text) LIKE '%payment%'
)`

const APPLE_EPOCH_MS = new Date('2001-01-01T00:00:00Z').getTime()

function toAppleNs(date) {
  return (date.getTime() - APPLE_EPOCH_MS) * 1000000
}

// ── Read messages from a macOS Messages chat.db ─────────────────────────────
// opts:
//   afterRowId — cursor mode: only ROWID > afterRowId (used by the watcher)
//   sinceDate / untilDate — date-range mode: date window (used by backfill)
//   limit — max rows per call (default 2000)
function queryMessages(dbPath, opts = {}) {
  const { afterRowId = 0, sinceDate = null, untilDate = null, limit = 2000 } = opts

  if (!fs.existsSync(dbPath)) {
    throw new Error(`iMessage database not found at: ${dbPath}\n\nMake sure:\n  1. Messages app is enabled on this Mac\n  2. Terminal has Full Disk Access (System Settings > Privacy & Security > Full Disk Access)`)
  }

  // Copy DB to temp location to avoid locking issues while Messages.app is open
  const tmpDb = path.join(os.tmpdir(), `chat_copy_${Date.now()}_${Math.random().toString(36).slice(2)}.db`)
  fs.copyFileSync(dbPath, tmpDb)

  try {
    const conditions = [
      `m.is_from_me = 0`,
      `m.text IS NOT NULL`,
      `length(m.text) > 10`,
      CONTENT_SQL_FILTER,
    ]
    if (afterRowId > 0) conditions.push(`m.ROWID > ${afterRowId}`)
    if (sinceDate) conditions.push(`m.date > ${toAppleNs(sinceDate)}`)
    if (untilDate) conditions.push(`m.date < ${toAppleNs(untilDate)}`)

    // m.text often contains embedded newlines (real SMS are multi-line), which
    // would otherwise split one logical row across several physical output
    // lines and corrupt the '|||'-delimited parsing below. Replace them with
    // a sentinel here and restore them after parsing.
    const NEWLINE_SENTINEL = '␤' // SYMBOL FOR NEWLINE — vanishingly unlikely in real SMS text
    const textExpr = `replace(m.text, char(10), '${NEWLINE_SENTINEL}')`

    const query = `SELECT m.ROWID, ${textExpr}, m.date, h.id AS sender
       FROM message m
       JOIN handle h ON m.handle_id = h.ROWID
       WHERE ${conditions.join(' AND ')}
       ORDER BY m.ROWID ASC
       LIMIT ${limit};`

    const output = execSync(`sqlite3 -separator '|||' "${tmpDb}" "${query}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 50 * 1024 * 1024,
    }).trim()

    if (!output) return []

    return output.split('\n').map(line => {
      const parts = line.split('|||')
      if (parts.length < 4) return null
      const [rowid, text, dateNs, sender] = parts
      const date = new Date(APPLE_EPOCH_MS + parseInt(dateNs) / 1000000)

      return {
        rowid: parseInt(rowid),
        text: text.replaceAll(NEWLINE_SENTINEL, '\n').trim(),
        date,
        sender: sender.trim(),
      }
    }).filter(Boolean)

  } finally {
    try { fs.unlinkSync(tmpDb) } catch {}
  }
}

// ── Send a parsed message to the API for parsing + storage ─────────────────
async function sendTransaction(apiBase, message, idPrefix = 'imsg') {
  const { rowid, text, date, sender } = message
  try {
    const response = await fetch(`${apiBase}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: `${idPrefix}-${rowid}`,
        sender,
        rawSms: text,
        date: date.toISOString(),
      }),
    })

    const data = await response.json()

    if (data.skipped) return { status: 'skipped', rowid }
    if (!response.ok) return { status: 'rejected', rowid, reason: data.error }
    return { status: 'created', rowid, transaction: data.transaction }
  } catch (err) {
    return { status: 'error', rowid, reason: err.message }
  }
}

// ── Formatting helpers ──────────────────────────────────────────────────────
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
}

function log(msg, color = '') {
  const ts = new Date().toLocaleTimeString()
  console.log(`${colors.dim}[${ts}]${colors.reset} ${color}${msg}${colors.reset}`)
}

function logTransaction(tx) {
  const type = tx.type === 'debit' ? `${colors.red}−` : `${colors.green}+`
  const amount = `₹${tx.amount.toLocaleString('en-IN')}`
  const merchant = tx.merchant || tx.upiId || tx.bank || 'Unknown'
  console.log(`       ${type}${amount}${colors.reset}  ${merchant}  ${colors.dim}(${tx.category})${colors.reset}`)
}

module.exports = {
  FINANCIAL_CONTENT_PATTERNS,
  FINANCIAL_SENDER_PATTERNS,
  isFinancialMessage,
  queryMessages,
  sendTransaction,
  colors,
  log,
  logTransaction,
}
