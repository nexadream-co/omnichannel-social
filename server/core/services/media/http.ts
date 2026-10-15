import type { ProcessRequest } from '../../media/ffmpeg-args'
import { SIGNATURE_HEADER, signBody } from '../../jobs/signing'
import type { MediaProcessor } from './types'

/** The container from services/media-processor, reached over signed HTTPS (docs/blueprint/19 §5). */
export function httpMediaProcessor(baseUrl: string, secret: string, fetchImpl: typeof fetch = fetch): MediaProcessor {
  return {
    name: 'http',
    async submit(job: ProcessRequest) {
      const body = JSON.stringify(job)
      const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}/process`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [SIGNATURE_HEADER]: signBody(secret, body) },
        body,
        signal: AbortSignal.timeout(15_000)
      })
      if (response.status !== 202) throw new Error(`Media processor refused the job (${response.status})`)
    },
    async status() {
      // The callback is the source of truth; the watchdog resubmits when it never arrives.
      return 'unknown'
    }
  }
}
