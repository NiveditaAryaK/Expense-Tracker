#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Expense Tracker — One-Shot Historical Backfill
// ─────────────────────────────────────────────────────────────────────────────
// Pulls past transactions out of macOS ~/Library/Messages/chat.db for a given
// date range and imports them, then exits. This is a pure date-range scan —
// unlike agent/sms-watcher.js it does NOT read or write the watcher's saved
// cursor (agent/.agent-state.json), so it can't disturb the daily watcher and
// is safe to re-run: the API de-dupes by message id, so already-imported
// transactions are just skipped.
//
// Use this the first time you set up the tracker (to pull in your existing
// SMS history), or any time you notice a gap — e.g. the watcher wasn't
// running for a while, or a parsing bug silently dropped some messages.
//
// Usage:
//   node agent/backfill.js                                    # all history
//   SINCE_DATE=2025-08-01 node agent/backfill.js                # from a date
//   SINCE_DATE=2025-08-01 UNTIL_DATE=2026-06-30 node agent/backfill.js
//
// Requirements: same as agent/sms-watcher.js (Full Disk Access, sqlite3, "npm run dev" running)
// ─────────────────────────────────────────────────────────────────────────────

const { execSync } = require('child_process')
const path = require('path')
const os = require('os')
const { isFinancialMessage, queryMessages, sendTransaction, colors, log } = require('./lib/messages-db')

const API_BASE = process.env.API_BASE || 'http://localhost:3000'
const MESSAGES_DB = process.env.MESSAGES_DB || path.join(os.homedir(), 'Library', 'Messages', 'chat.db')
const SINCE_DATE = process.env.SINCE_DATE || '2000-01-01' // effectively "all history" if unset
const UNTIL_DATE = process.env.UNTIL_DATE || null

async function main() {
  console.log(`\n${colors.bold}${colors.blue}📚 Expense Tracker — Historical Backfill${colors.reset}\n`)

  const sinceDate = new Date(SINCE_DATE)
  if (isNaN(sinceDate.getTime())) {
    console.error(`${colors.red}❌ Invalid SINCE_DATE: ${SINCE_DATE}. Use format YYYY-MM-DD${colors.reset}`)
    process.exit(1)
  }
  const untilDate = UNTIL_DATE ? new Date(UNTIL_DATE) : null
  if (untilDate && isNaN(untilDate.getTime())) {
    console.error(`${colors.red}❌ Invalid UNTIL_DATE: ${UNTIL_DATE}. Use format YYYY-MM-DD${colors.reset}`)
    process.exit(1)
  }

  log(`📅 Scanning ${sinceDate.toDateString()} → ${untilDate ? untilDate.toDateString() : 'now'}`, colors.blue)

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
    if (!res.ok) throw new Error()
    log(`✅ Connected to API at ${API_BASE}`, colors.green)
  } catch {
    console.error(`${colors.red}❌ Cannot reach API at ${API_BASE} — make sure "npm run dev" is running${colors.reset}`)
    process.exit(1)
  }

  let messages
  try {
    messages = queryMessages(MESSAGES_DB, { sinceDate, untilDate, limit: 100000 })
  } catch (err) {
    console.error(`${colors.red}❌ Could not read Messages DB: ${err.message}${colors.reset}`)
    process.exit(1)
  }

  log(`📩 Found ${messages.length} candidate message(s) in range`, colors.blue)

  if (messages.length === 0) {
    log('Nothing to backfill.', colors.dim)
    return
  }

  let created = 0, skipped = 0, rejected = 0, errors = 0
  const total = messages.length
  const startTime = Date.now()

  console.log()
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (!isFinancialMessage(msg.sender, msg.text)) { rejected++; continue }

    const result = await sendTransaction(API_BASE, msg)
    if (result.status === 'created') {
      created++
      if (created <= 5 || created % 50 === 0) {
        log(`✅ [${created}] ${msg.date.toLocaleDateString()} | ${msg.sender} | ${msg.text.slice(0, 60).replace(/\n/g, ' ')}...`, colors.green)
      }
    } else if (result.status === 'skipped') {
      skipped++
    } else if (result.status === 'rejected') {
      rejected++
    } else {
      errors++
    }

    if ((i + 1) % 100 === 0 || i + 1 === total) {
      const pct = Math.round(((i + 1) / total) * 100)
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      process.stdout.write(`\r  Progress: ${i + 1}/${total} (${pct}%) — ${created} new, ${skipped} already existed — ${elapsed}s elapsed`)
    }
  }

  console.log('\n')
  log(`🎉 Backfill complete!`, colors.bold + colors.green)
  log(`   ✅ Imported:  ${created} new transactions`, colors.green)
  log(`   ⏭️  Skipped:   ${skipped} already existed`, colors.dim)
  log(`   ❌ Rejected:  ${rejected} (not financial / unparseable)`, colors.dim)
  if (errors > 0) log(`   ⚠️  Errors:    ${errors}`, colors.yellow)
  log(`\n   Open http://localhost:3000 to see your history.`, colors.cyan)
}

main().catch(err => {
  console.error(`${colors.red}Fatal error: ${err.message}${colors.reset}`)
  process.exit(1)
})
