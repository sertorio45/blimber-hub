/** WhatsApp Cloud API (Meta oficial) — necessário para capturar ctwa_clid de anúncios CTWA. */
export const WHATSAPP_CLOUD_API_ENABLED = true

export const WHATSAPP_FLOW_TRIGGER_LABELS: Record<string, string> = {
  message_received: 'Mensagem recebida',
  keyword: 'Palavra-chave',
  manual: 'Manual',
}

export const WHATSAPP_FLOW_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  active: 'Ativo',
  paused: 'Pausado',
  archived: 'Arquivado',
}

export const WHATSAPP_CLOUD_API_STANDBY_MESSAGE
  = 'WhatsApp Cloud API oficial estará disponível em breve.'
