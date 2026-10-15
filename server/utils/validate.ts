import type { H3Event } from 'h3'
import type { z } from 'zod'
import { appError } from '../core/errors'

/** First zod issue → 400 VALIDATION_FAILED { field } with its Bahasa message (docs/blueprint/12 §3). */
export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  const issue = result.error.issues[0]
  throw appError(400, issue?.message || 'Data tidak valid.', 'VALIDATION_FAILED', { field: issue?.path.join('.') || null })
}

export function assertJsonRequest(event: H3Event): void {
  const method = event.method
  if (method === 'GET' || method === 'HEAD' || method === 'DELETE') return
  const type = getRequestHeader(event, 'content-type') || ''
  if (!type.includes('application/json')) throw appError(415, 'Format permintaan tidak didukung.', 'VALIDATION_FAILED')
}

export async function readValidatedJson<S extends z.ZodType>(event: H3Event, schema: S): Promise<z.output<S>> {
  assertJsonRequest(event)
  return parseOrThrow(schema, await readBody(event).catch(() => undefined))
}

export function validatedQuery<S extends z.ZodType>(event: H3Event, schema: S): z.output<S> {
  return parseOrThrow(schema, getQuery(event))
}
