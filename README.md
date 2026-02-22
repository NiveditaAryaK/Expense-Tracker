# 💸 Expense Tracker

A full-stack Next.js expense tracker that automatically imports transactions from your iPhone's SMS/bank alerts via the macOS iMessage database.

## Stack

- **Frontend**: Next.js 14 (App Router) + shadcn/ui + Tailwind CSS + Recharts
- **Backend**: Next.js API Routes
- **Database**: SQLite via Prisma ORM
- **Agent**: Node.js background watcher (reads iMessage DB on Mac)

---

## Quick Start

### 1. Install dependencies

```bash
cd expense-tracker
npm install
```

### 2. Create your `.env`

Copy the example file and update the database path if needed:

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

### 5. Run the SMS agent (separate terminal)

```bash
npm run agent
```

The agent will scan your last 90 days of iMessages, pick out bank/UPI alerts, and import them automatically.

---

## First-Time: Grant Full Disk Access to Terminal

The agent reads `~/Library/Messages/chat.db`. macOS requires explicit permission:

1. Open **System Settings** → **Privacy & Security** → **Full Disk Access**
2. Click **+** and add your **Terminal** app (or iTerm2, etc.)
3. Restart Terminal and run the agent again

> Without this, you'll get a permissions error reading the Messages database.

---

## Agent Configuration

Set environment variables before running the agent:

| Variable | Default | Description |
|---|---|---|
| `API_BASE` | `http://localhost:3000` | URL of the running Next.js app |
| `POLL_INTERVAL` | `30000` | How often to check for new messages (ms) |
| `LOOKBACK_DAYS` | `90` | Days to scan on first run |
| `MESSAGES_DB` | `~/Library/Messages/chat.db` | Path to iMessage database |

Example:
```bash
LOOKBACK_DAYS=180 POLL_INTERVAL=15000 npm run agent
```

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
2. Switch to the **📱 Paste SMS** tab
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
│   ├── StatsCard.tsx
│   ├── SpendingChart.tsx
│   ├── CategoryBreakdown.tsx
│   ├── TransactionList.tsx
│   └── AddTransactionModal.tsx
├── lib/
│   ├── db.ts                       # Prisma client
│   ├── parser.ts                   # SMS parsing engine
│   └── utils.ts                    # cn() utility
├── agent/
│   └── sms-watcher.js              # Background Mac agent
├── prisma/
│   └── schema.prisma
├── .env.example
└── .env
```

---

## Troubleshooting

**"Cannot read Messages DB" error**
→ Grant Terminal Full Disk Access (see above)

**"API not reachable" warning**
→ Make sure `npm run dev` is running before starting the agent

**Transactions not being detected**
→ Check that your bank sends SMS to your iPhone (not just app notifications)
→ Try the "Paste SMS" manual import to test parsing

**Build errors**
→ Make sure you ran `npx prisma generate` before `npm run build`
