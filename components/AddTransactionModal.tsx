'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { PenLine, MessageSquareText, ArrowDownCircle, ArrowUpCircle, ScanSearch } from 'lucide-react'
import { CATEGORIES, getCategoryMeta } from '@/lib/category-meta'

interface Props {
  onClose: () => void
  onAdded: () => void
}

export default function AddTransactionModal({ onClose, onAdded }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    amount: '',
    type: 'debit',
    merchant: '',
    category: 'Uncategorized',
    date: new Date().toISOString().split('T')[0],
  })

  const [smsForm, setSmsForm] = useState({
    sender: '',
    rawSms: '',
    date: new Date().toISOString().split('T')[0],
  })

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setError('Please enter a valid amount')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(form.amount),
          type: form.type,
          merchant: form.merchant || undefined,
          category: form.category,
          date: form.date,
          rawSms: '',
        }),
      })
      if (!res.ok) throw new Error('Failed')
      onAdded()
    } catch {
      setError('Failed to add transaction.')
    } finally {
      setLoading(false)
    }
  }

  const handleSmsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!smsForm.rawSms.trim()) { setError('Please paste an SMS message'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: smsForm.sender || 'MANUAL', rawSms: smsForm.rawSms, date: smsForm.date }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      onAdded()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to parse SMS')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Transaction</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="manual">
          <TabsList className="w-full">
            <TabsTrigger value="manual" className="flex-1 gap-1.5"><PenLine size={14} /> Manual Entry</TabsTrigger>
            <TabsTrigger value="sms" className="flex-1 gap-1.5"><MessageSquareText size={14} /> Paste SMS</TabsTrigger>
          </TabsList>

          {error && (
            <div className="mt-3 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg">
              {error}
            </div>
          )}

          <TabsContent value="manual">
            <form onSubmit={handleManualSubmit} className="space-y-4 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Amount (₹)</label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.amount}
                    onChange={e => setForm({ ...form, amount: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Type</label>
                  <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="debit">
                        <span className="flex items-center gap-2"><ArrowDownCircle size={14} className="text-status-critical" /> Debit</span>
                      </SelectItem>
                      <SelectItem value="credit">
                        <span className="flex items-center gap-2"><ArrowUpCircle size={14} className="text-status-good" /> Credit</span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Merchant / Description</label>
                <Input
                  placeholder="e.g. Swiggy, Amazon..."
                  value={form.merchant}
                  onChange={e => setForm({ ...form, merchant: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Category</label>
                  <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => {
                        const { icon: Icon, textClass } = getCategoryMeta(c)
                        return (
                          <SelectItem key={c} value={c}>
                            <span className="flex items-center gap-2">
                              <Icon size={14} className={textClass} /> {c}
                            </span>
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Date</label>
                  <Input
                    type="date"
                    value={form.date}
                    onChange={e => setForm({ ...form, date: e.target.value })}
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Adding...' : 'Add Transaction'}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="sms">
            <form onSubmit={handleSmsSubmit} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Sender <Badge variant="secondary" className="ml-1 text-xs">optional</Badge>
                </label>
                <Input
                  placeholder="e.g. HDFCBK, AD-ICICIB"
                  value={smsForm.sender}
                  onChange={e => setSmsForm({ ...smsForm, sender: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">SMS Message</label>
                <textarea
                  placeholder="Paste your bank SMS here...&#10;&#10;e.g. Rs.500 debited from A/c XX1234 at Amazon on 20-Feb-26."
                  rows={5}
                  value={smsForm.rawSms}
                  onChange={e => setSmsForm({ ...smsForm, rawSms: e.target.value })}
                  className="w-full border border-input bg-background rounded-md px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Date</label>
                <Input
                  type="date"
                  value={smsForm.date}
                  onChange={e => setSmsForm({ ...smsForm, date: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full gap-1.5" disabled={loading}>
                <ScanSearch size={14} /> {loading ? 'Parsing...' : 'Parse & Add'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
