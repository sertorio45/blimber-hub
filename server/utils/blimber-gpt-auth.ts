/**
 * Shared auth gate for unified Blimber GPT Actions (`/api/gpt/*`).
 * Reuses the same secret as Meta GPT (BLIMBER_MCP_API_KEY).
 */

export {
  assertMetaGptApiKey as assertBlimberMcpApiKey,
  extractMetaGptApiKey as extractBlimberMcpApiKey,
  resolveMetaGptApiSecret as resolveBlimberMcpApiSecret,
} from '~/server/utils/meta-gpt-auth'
