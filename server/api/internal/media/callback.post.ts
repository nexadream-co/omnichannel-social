import { env } from '../../../core/env'
import { SIGNATURE_HEADER, verifySignature } from '../../../core/jobs'
import type { ProcessResult } from '../../../core/media/ffmpeg-args'
import { applyMediaResult } from '../../../core/media/service'

/** Signed with MEDIA_PROCESSOR_SECRET (docs/blueprint/15 §2.1). A duplicate callback changes nothing. */
export default defineEventHandler(async (event) => {
  const body = (await readRawBody(event, 'utf8')) ?? ''
  if (!verifySignature(env().MEDIA_PROCESSOR_SECRET, body, getRequestHeader(event, SIGNATURE_HEADER))) throw createError({ statusCode: 404 })
  return applyMediaResult(requestContext(event), JSON.parse(body) as ProcessResult)
})
