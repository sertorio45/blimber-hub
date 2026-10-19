import { defineEventHandler } from 'h3'

import { articleCategoryHandlers } from '~/server/utils/articles/terms'

export default defineEventHandler(event => articleCategoryHandlers.create(event))
