import type { Database } from '../../../core/db/client'
import { getDb } from '../../../core/db/client'
import { dataDeletionStatus } from '../../../core/meta-callbacks'

export default defineEventHandler(event => dataDeletionStatus(getDb() as Database, getRouterParam(event, 'code') ?? ''))
