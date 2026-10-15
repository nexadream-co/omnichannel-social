import type { ProcessRequest } from '../../media/ffmpeg-args'

export interface MediaProcessor {
  readonly name: string
  submit(job: ProcessRequest): Promise<void>
  status(ref: string): Promise<'unknown' | 'working' | 'done' | 'failed'>
}
