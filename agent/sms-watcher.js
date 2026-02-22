#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Expense Tracker — Background SMS Watcher Agent
// ─────────────────────────────────────────────────────────────────────────────
// Reads iMessage/SMS messages from macOS ~/Library/Messages/chat.db (SQLite),
// parses financial transactions, and sends them to the Next.js API.
//
// Requirements:
//   • macOS with Messages app enabled
//   • Full Disk Access granted to Terminal in System Settings > Privacy & Security
//   • Node.js 18+  |  Run: node agent/sms-watcher.js
// ─────────────────────────────────────────────────────────────────────────────

const { execSync, exec } = require('child_process')
const path = require('path')
const os = require('os')
const fs = require('fs')

// ── Config ─────────────────────────────────────────────────────────────────
const API_BASE = process.env.API_BASE || 'http://localhost:3000'
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL || '30000') // 30 seconds
const MESSAGES_DB = process.env.MESSAGES_DB || path.join(os.homedir(), 'Library', 'Messages', 'chat.db')
const LOOKBACK_DAYS = parseInt(process.env.LOOKBACK_DAYS || '3650') // how many days back to scan on first run (default: ~10 years = all history)
const SINCE_DATE = process.env.SINCE_DATE || null  // e.g. "2026-02-01" to scan from a specific date
const RESET = process.env.RESET === '1'            // set RESET=1 to ignore saved state and re-scan
const STATE_FILE = path.join(__dirname, '.agent-state.json')

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
  // Match on named sender (alphanumeric)
  const senderMatch = sender && FINANCIAL_SENDER_PATTERNS.some(p => p.test(sender.trim()))
  if (senderMatch) return true
  // Match on content (catches numeric shortcode senders like +9156767181)
  return FINANCIAL_CONTENT_PATTERNS.some(p => p.test(text))
}

// ── State persistence ──────────────────────────────────────────────────────
function loadState() {
  if (RESET) {
    log('🔄 RESET=1 — ignoring saved state, scanning from scratch', colors.yellow)
    return { lastRowId: 0 }
  }
  try {
    if (fs.existsSync(STATE_FILE)) {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
    }
  } catch {}
  return { lastRowId: 0 }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
}

// ── Read messages from iMessage DB ─────────────────────────────────────────
function queryMessages(lastRowId) {
  if (!fs.existsSync(MESSAGES_DB)) {
    throw new Error(`iMessage database not found at: ${MESSAGES_DB}\n\nMake sure:\n  1. Messages app is enabled on this Mac\n  2. Terminal has Full Disk Access (System Settings > Privacy & Security > Full Disk Access)`)
  }

  // Copy DB to temp location to avoid locking issues
  const tmpDb = path.join(os.tmpdir(), `chat_copy_${Date.now()}.db`)
  fs.copyFileSync(MESSAGES_DB, tmpDb)

  try {
    // Build lookback date if no prior state
    let lookbackDate
    if (SINCE_DATE) {
      lookbackDate = new Date(SINCE_DATE)
      if (isNaN(lookbackDate.getTime())) throw new Error(`Invalid SINCE_DATE: ${SINCE_DATE}. Use format YYYY-MM-DD`)
    } else {
      lookbackDate = new Date()
      lookbackDate.setDate(lookbackDate.getDate() - LOOKBACK_DAYS)
    }
    // macOS stores message date as nanoseconds since 2001-01-01 (Apple epoch)
    const appleEpoch = new Date('2001-01-01T00:00:00Z').getTime()
    const lookbackNs = (lookbackDate.getTime() - appleEpoch) * 1000000  // to nanoseconds

    // Pre-filter by content keywords directly in SQL for performance
    const contentFilter = `(
      lower(m.text) LIKE '%rs.%' OR lower(m.text) LIKE '%inr%' OR
      lower(m.text) LIKE '%debited%' OR lower(m.text) LIKE '%credited%' OR
      lower(m.text) LIKE '%₹%' OR lower(m.text) LIKE '%upi%' OR
      lower(m.text) LIKE '%spent%' OR lower(m.text) LIKE '%cashback%' OR
      lower(m.text) LIKE '%emi%' OR lower(m.text) LIKE '%refund%' OR
      lower(m.text) LIKE '%payment%'
    )`

    const query = lastRowId > 0
      ? `SELECT m.ROWID, m.text, m.date, h.id AS sender
         FROM message m
         JOIN handle h ON m.handle_id = h.ROWID
         WHERE m.ROWID > ${lastRowId}
           AND m.is_from_me = 0
           AND m.text IS NOT NULL
           AND length(m.text) > 10
           AND ${contentFilter}
         ORDER BY m.ROWID ASC
         LIMIT 500;`
      : `SELECT m.ROWID, m.text, m.date, h.id AS sender
         FROM message m
         JOIN handle h ON m.handle_id = h.ROWID
         WHERE m.is_from_me = 0
           AND m.text IS NOT NULL
           AND length(m.text) > 10
           AND ${contentFilter}
           AND m.date > ${lookbackNs}
         ORDER BY m.ROWID ASC
         LIMIT 2000;`

    const output = execSync(`sqlite3 -separator '|||' "${tmpDb}" "${query}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()

    if (!output) return []

    return output.split('\n').map(line => {
      const parts = line.split('|||')
      if (parts.length < 4) return null
      const [rowid, text, dateNs, sender] = parts

      // Convert Apple epoch nanoseconds → JS Date
      const appleEpochMs = new Date('2001-01-01T00:00:00Z').getTime()
      const dateMs = appleEpochMs + parseInt(dateNs) / 1000000
      const date = new Date(dateMs)

      return { rowid: parseInt(rowid), text: text.trim(), date, sender: sender.trim() }
    }).filter(Boolean)

  } finally {
    try { fs.unlinkSync(tmpDb) } catch {}
  }
}

// ── Send transaction to API ─────────────────────────────────────────────────
async function sendTransaction(message) {
  const { rowid, text, date, sender } = message

  try {
    const response = await fetch(`${API_BASE}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: `imsg-${rowid}`,
        sender,
        rawSms: text,
        date: date.toISOString(),
      }),
    })

    const data = await response.json()

    if (data.skipped) {
      return { status: 'skipped', rowid }
    }
    if (!response.ok) {
      return { status: 'rejected', rowid, reason: data.error }
    }
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

