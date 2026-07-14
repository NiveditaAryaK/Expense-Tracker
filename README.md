# 💸 Expense Tracker

A full-stack Next.js expense tracker that automatically imports transactions from your iPhone's SMS/bank alerts via the macOS iMessage database.

## Stack

- **Frontend**: Next.js 14 (App Router) + shadcn/ui + Tailwind CSS + Recharts
- **Backend**: Next.js API Routes
- **Database**: SQLite via Prisma ORM
- **Agent**: Node.js background watcher (reads iMessage DB on Mac)

---

## Privacy — your data stays on your Mac

This is a single-tenant, local-first app. There is no shared server and no
account system — every person who runs this project owns their own copy of
everything:

- Your transactions live in **your own local SQLite file**, `prisma/dev.db`.
  It is never read or written by anyone but you, and it's git-ignored — it
  cannot be accidentally committed or pushed.
- The SMS agent reads `~/Library/Messages/chat.db` **on your Mac only** and
  posts to **your own** `localhost:3000` API. Nothing is ever sent anywhere
  else.
- `.env`, `agent/.agent-state.json` (the watcher's internal progress cursor),
  and `agent/logs/` (which can contain snippets of real transaction text) are
  all git-ignored too.

If you're contributing to this repo, `git status` before committing and make
sure none of the above ever show up staged.

---

## Quick Start

### 1. Install dependencies

```bash
cd expense-tracker
npm install
```

### 2. Create your `.env`

```bash
cp .env.example .env
```

### 3. Set up the database

```bash
npx prisma generate
npx prisma db push
```

### 4. Start the web app

```bash
npm run dev
# Open http://localhost:3000
```

### 5. Grant Full Disk Access (one-time, for the SMS agent)

The agent reads `~/Library/Messages/chat.db`. macOS requires explicit permission:

1. **System Settings → Privacy & Security → Full Disk Access**
2. Click **+** and add your **Terminal** app (or iTerm2, etc.)
3. Restart Terminal

> Without this you'll get a permissions error reading the Messages database.

### 6. Bring in your history, then keep it live

```bash
# One-time: pull in everything already in your Messages history
npm run backfill

# Then, whenever you want new transactions to keep flowing in:
npm run agent
```

See **Keeping it running automatically** below if you don't want to keep a
terminal window open for step 6.

---

## Two ways to import: backfill vs. the daily watcher

| | `npm run backfill` | `npm run agent` |
|---|---|---|
| **Purpose** | One-shot: pull in *past* history | Ongoing: catch *new* messages as they arrive |
| **Scope** | A date range you choose (default: all history) | Only messages newer than where it last left off |
| **State** | Stateless — ignores/doesn't touch the saved cursor | Saves its position in `agent/.agent-state.json` |
| **Safe to re-run?** | Yes — the API de-dupes by message id | Yes — that's its normal mode of operation |

Run backfill any time you notice a gap — e.g. you just installed the tracker,
or the watcher wasn't running for a while:

```bash
node agent/backfill.js                                       # everything
SINCE_DATE=2025-08-01 node agent/backfill.js                  # from a date
SINCE_DATE=2025-08-01 UNTIL_DATE=2026-06-30 node agent/backfill.js  # a range
```

### If backfill finds far fewer messages than you expect

`backfill.js` can only import what's actually in `~/Library/Messages/chat.db`
on this Mac. If your bank SMS mostly arrive on your phone and iPhone↔Mac
**Text Message Forwarding** is off (or broke silently — this happens), your
Mac's copy of Messages simply never received them, and there's nothing for
this script to find, regardless of date range.

1. Check it's on: iPhone **Settings → Messages → Text Message Forwarding** →
   this Mac should be toggled on. See [Apple's guide](https://support.apple.com/en-us/HT208050).
2. To recover a gap that already happened, import from an iPhone backup
   instead — your phone keeps its own copy independent of Mac forwarding:
   ```bash
   # 1. Connect iPhone via USB → Finder → your device → "Back Up Now" (encryption OFF)
   # 2. Then:
   node agent/backup-importer.js
   ```

---

## Keeping it running automatically (no terminal window needed)

By default, both `npm run dev` and `npm run agent` only run while their
terminal window is open. To have them run in the background permanently
(starting at login, restarting if they crash), install them as macOS
`launchd` services:

```bash
bash agent/launchd/install.sh
```

This installs two LaunchAgents:
- `com.expensetracker.server` — keeps `npm run dev` alive
- `com.expensetracker.watcher` — keeps the SMS watcher alive, polling every 30s

**Important:** launchd runs these as the `node`/`npm` binaries directly, not
inside Terminal — so granting Terminal Full Disk Access (step 5 above) does
**not** cover them. The install script prints the exact binary path; add
*that* to **System Settings → Privacy & Security → Full Disk Access** too.

Logs land in `agent/logs/` (git-ignored, since they can contain snippets of
real transaction text).

To stop everything:
```bash
bash agent/launchd/uninstall.sh
```

---

## Agent Configuration

Environment variables for both `agent/sms-watcher.js` and `agent/backfill.js`:

| Variable | Default | Description |
|---|---|---|
| `API_BASE` | `http://localhost:3000` | URL of the running Next.js app |
| `MESSAGES_DB` | `~/Library/Messages/chat.db` | Path to iMessage database |

`sms-watcher.js` only (the daily watcher):

| Variable | Default | Description |
|---|---|---|
| `POLL_INTERVAL` | `30000` | How often to check for new messages (ms) |
| `LOOKBACK_DAYS` | `3650` | Days to scan on its very first run (before it has a saved cursor) |
| `SINCE_DATE` | — | e.g. `2026-02-01` — scan from a specific date on first run instead of `LOOKBACK_DAYS` |
| `RESET` | — | Set to `1` to ignore the saved cursor and re-scan from scratch |

`backfill.js` only (one-shot historical import):

| Variable | Default | Description |
|---|---|---|
| `SINCE_DATE` | `2000-01-01` | Start of the date range to import |
| `UNTIL_DATE` | now | End of the date range to import |

---

## Supported SMS Formats

The parser handles all major Indian bank formats:

| Bank | Example |
|---|---|
| HDFC | `Rs.1,234 debited from A/c XX5678 at Swiggy on 20-Feb-26` |
| SBI | `Your A/c XX5644 debited with Rs 1234.00 on 20/02/26` |
| ICICI | `ICICI Bank Acct XX5644 debited Rs 1234 on 20-02-2026; Amazon` |
| Axis | `INR 1234.00 debited from Axis Bank A/c XX3456 on 20-02-2026` |
| UPI | `Rs.500 debited for UPI txn. VPA: merchant@upi` |
| Credit Card | `Rs 1,234 spent on your SBI Card ending 4423 at Zomato` |

---

## Manual SMS Import

If you want to add a transaction from an SMS without running the agent:

1. Open the app → click **Add** in the top right
2. Switch to the **Paste SMS** tab
3. Paste the bank SMS text and click **Parse & Add**

---

## Project Structure

```
expense-tracker/
├── app/
│   ├── api/
│   │   ├── transactions/route.ts   # CRUD for transactions
│   │   └── stats/route.ts          # Aggregated stats
│   ├── layout.tsx
│   ├── page.tsx                    # Main dashboard
│   └── globals.css
├── components/
│   ├── ui/                         # shadcn/ui primitives
│   ├── Sidebar.tsx                 # Nav + theme toggle
│   ├── ThemeToggle.tsx
│   ├── StatsCard.tsx
│   ├── SpendingChart.tsx
│   ├── CategoryBreakdown.tsx
│   ├── TransactionList.tsx
│   └── AddTransactionModal.tsx
├── lib/
│   ├── db.ts                       # Prisma client
│   ├── parser.ts                   # SMS parsing engine
│   ├── category-meta.ts            # Category → icon/color mapping
│   └── utils.ts                    # cn() utility
├── agent/
│   ├── lib/
│   │   └── messages-db.js          # Shared chat.db reading + filtering logic
│   ├── sms-watcher.js              # Daily/ongoing background watcher
│   ├── backfill.js                 # One-shot historical import (by date range)
│   ├── backup-importer.js          # One-shot import from an iPhone backup
│   ├── diagnose.js                 # iMessage DB diagnostic tool
│   └── launchd/
│       ├── install.sh              # Installs both LaunchAgents
│       └── uninstall.sh
├── prisma/
│   └── schema.prisma
├── .env.example
└── .env
```

---

## Troubleshooting

**"Cannot read Messages DB" error**
→ Grant Terminal (or, for launchd, the `node` binary — see above) Full Disk Access.

**"API not reachable" warning**
→ Make sure `npm run dev` is running before starting the agent.

**New transactions stopped appearing / a whole date range is missing**
→ This is almost always Text Message Forwarding being off between your
iPhone and Mac — see "If backfill finds far fewer messages than you expect"
above. It can silently turn off (e.g. after an iPhone reset or Apple ID
re-sign-in) without any error; the watcher just quietly has nothing new to
find.

**Transactions not being detected at all**
→ Check that your bank sends SMS to your iPhone (not just app notifications).
→ Try the "Paste SMS" manual import to test parsing.

**Build errors**
→ Make sure you ran `npx prisma generate` before `npm run build`.
