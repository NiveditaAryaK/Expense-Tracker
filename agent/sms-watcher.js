#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Expense Tracker — Background SMS Watcher Agent
// ─────────────────────────────────────────────────────────────────────────────
// Continuously watches macOS ~/Library/Messages/chat.db (SQLite) for NEW
// messages (tracked via a saved ROWID cursor) and imports financial ones.
//
// This only ever moves forward from wherever it last left off — it will not
// fill in a gap in the past (e.g. if it wasn't running for a while, or its
// cursor already moved past older messages). For that, use the one-shot
// `agent/backfill.js` instead, which scans by date range regardless of cursor.
//
// Requirements:
//   • macOS with Messages app enabled
//   • Full Disk Access granted to Terminal in System Settings > Privacy & Security
//   • Node.js 18+  |  Run: npm run agent
// ─────────────────────────────────────────────────────────────────────────────

const { execSync } = require('child_process')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { isFinancialMessage, queryMessages, sendTransaction, colors, log, logTransaction } = require('./lib/messages-db')

// ── Config ─────────────────────────────────────────────────────────────────
const API_BASE = process.env.API_BASE || 'http://localhost:3000'
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL || '30000') // 30 seconds
const MESSAGES_DB = process.env.MESSAGES_DB || path.join(os.homedir(), 'Library', 'Messages', 'chat.db')
const LOOKBACK_DAYS = parseInt(process.env.LOOKBACK_DAYS || '3650') // how many days back to scan on first run (default: ~10 years = all history)
const SINCE_DATE = process.env.SINCE_DATE || null  // e.g. "2026-02-01" to scan from a specific date on first run
const RESET = process.env.RESET === '1'            // set RESET=1 to ignore saved state and re-scan
const STATE_FILE = path.join(__dirname, '.agent-state.json')

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

// ── Main polling loop ──────────────────────────────────────────────────────
async function poll(state) {
  const DEBUG = process.env.DEBUG === '1'

  let messages
  try {
    if (state.lastRowId > 0) {
      messages = queryMessages(MESSAGES_DB, { afterRowId: state.lastRowId, limit: 500 })
    } else {
      const sinceDate = SINCE_DATE ? new Date(SINCE_DATE) : new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000)
      if (isNaN(sinceDate.getTime())) throw new Error(`Invalid SINCE_DATE: ${SINCE_DATE}. Use format YYYY-MM-DD`)
      messages = queryMessages(MESSAGES_DB, { sinceDate, limit: 2000 })
    }
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
  let created = 0, skipped = 0

  for (const msg of messages) {
    // Content-based filter (already pre-filtered in SQL, this is a safety check).
    // Not financial — fully handled (nothing to send), safe to move the cursor past it.
    if (!isFinancialMessage(msg.sender, msg.text)) {
      newLastRowId = Math.max(newLastRowId, msg.rowid)
      continue
    }

    const result = await sendTransaction(API_BASE, msg)

    if (result.status === 'created') {
      created++
      newLastRowId = Math.max(newLastRowId, msg.rowid)
      log(`✅ Imported from ${msg.sender}`, colors.green)
      if (result.transaction) logTransaction(result.transaction)
    } else if (result.status === 'skipped') {
      skipped++
      newLastRowId = Math.max(newLastRowId, msg.rowid)
    } else if (result.status === 'rejected') {
      // Not a financial SMS after all (per the API's stricter parser) — fully handled.
      newLastRowId = Math.max(newLastRowId, msg.rowid)
    } else {
      // Transient error (e.g. API unreachable). Don't advance the cursor past this
      // message, or a blip would permanently drop it — stop here and retry the
      // whole remaining batch (including this message) on the next poll.
      log(`⚠️  Error for rowid ${result.rowid}: ${result.reason} — will retry next poll`, colors.yellow)
      break
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
  if (state.lastRowId > 0) {
    log(`📚 Resuming from message ROWID: ${state.lastRowId}`, colors.blue)
  } else if (SINCE_DATE) {
    log(`📅 First run — scanning from date: ${SINCE_DATE}`, colors.blue)
  } else {
    log(`📅 First run — scanning last ${LOOKBACK_DAYS} days`, colors.blue)
  }

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
