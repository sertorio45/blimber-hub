import { defineEventHandler, setHeader } from 'h3'
import {
  buildAuthorizationServerMetadata,
  getMcpRequestOrigin,
  resolveMcpPublicBaseUrl,
} from '~/server/utils/blimber-mcp-oauth'

export default defineEventHandler((event) => {
  const baseUrl = resolveMcpPublicBaseUrl(getMcpRequestOrigin(event))
  setHeader(event, 'Content-Type', 'application/json')
  setHeader(event, 'Cache-Control', 'public, max-age=300')
  return buildAuthorizationServerMetadata(baseUrl)
})
