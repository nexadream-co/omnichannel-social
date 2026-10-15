import { handleAuthRequest } from '../../../core/services/auth'
import { runInRequestScope } from '../../../core/request-scope'

export default defineEventHandler(event =>
  runInRequestScope({ defer: work => event.waitUntil(work) }, () => handleAuthRequest('creator', toWebRequest(event))))
