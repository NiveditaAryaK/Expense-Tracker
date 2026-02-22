#!/usr/bin/env node
// Run: node agent/diagnose.js
// Diagnoses the iMessage DB to check date format, message count, and senders

const { execSync } = require('child_process')
const path = require('path')
const os = require('os')
const fs = require('fs')

const MESSAGES_DB = path.join(os.homedir(), 'Library', 'Messages', 'chat.db')
const tmpDb = path.join(os.tmpdir(), `chat_diag_${Date.now()}.db`)

console.log('\n💬 iMessage DB Diagnostic\n')

try {
  fs.copyFileSync(MESSAGES_DB, tmpDb)
  console.log('✅ DB copy succeeded\n')
} catch (e) {
  console.error('❌ Cannot copy DB:', e.message)
  console.error('→ Make sure Terminal has Full Disk Access in System Settings > Privacy & Security')
  process.exit(1)
}

function query(sql) {
  return execSync(`sqlite3 -separator "|||" "${tmpDb}" "${sql}"`, { encoding: 'utf-8' }).trim()
}

// 1. Total message count
const total = query('SELECT COUNT(*) FROM message WHERE text IS NOT NULL AND length(text) > 5;')
console.log(`📊 Total messages in DB: ${total}`)

// 2. Sample raw date values (to detect format)
const sampleDates = query('SELECT date FROM message WHERE text IS NOT NULL LIMIT 5;')
console.log('\n📅 Sample raw date values (first 5):')
sampleDates.split('\n').forEach(d => {
  const n = parseInt(d)
  // Try Apple epoch (nanoseconds since 2001-01-01)
  const appleEpochMs = new Date('2001-01-01T00:00:00Z').getTime()
  const asDateNs = new Date(appleEpochMs + n / 1000000)
  // Try Apple epoch (seconds since 2001-01-01 — older macOS)
  const asDateSec = new Date(appleEpochMs + n * 1000)
  console.log(`  raw: ${d}`)
  console.log(`    → as nanoseconds: ${asDateNs.toLocaleString()}`)
  console.log(`    → as seconds:     ${asDateSec.toLocaleString()}`)
})

// 3. Messages since Feb 1 — try both date formats
const appleEpochMs = new Date('2001-01-01T00:00:00Z').getTime()
const feb1Ms = new Date('2026-02-01').getTime()
const feb1Ns = (feb1Ms - appleEpochMs) * 1000000   // nanoseconds format
const feb1Sec = (feb1Ms - appleEpochMs) / 1000      // seconds format

const countNs = query(`SELECT COUNT(*) FROM message WHERE text IS NOT NULL AND date > ${feb1Ns};`)
const countSec = query(`SELECT COUNT(*) FROM message WHERE text IS NOT NULL AND date > ${feb1Sec};`)
console.log(`\n🗓️  Messages after Feb 1, 2026 (nanoseconds format): ${countNs}`)
console.log(`🗓️  Messages after Feb 1, 2026 (seconds format):     ${countSec}`)

// 4. All unique SMS senders (not iMessage — SMS senders are phone numbers or alphanumeric IDs)
console.log('\n📱 All unique senders in DB (showing up to 60):')
const senders = query(`
  SELECT DISTINCT h.id
  FROM message m
  JOIN handle h ON m.handle_id = h.ROWID
  WHERE m.text IS NOT NULL
  ORDER BY h.id
  LIMIT 60;
`)
const senderList = senders.split('\n').filter(Boolean)
senderList.forEach(s => {
  // Guess if it looks like a bank/financial sender
  const isFinancial = /hdfc|sbi|icici|axis|kotak|bank|upi|pay|credit|debit|card|jd-|vm-|ad-|bp-|vk-|amex|citi|rbl|idfc/i.test(s)
  console.log(`  ${isFinancial ? '💰' : '  '} ${s}`)
})

// 5. Sample messages with financial keywords
console.log('\n💬 Sample messages containing financial keywords (last 10):')
const feb1ForQuery = countNs > 0 ? feb1Ns : feb1Sec
const samples = query(`
  SELECT h.id, substr(m.text, 1, 120)
  FROM message m
  JOIN handle h ON m.handle_id = h.ROWID
  WHERE m.text IS NOT NULL
    AND (
      lower(m.text) LIKE '%rs.%' OR lower(m.text) LIKE '%inr%' OR
      lower(m.text) LIKE '%debited%' OR lower(m.text) LIKE '%credited%' OR
      lower(m.text) LIKE '%upi%' OR lower(m.text) LIKE '%spent%'
    )
  ORDER BY m.ROWID DESC
  LIMIT 10;
`)
if (!samples) {
  console.log('  (none found — your bank SMS may use different keywords)')
} else {
  samples.split('\n').forEach(line => {
    const [sender, text] = line.split('|||')
    console.log(`\n  From: ${sender}`)
    console.log(`  Text: ${text}`)
  })
}

// Cleanup
try { fs.unlinkSync(tmpDb) } catch {}
console.log('\n✅ Diagnostic complete\n')
