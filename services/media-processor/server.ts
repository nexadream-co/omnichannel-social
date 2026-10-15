// Media processor: the one non-function component (docs/blueprint/19 §5).
// Downloads from a presigned GET, transcodes with ffmpeg, uploads to presigned PUTs, reports via a signed callback.
// It has no database access and no storage credentials; it only knows MEDIA_PROCESSOR_SECRET.
import { createServer } from 'node:http'
import { transcodeJob } from './transcode'
import { SIGNATURE_HEADER, verifySignature } from '../../server/core/jobs/signing'
import type { ProcessRequest } from '../../server/core/media/ffmpeg-args'

const SECRET = process.env.MEDIA_PROCESSOR_SECRET || ''
const PORT = Number(process.env.PORT || 3200)
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT || 1) // ffmpeg uses every core
let active = 0
const pending: ProcessRequest[] = []

if (!SECRET) {
  console.error(JSON.stringify({ level: 'error', msg: 'MEDIA_PROCESSOR_SECRET is required' }))
  process.exit(1)
}

function drain() {
  while (active < MAX_CONCURRENT && pending.length) {
    const job = pending.shift()!
    active++
    transcodeJob(job, SECRET).finally(() => {
      active--
      drain()
    })
  }
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, active, queued: pending.length }))
    return
  }
  if (req.method !== 'POST' || req.url !== '/process') {
    res.writeHead(404).end()
    return
  }
  const chunks: Buffer[] = []
  req.on('data', chunk => chunks.push(chunk))
  req.on('end', () => {
    const body = Buffer.concat(chunks).toString('utf8')
    if (!verifySignature(SECRET, body, req.headers[SIGNATURE_HEADER] as string | undefined)) {
      res.writeHead(404).end()
      return
    }
    let job: ProcessRequest
    try {
      job = JSON.parse(body) as ProcessRequest
    } catch {
      res.writeHead(400).end()
      return
    }
    pending.push(job)
    drain()
    res.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({ accepted: true }))
  })
})

server.listen(PORT, () => console.log(JSON.stringify({ level: 'info', msg: 'media-processor.listening', port: PORT })))
