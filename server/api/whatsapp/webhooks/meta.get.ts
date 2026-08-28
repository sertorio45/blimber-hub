import process from 'node:process'

import { createError, getQuery } from 'h3'

export default defineEventHandler((event) => {
  const query = getQuery(event)

  if (query['hub.mode'] === 'subscribe' && query['hub.verify_token']) {
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN
    if (verifyToken && query['hub.verify_token'] === verifyToken)
      return query['hub.challenge']
    throw createError({ statusCode: 403, statusMessage: 'Invalid verify token' })
  }

  return { ok: true }
})
