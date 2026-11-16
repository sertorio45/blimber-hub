-- WhatsApp groups + richer messaging (Evolution parity)

-- ---------------------------------------------------------------------------
-- Conversations: group fields + unique by remote_jid
-- ---------------------------------------------------------------------------

ALTER TABLE whatsapp_conversation
  ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_subject TEXT,
  ADD COLUMN IF NOT EXISTS group_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill is_group from remote_jid when already stored as @g.us
UPDATE whatsapp_conversation
SET is_group = true,
    group_subject = COALESCE(NULLIF(group_subject, ''), NULLIF(contact_name, ''), contact_phone)
WHERE remote_jid LIKE '%@g.us'
  AND is_group = false;

DROP INDEX IF EXISTS idx_whatsapp_conversation_tenant_instance_phone;

-- Ensure remote_jid is filled for uniqueness
UPDATE whatsapp_conversation
SET remote_jid = CASE
  WHEN remote_jid IS NULL OR remote_jid = '' THEN
    CASE
      WHEN contact_phone ~ '^[0-9]+$' THEN contact_phone || '@s.whatsapp.net'
      ELSE id::text || '@legacy.local'
    END
  ELSE remote_jid
END
WHERE remote_jid IS NULL OR remote_jid = '';

-- Deduplicate remote_jid collisions before unique index
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY tenant_id, instance_id, remote_jid
      ORDER BY last_message_at DESC NULLS LAST, created_at DESC
    ) AS rn
  FROM whatsapp_conversation
  WHERE instance_id IS NOT NULL
)
UPDATE whatsapp_conversation c
SET remote_jid = c.remote_jid || '#dup-' || c.id::text
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_conversation_tenant_instance_remote_jid
  ON whatsapp_conversation (tenant_id, instance_id, remote_jid)
  WHERE instance_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversation_is_group
  ON whatsapp_conversation (tenant_id, is_group);

-- ---------------------------------------------------------------------------
-- Messages: participant + quote + reactions
-- ---------------------------------------------------------------------------

ALTER TABLE whatsapp_message
  ADD COLUMN IF NOT EXISTS participant_jid TEXT,
  ADD COLUMN IF NOT EXISTS participant_name TEXT,
  ADD COLUMN IF NOT EXISTS quoted_external_id TEXT,
  ADD COLUMN IF NOT EXISTS reactions JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_quoted_external
  ON whatsapp_message (tenant_id, quoted_external_id)
  WHERE quoted_external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_message_participant
  ON whatsapp_message (conversation_id, participant_jid)
  WHERE participant_jid IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Group participants
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS whatsapp_group_participant (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  conversation_id   UUID NOT NULL REFERENCES whatsapp_conversation(id) ON DELETE CASCADE,
  participant_jid   TEXT NOT NULL,
  phone             TEXT,
  name              TEXT,
  admin_role        TEXT,
  contact_id        UUID REFERENCES whatsapp_contact(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, participant_jid)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_group_participant_tenant
  ON whatsapp_group_participant (tenant_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_group_participant_conversation
  ON whatsapp_group_participant (conversation_id);

ALTER TABLE whatsapp_group_participant ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_group_participant'
      AND policyname = 'tenant_isolation'
  ) THEN
    CREATE POLICY "tenant_isolation" ON whatsapp_group_participant
      USING (tenant_id = (current_setting('app.tenant_id', true))::uuid)
      WITH CHECK (tenant_id = (current_setting('app.tenant_id', true))::uuid);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Storage bucket for inbound/outbound WhatsApp media
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-media',
  'whatsapp-media',
  false,
  52428800,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/3gpp',
    'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr',
    'application/pdf', 'application/octet-stream',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
ON CONFLICT (id) DO NOTHING;
