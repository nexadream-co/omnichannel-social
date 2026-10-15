import { getDb } from '../../../core/db/client'
import { getPublishedPage } from '../../../core/pages'

export default defineEventHandler(event => getPublishedPage(getDb(), getRouterParam(event, 'slug') ?? ''))
