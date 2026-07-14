#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// iPhone Backup SMS Importer
// Reads sms.db directly from your iPhone backup and imports all financial
// transactions into the expense tracker — fills any gaps from Mac sync.
//
// Usage:
//   node agent/backup-importer.js
//
// Requirements:
//   • iPhone plugged in via USB and trusted on this Mac
//   • Backup completed via Finder (unencrypted)
//   • Terminal has Full Disk Access in System Settings > Privacy & Security
// ─────────────────────────────────────────────────────────────────────────────

const { execSync } = require('child_process')
const path = require('path')
const os = require('os')
const fs = require('fs')

const API_BASE = process.env.API_BASE || 'http://localhost:3000'
const BACKUP_ROOT = path.join(os.homedir(), 'Library', 'Application Support', 'MobileSync', 'Backup')

// In iPhone backups, files are stored with SHA1-hashed names.
// sms.db → HomeDomain-Library/SMS/sms.db → hash below
const SMS_DB_HASH = '3d0d7e5fb2ce288813306e4d4636395e047a3d28'
const SMS_DB_SUBPATH = path.join(SMS_DB_HASH.slice(0, 2), SMS_DB_HASH)

const colors = {
  reset: '\x1b[0m', green: '\x1b[32m', red: '\x1b[31m',
  yellow: '\x1b[33m', blue: '\x1b[34m', cyan: '\x1b[36m',
  dim: '\x1b[2m', bold: '\x1b[1m',
}
function log(msg, color = '') {
  const ts = new Date().toLocaleTimeString()
  console.log(`${colors.dim}[${ts}]${colors.reset} ${color}${msg}${colors.reset}`)
}

// ── Find most recent iPhone backup ─────────────────────────────────────────
function findLatestBackup() {
  if (!fs.existsSync(BACKUP_ROOT)) {
    throw new Error(`No backups found at ${BACKUP_ROOT}.\nMake sure you have backed up your iPhone via Finder.`)
  }

  const backups = fs.readdirSync(BACKUP_ROOT)
    .map(name => {
      const dir = path.join(BACKUP_ROOT, name)
      const infoFile = path.join(dir, 'Info.plist')
      const smsDb = path.join(dir, SMS_DB_SUBPATH)
      if (!fs.existsSync(smsDb)) return null
      const stat = fs.statSync(dir)
      return { dir, name, mtime: stat.mtime, smsDb }
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime)

  if (backups.length === 0) {
    throw new Error(
      'No iPhone backup with SMS data found.\n\n' +
      'Steps to create one:\n' +
      '  1. Connect iPhone to Mac via USB\n' +
      '  2. Tap "Trust" on iPhone if prompted\n' +
      '  3. Open Finder → click your iPhone in sidebar\n' +
      '  4. Click "Back Up Now" (make sure encryption is OFF)\n' +
      '  5. Wait for backup to complete, then run this script again'
    )
  }

  return backups[0]
}

// ── Financial content filter ────────────────────────────────────────────────
const FINANCIAL_CONTENT_PATTERNS = [
  /rs\.?\s*[\d,]+/i, /inr\s*[\d,]+/i, /₹\s*[\d,]+/,
  /debited/i, /credited/i, /\bupi\b/i,
  /spent.*(?:rs|inr|₹)/i, /(?:rs|inr|₹).*spent/i,
  /a\/c.*debited/i, /debited.*a\/c/i,
  /transaction.*(?:rs|inr|₹)/i, /payment.*(?:rs|inr|₹)/i,
  /(?:rs|inr|₹).*payment/i, /cashback/i, /refund.*(?:rs|inr|₹)/i,
  /balance.*(?:rs|inr|₹)/i, /emi.*(?:rs|inr|₹)/i,
]

function isFinancialText(text) {
  return FINANCIAL_CONTENT_PATTERNS.some(p => p.test(text))
}

// ── Query sms.db from backup ────────────────────────────────────────────────
function querySmsDb(smsDbPath) {
  const tmpDb = path.join(os.tmpdir(), `sms_backup_${Date.now()}.db`)
  fs.copyFileSync(smsDbPath, tmpDb)

  try {
    const contentFilter = `(
      lower(m.text) LIKE '%rs.%' OR lower(m.text) LIKE '%inr%' OR
      lower(m.text) LIKE '%debited%' OR lower(m.text) LIKE '%credited%' OR
      lower(m.text) LIKE '%₹%' OR lower(m.text) LIKE '%upi%' OR
      lower(m.text) LIKE '%spent%' OR lower(m.text) LIKE '%cashback%' OR
      lower(m.text) LIKE '%emi%' OR lower(m.text) LIKE '%refund%' OR
      lower(m.text) LIKE '%payment%'
    )`

    // m.text often contains embedded newlines (real SMS are multi-line), which
    // would otherwise split one logical row across several physical output
    // lines and corrupt the '|||'-delimited parsing below. Replace them with
    // a sentinel here and restore them after parsing.
    const NEWLINE_SENTINEL = '␤' // SYMBOL FOR NEWLINE — vanishingly unlikely in real SMS text
    const textExpr = `replace(m.text, char(10), '${NEWLINE_SENTINEL}')`

    const sql = `
      SELECT m.ROWID, ${textExpr}, m.date, h.id AS sender, m.service
      FROM message m
      LEFT JOIN handle h ON m.handle_id = h.ROWID
      WHERE m.is_from_me = 0
        AND m.text IS NOT NULL
        AND length(m.text) > 10
        AND ${contentFilter}
      ORDER BY m.date ASC;
    `

    const output = execSync(`sqlite3 -separator '|||' "${tmpDb}" "${sql}"`, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    }).trim()

    if (!output) return []

    const appleEpochMs = new Date('2001-01-01T00:00:00Z').getTime()

    return output.split('\n').map(line => {
      const parts = line.split('|||')
      if (parts.length < 4) return null
      const [rowid, text, dateRaw, sender, service] = parts

      const dateNum = parseInt(dateRaw)
      // iPhone sms.db may store as nanoseconds or seconds depending on iOS version
      // Nanoseconds: values > 1e15 ; Seconds: values < 1e12
      let dateMs
      if (dateNum > 1e15) {
        dateMs = appleEpochMs + dateNum / 1000000  // nanoseconds
      } else {
        dateMs = appleEpochMs + dateNum * 1000     // seconds
      }

      return {
        rowid: parseInt(rowid),
        text: text.replaceAll(NEWLINE_SENTINEL, '\n').trim(),
        date: new Date(dateMs),
        sender: (sender || 'unknown').trim(),
        source: 'backup',
      }
    }).filter(Boolean)

  } finally {
    try { fs.unlinkSync(tmpDb) } catch {}
  }
}

