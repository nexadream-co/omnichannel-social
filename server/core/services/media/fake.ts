import type { ProcessRequest } from '../../media/ffmpeg-args'
import type { MediaProcessor } from './types'

/** Tests: records submissions; the test then calls applyMediaResult itself. */
export function fakeMediaProcessor(submitted: ProcessRequest[] = []): MediaProcessor & { submitted: ProcessRequest[] } {
  return {
    name: 'fake',
    submitted,
    async submit(job) {
      submitted.push(job)
    },
    async status() {
      return 'unknown'
    }
  }
}
