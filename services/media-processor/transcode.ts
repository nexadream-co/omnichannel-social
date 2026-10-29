import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { editVideoArgs, ffprobeArgs, imageToJpegArgs, MAX_VIDEO_MS, parseProbe, posterArgs, videoToMp4Args, type ProcessRequest, type ProcessResult, type ProbeResult } from '../../server/core/media/ffmpeg-args'
import { SIGNATURE_HEADER, signBody } from '../../server/core/jobs/signing'

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg'
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe'
const DEFAULT_POSTER_MS = 1000 // past the black first frames most phone videos start with

function run(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d
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
        await run(FFMPEG, editVideoArgs(job.edit.spec, probe, input, overlay, file), 30 * 60_000)
      } else {
        await run(FFMPEG, isVideo ? videoToMp4Args(input, file, probe.hasAudio) : imageToJpegArgs(input, file), 30 * 60_000)
      }
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