// ── Main polling loop ──────────────────────────────────────────────────────
async function poll(state) {
  const DEBUG = process.env.DEBUG === '1'

  let messages
  try {
    messages = queryMessages(state.lastRowId)
  } catch (err) {
    log(`❌ Could not read Messages DB: ${err.message}`, colors.red)
    return state
  }

  if (messages.length === 0) {
    log('No new messages', colors.dim)
    return state
  }

  log(`📩 Found ${messages.length} new message(s)`, colors.blue)

  // In debug mode, show sample financial messages found
  if (DEBUG) {
    console.log(`\n${colors.yellow}── DEBUG: Financial messages found ──${colors.reset}`)
    messages.slice(0, 5).forEach(m => {
      console.log(`  From: ${m.sender}`)
      console.log(`  Text: ${m.text.slice(0, 100)}`)
      console.log()
    })
  }

  let newLastRowId = state.lastRowId
  let created = 0, rejected = 0, skipped = 0

  for (const msg of messages) {
    newLastRowId = Math.max(newLastRowId, msg.rowid)

    // Content-based filter (already pre-filtered in SQL, this is a safety check)
    if (!isFinancialMessage(msg.sender, msg.text)) continue

    const result = await sendTransaction(msg)

    if (result.status === 'created') {
      created++
      log(`✅ Imported from ${msg.sender}`, colors.green)
      if (result.transaction) logTransaction(result.transaction)
    } else if (result.status === 'skipped') {
      skipped++
    } else if (result.status === 'rejected') {
      // Not a financial SMS — silently skip
    } else {
      log(`⚠️  Error for rowid ${result.rowid}: ${result.reason}`, colors.yellow)
    }
  }

  if (created > 0 || skipped > 0) {
    log(`📊 Summary: ${created} imported, ${skipped} already existed`, colors.cyan)
  }

  return { ...state, lastRowId: newLastRowId }
}

// ── Entry point ────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${colors.bold}${colors.blue}💸 Expense Tracker — SMS Watcher Agent${colors.reset}`)
  console.log(`${colors.dim}Polling iMessage every ${POLL_INTERVAL_MS / 1000}s | API: ${API_BASE}${colors.reset}\n`)

  // Check sqlite3 is available
  try {
    execSync('which sqlite3', { stdio: 'ignore' })
  } catch {
    console.error(`${colors.red}❌ sqlite3 is required but not found.${colors.reset}`)
    console.error('   Install Xcode Command Line Tools: xcode-select --install')
    process.exit(1)
  }

  // Check API is reachable
  try {
    const res = await fetch(`${API_BASE}/api/stats`)
    if (!res.ok) throw new Error('API not ready')
    log('✅ Connected to Next.js API', colors.green)
  } catch {
    log(`⚠️  API not reachable at ${API_BASE} — make sure "npm run dev" is running`, colors.yellow)
    log('   Continuing anyway, will retry on each poll...', colors.dim)
  }

  let state = loadState()
  if (SINCE_DATE) log(`📅 Scanning from date: ${SINCE_DATE}`, colors.blue)
  else log(`📅 Scanning last ${LOOKBACK_DAYS} days`, colors.blue)
  log(`📚 Starting from message ROWID: ${state.lastRowId || 'beginning'}`, colors.blue)

  // Initial poll
  state = await poll(state)
  saveState(state)

  // Recurring poll
  setInterval(async () => {
    state = await poll(state)
    saveState(state)
  }, POLL_INTERVAL_MS)

  log(`\n⏱️  Watching for new messages every ${POLL_INTERVAL_MS / 1000}s — press Ctrl+C to stop\n`, colors.cyan)
}

main().catch(err => {
  console.error(`${colors.red}Fatal error: ${err.message}${colors.reset}`)
  process.exit(1)
})
