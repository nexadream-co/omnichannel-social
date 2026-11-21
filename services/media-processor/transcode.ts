import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { editedDurationMs } from '../../shared/media/edit-spec'
import { editVideoArgs, ffprobeArgs, imageToJpegArgs, jobPercent, MAX_VIDEO_MS, parseProbe, parseProgressLine, posterArgs, PROGRESS_ARGS, videoToMp4Args, type ProcessRequest, type ProcessResult, type ProbeResult } from '../../server/core/media/ffmpeg-args'
import { SIGNATURE_HEADER, signBody } from '../../server/core/jobs/signing'

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe'
const DEFAULT_POSTER_MS = 1000 // past the black first frames most phone videos start with

/** `onLine` gets stdout line by line (ffmpeg `-progress pipe:1`) instead of collecting it. */
function run(command: string, args: string[], timeoutMs: number, onLine?: (line: string) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let partial = ''
    child.stdout.on('data', (d) => {
      if (!onLine) {
        stdout += d
        return
      }
      const lines = (partial + d).split('\n')
      partial = lines.pop() ?? ''
      for (const line of lines) onLine(line)
    })
    child.stderr.on('data', (d) => {
      stderr = (stderr + d).slice(-4000)
    })
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else reject(new Error(`${command} exited ${code}: ${stderr.trim().split('\n').pop()}`))
    })
    child.on('error', reject)
  })
}

async function download(url: string, path: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10 * 60_000) })
  if (!response.ok || !response.body) throw new Error(`download failed (${response.status})`)
  await pipeline(Readable.fromWeb(response.body as never), createWriteStream(path))
}

async function upload(url: string, headers: Record<string, string>, path: string, contentType: string) {
  const body = await readFile(path)
  const response = await fetch(url, { method: 'PUT', body, headers: { ...headers, 'content-type': contentType }, signal: AbortSignal.timeout(10 * 60_000) })
  if (!response.ok) throw new Error(`upload failed (${response.status})`)
  return body.length
}

async function callback(job: ProcessRequest, result: ProcessResult, secret: string) {
  const body = JSON.stringify(result)
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch(job.callbackUrl, { method: 'POST', headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: signBody(secret, body) }, body, signal: AbortSignal.timeout(15_000) })
      if (response.ok) return
    } catch {
      // retry below
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 2000))
  }
  console.error(JSON.stringify({ level: 'error', msg: 'media-processor.callback_failed', assetId: job.assetId }))
}

/**
 * Progress nudges for the creator's "Memproses 42%": one try each, never retried or awaited in order, at most every
 * 2 s and only when the number moved. The server keeps only forward moves, so a lost or late nudge is harmless.
 */
function progressReporter(job: ProcessRequest, secret: string) {
  let last = -1
  let lastAt = 0
  return (percent: number, force = false) => {
    const now = Date.now()
    if (percent <= last || (!force && (now - lastAt < 2000 || percent - last < 2))) return
    last = percent
    lastAt = now
    const body = JSON.stringify({ assetId: job.assetId, ref: job.ref, status: 'progress', progress: percent } satisfies ProcessResult)
    fetch(job.callbackUrl, { method: 'POST', headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: signBody(secret, body) }, body, signal: AbortSignal.timeout(5_000) })
      .catch(() => undefined)
  }
}

export async function transcodeJob(job: ProcessRequest, secret: string): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'socialz-media-'))
  const input = join(dir, 'source')
  const log = (msg: string, extra: object = {}) => console.log(JSON.stringify({ level: 'info', msg, assetId: job.assetId, ...extra }))
  try {
    await download(job.sourceUrl, input)
    let probe: ProbeResult
    try {
      probe = parseProbe(await run(FFPROBE, ffprobeArgs(input), 60_000))
    } catch {
      await callback(job, { assetId: job.assetId, ref: job.ref, status: 'failed', error: { code: 'unreadable', message: 'File could not be read' } }, secret)
      return
    }
    if (probe.kind === 'video' && (probe.durationMs ?? 0) > MAX_VIDEO_MS) {
      await callback(job, { assetId: job.assetId, ref: job.ref, status: 'failed', probe, error: { code: 'too_long', message: 'Video is too long' } }, secret)
      return
    }
    const outputs: NonNullable<ProcessResult['outputs']> = []
    const isVideo = probe.kind === 'video'
    // Images take a second or two: only videos report progress.
    const report = isVideo ? progressReporter(job, secret) : () => undefined
    report(jobPercent('downloaded'), true)
    const expectedMs = probe.durationMs ? (job.edit ? editedDurationMs(job.edit.spec, probe.durationMs) : probe.durationMs) : null
    const onProgress = (line: string) => {
      const doneMs = parseProgressLine(line)
      if (doneMs !== null) report(jobPercent('converting', doneMs, expectedMs))
    }
    const main = join(dir, isVideo ? 'out.mp4' : 'out.jpg')
    let overlay: string | null = null
    if (job.edit?.overlayUrl) {
      overlay = join(dir, 'overlay.png')
      await download(job.edit.overlayUrl, overlay)
    }
    for (const output of job.outputs) {
      // `poster` is a still of the finished main output (edited videos only), so main always comes first.
      const poster = output.variant === 'poster'
      const file = poster ? join(dir, 'poster.jpg') : main
      if (poster) {
        await run(FFMPEG, posterArgs(main, job.edit?.spec.coverMs ?? DEFAULT_POSTER_MS, outputs[0]?.durationMs ?? null, file), 5 * 60_000)
      } else if (isVideo && job.edit) {
        await run(FFMPEG, [...PROGRESS_ARGS, ...editVideoArgs(job.edit.spec, probe, input, overlay, file)], 30 * 60_000, onProgress)
      } else if (isVideo) {
        await run(FFMPEG, [...PROGRESS_ARGS, ...videoToMp4Args(input, file, probe.hasAudio)], 30 * 60_000, onProgress)
      } else {
        await run(FFMPEG, imageToJpegArgs(input, file), 30 * 60_000)
      }
      if (!poster) report(jobPercent('uploading'), true)
      const result = parseProbe(await run(FFPROBE, ffprobeArgs(file), 60_000))
      const bytes = await upload(output.putUrl, output.putHeaders ?? {}, file, output.contentType)
      outputs.push({ variant: output.variant, bytes: bytes || (await stat(file)).size, width: result.width, height: result.height, durationMs: poster ? null : result.durationMs, codec: result.codec })
    }
    log('media-processor.done', { kind: probe.kind })
    await callback(job, { assetId: job.assetId, ref: job.ref, status: 'done', probe, outputs }, secret)
  } catch (error) {
    log('media-processor.failed', { error: (error as Error).message })
    await callback(job, { assetId: job.assetId, ref: job.ref, status: 'failed', error: { code: 'failed', message: (error as Error).message.slice(0, 300) } }, secret)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
