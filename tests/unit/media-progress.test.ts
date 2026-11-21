import { describe, expect, it } from 'vitest'
import { jobPercent, parseProgressLine, PROGRESS_ARGS } from '../../server/core/media/ffmpeg-args'

describe('media conversion progress', () => {
  it('reads the written time from ffmpeg -progress lines', () => {
    expect(parseProgressLine('out_time_us=12500000')).toBe(12_500)
    expect(parseProgressLine('out_time_ms=3000000\r')).toBe(3000) // out_time_ms is microseconds too
    expect(parseProgressLine('out_time=00:00:12.500000')).toBeNull()
    expect(parseProgressLine('frame=120')).toBeNull()
    expect(parseProgressLine('out_time_us=N/A')).toBeNull()
  })

  it('maps the stages onto 5–95 and never reports 100', () => {
    expect(jobPercent('downloaded')).toBe(5)
    expect(jobPercent('converting', 0, 10_000)).toBe(5)
    expect(jobPercent('converting', 5000, 10_000)).toBe(48)
    expect(jobPercent('converting', 20_000, 10_000)).toBe(90)
    expect(jobPercent('converting', 5000, null)).toBe(5)
    expect(jobPercent('uploading')).toBe(95)
  })

  it('asks ffmpeg for machine-readable progress on stdout only', () => {
    expect(PROGRESS_ARGS).toEqual(['-progress', 'pipe:1', '-nostats'])
  })
})
