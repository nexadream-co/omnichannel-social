import { contactSchema, submitContact } from '../core/public-site'

export default defineEventHandler(async (event) => {
  return submitContact(requestContext(event), await readValidatedJson(event, contactSchema))
})
