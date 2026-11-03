import { createError, readBody } from 'h3'

import { requireStaffUser } from '~/server/utils/admin-auth'
import { createBlimberServiceRoleClient } from '~/server/utils/blimber-service-client'

export default defineEventHandler(async (event) => {
  await requireStaffUser(event)

  try {
    const supabase = createBlimberServiceRoleClient()
    if (!supabase)
      throw createError({ statusCode: 500, statusMessage: 'Supabase service role não configurado' })

    const id = event.context.params?.id
    if (!id)
      throw createError({ statusCode: 400, statusMessage: 'ID do usuário não fornecido' })

    const body = await readBody(event)

    if (body.password && body.password.trim() !== '') {
      const { error: passwordError } = await supabase.auth.admin.updateUserById(id, { password: body.password })
      if (passwordError)
        throw createError({ statusCode: 400, statusMessage: passwordError.message })
    }

    if (body.email) {
      const { error: emailError } = await supabase.auth.admin.updateUserById(id, {
        email: body.email,
        email_confirm: true,
      })
      if (emailError)
        throw createError({ statusCode: 400, statusMessage: emailError.message })
    }

    return {
      success: true,
      message: 'Usuário atualizado com sucesso',
    }
  }
  catch (error: any) {
    if (error?.statusCode)
      throw error

    return {
      success: false,
      error: error.message || 'Erro ao atualizar usuário',
    }
  }
})
