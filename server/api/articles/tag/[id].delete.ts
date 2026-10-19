import { defineEventHandler } from 'h3'

import { articleTagHandlers } from '~/server/utils/articles/terms'

export default defineEventHandler(event => articleTagHandlers.remove(event))
