/**
 * Local stand-in for the Nexadream Payment Hub (dev only, never deployed). Implements the three platform
 * endpoints the driver calls, plus a hosted "payment page" that settles or fails a charge, fires the
 * gateway-style callback at the app, and redirects back like the real hub.
 *
 *   npx tsx scripts/mock-payment-hub.ts      → http://localhost:3300
 *   /admin/payment-gateways: base URL http://localhost:3300, any key, prefix DEV
 */
import { createServer, type IncomingMessage } from 'node:http'

const PORT = Number(process.env.MOCK_HUB_PORT ?? 3300)
const PREFIX = process.env.MOCK_HUB_PREFIX ?? 'DEV'
const APP = process.env.MOCK_HUB_APP_URL ?? 'http://localhost:3000'

interface Tx { reference: string, orderId: string, amount: number, status: string, finishUrl: string | null, item: string, settlementTime: string | null, paymentType: string | null }
const txs = new Map<string, Tx>()

const body = (req: IncomingMessage) => new Promise<string>((resolve) => {
  let data = ''
  req.on('data', chunk => (data += chunk))
  req.on('end', () => resolve(data))
})
const view = (tx: Tx) => ({ orderId: tx.orderId, reference: tx.reference, status: tx.status, gatewayStatus: tx.status === 'paid' ? 'settlement' : tx.status === 'failed' ? 'deny' : tx.status, amount: tx.amount, currency: 'IDR', paymentType: tx.paymentType, settlementTime: tx.settlementTime, source: 'gateway' })
const idr = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  const json = (status: number, payload: unknown) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(payload))
  }
  const api = /^\/api\/hub\/v1\/transactions(?:\/([^/]+))?(\/cancel)?$/.exec(url.pathname)
  if (api) {
    if (!req.headers.authorization?.startsWith('Bearer ')) return json(401, { statusMessage: 'missing key' })
    const ref = api[1] ? decodeURIComponent(api[1]).replace(new RegExp(`^${PREFIX}-`), '') : null
    if (req.method === 'POST' && !ref) {
      const input = JSON.parse(await body(req)) as { reference: string, amount: number, finishUrl?: string, items?: { name: string }[] }
      const existing = txs.get(input.reference)
      if (existing && existing.status === 'pending') return json(200, { ...view(existing), redirectUrl: `http://localhost:${PORT}/pay/${existing.reference}`, reused: true })
      if (existing) return json(409, { statusMessage: 'reference already used' })
      const tx: Tx = { reference: input.reference, orderId: `${PREFIX}-${input.reference}`, amount: input.amount, status: 'pending', finishUrl: input.finishUrl ?? null, item: input.items?.[0]?.name ?? 'Pembayaran', settlementTime: null, paymentType: null }
      txs.set(tx.reference, tx)
      return json(200, { ...view(tx), redirectUrl: `http://localhost:${PORT}/pay/${tx.reference}`, token: null, clientKey: null, reused: false })
    }
    const tx = ref ? txs.get(ref) : null
    if (!tx) return json(404, { statusMessage: 'not found' })
    if (req.method === 'GET') return json(200, view(tx))
    if (req.method === 'POST' && api[2]) {
      if (tx.status === 'cancelled') return json(200, { ...view(tx), alreadyCancelled: true })
      if (tx.status !== 'pending' && tx.status !== 'challenge') return json(409, { statusMessage: 'settled' })
      tx.status = 'cancelled'
      return json(200, { ...view(tx), alreadyCancelled: false })
    }
  }

  const pay = /^\/pay\/([^/]+)(?:\/(paid|failed))?$/.exec(url.pathname)
  if (pay) {
    const tx = txs.get(decodeURIComponent(pay[1]!))
    if (!tx) {
      res.writeHead(404)
      return res.end('Unknown payment')
    }
    if (req.method === 'POST' && pay[2]) {
      tx.status = pay[2]
      tx.paymentType = 'qris'
      tx.settlementTime = pay[2] === 'paid' ? new Date().toISOString() : null
      // The gateway's raw callback, unsigned for us (the hub keeps the key).
      await fetch(`${APP}/api/webhooks/payments/nexadream_hub`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order_id: tx.orderId, transaction_status: pay[2] === 'paid' ? 'settlement' : 'deny', transaction_id: `mock-${Date.now()}`, gross_amount: String(tx.amount), payment_type: 'qris' })
      }).catch(error => console.error('callback failed', error))
      const back = new URL(tx.finishUrl ?? `${APP}/app/billing`)
      back.searchParams.set('reference', tx.reference)
      back.searchParams.set('result', pay[2] === 'paid' ? 'finish' : 'error')
      res.writeHead(303, { location: back.toString() })
      return res.end()
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    return res.end(`<!doctype html><meta name="viewport" content="width=device-width"><title>Mock Payment Hub</title>
<body style="font-family:system-ui;max-width:420px;margin:40px auto;padding:0 16px">
<p style="color:#888;font-size:13px">MOCK PAYMENT HUB · dev only</p><h1 style="font-size:20px">${tx.item}</h1>
<p style="font-size:28px;font-weight:700">${idr(tx.amount)}</p><p>Status: <b>${tx.status}</b></p>
<form method="post" action="/pay/${tx.reference}/paid"><button style="width:100%;padding:12px;font-size:16px;background:#16a34a;color:#fff;border:0;border-radius:8px">Bayar (berhasil)</button></form><br>
<form method="post" action="/pay/${tx.reference}/failed"><button style="width:100%;padding:12px;font-size:16px;background:#fff;border:1px solid #ccc;border-radius:8px">Gagal</button></form></body>`)
  }
  json(404, { statusMessage: 'not found' })
}).listen(PORT, () => console.log(`mock payment hub on http://localhost:${PORT} (prefix ${PREFIX})`))