// ── Send to API ─────────────────────────────────────────────────────────────
async function sendTransaction(msg) {
  try {
    const res = await fetch(`${API_BASE}/api/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messageId: `backup-${msg.rowid}`,
        sender: msg.sender,
        rawSms: msg.text,
        date: msg.date.toISOString(),
      }),
    })
    const data = await res.json()
    if (data.skipped) return 'skipped'
    if (!res.ok) return 'rejected'
    return 'created'
  } catch {
    return 'error'
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${colors.bold}${colors.blue}📱 iPhone Backup SMS Importer${colors.reset}\n`)

  // Check sqlite3
  try { execSync('which sqlite3', { stdio: 'ignore' }) } catch {
    console.error(`${colors.red}❌ sqlite3 not found. Run: xcode-select --install${colors.reset}`)
    process.exit(1)
  }

  // Find backup
  let backup
  try {
    backup = findLatestBackup()
    log(`✅ Found backup: ${backup.name}`, colors.green)
    log(`   Last modified: ${backup.mtime.toLocaleString()}`, colors.dim)
    log(`   SMS DB: ${backup.smsDb}`, colors.dim)
  } catch (err) {
    console.error(`\n${colors.red}❌ ${err.message}${colors.reset}\n`)
    process.exit(1)
  }

  // Check API
  try {
    const res = await fetch(`${API_BASE}/api/stats`)
    if (!res.ok) throw new Error()
    log(`✅ Connected to API at ${API_BASE}`, colors.green)
  } catch {
    log(`❌ Cannot reach API at ${API_BASE} — make sure "npm run dev" is running`, colors.red)
    process.exit(1)
  }

  // Read SMS DB
  log(`\n📖 Reading SMS database from backup...`, colors.blue)
  let messages
  try {
    messages = querySmsDb(backup.smsDb)
  } catch (err) {
    console.error(`${colors.red}❌ Failed to read SMS DB: ${err.message}${colors.reset}`)
    console.error('→ Make sure Terminal has Full Disk Access in System Settings > Privacy & Security')
    process.exit(1)
  }

  log(`📩 Found ${messages.length} potential financial messages`, colors.blue)

  if (messages.length === 0) {
    log('No financial messages found in backup.', colors.yellow)
    process.exit(0)
  }

  // Import with progress
  let created = 0, skipped = 0, rejected = 0, errors = 0
  const total = messages.length
  const startTime = Date.now()

  console.log()
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (!isFinancialText(msg.text)) { rejected++; continue }

    const result = await sendTransaction(msg)
    if (result === 'created') {
      created++
      // Show every 50th or first few imports
      if (created <= 5 || created % 50 === 0) {
        log(`✅ [${created}] ${msg.date.toLocaleDateString()} | ${msg.sender} | ${msg.text.slice(0, 60)}...`, colors.green)
      }
    } else if (result === 'skipped') {
      skipped++
    } else if (result === 'rejected') {
      rejected++
    } else {
      errors++
    }

    // Progress every 100 messages
    if ((i + 1) % 100 === 0) {
      const pct = Math.round(((i + 1) / total) * 100)
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      process.stdout.write(`\r  Progress: ${i + 1}/${total} (${pct}%) — ${created} new, ${skipped} already existed — ${elapsed}s elapsed`)
    }
  }

  console.log('\n')
  log(`🎉 Import complete!`, colors.bold + colors.green)
  log(`   ✅ Imported:  ${created} new transactions`, colors.green)
  log(`   ⏭️  Skipped:   ${skipped} already existed`, colors.dim)
  log(`   ❌ Rejected:  ${rejected} (not financial / unparseable)`, colors.dim)
  if (errors > 0) log(`   ⚠️  Errors:    ${errors}`, colors.yellow)
  log(`\n   Open http://localhost:3000 to see your complete history!`, colors.cyan)
}

main().catch(err => {
  console.error(`\n${colors.red}Fatal: ${err.message}${colors.reset}`)
  process.exit(1)
})
