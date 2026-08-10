-- Translate CRM English labels to Portuguese (safe data-only updates).

UPDATE public.crm_funnel
SET
  name = 'Padrão',
  description = CASE
    WHEN description IS NULL OR btrim(description) = '' OR description ILIKE 'default pipeline' THEN 'Funil padrão'
    ELSE description
  END,
  updated_at = now()
WHERE lower(btrim(name)) = 'default';

UPDATE public.crm_sales_stage
SET
  name = CASE lower(btrim(name))
    WHEN 'new' THEN 'Novo'
    WHEN 'won' THEN 'Ganho'
    WHEN 'lost' THEN 'Perdido'
    WHEN 'qualified lead' THEN 'Lead qualificado'
    ELSE name
  END,
  description = CASE
    WHEN description ILIKE 'initial stage' THEN 'Estágio inicial'
    WHEN description ILIKE 'deal won' THEN 'Negócio fechado'
    WHEN description ILIKE 'deal lost' THEN 'Negócio perdido'
    ELSE description
  END
WHERE lower(btrim(name)) IN ('new', 'won', 'lost', 'qualified lead')
   OR description ILIKE 'initial stage'
   OR description ILIKE 'deal won'
   OR description ILIKE 'deal lost';

UPDATE public.crm_lead_source_table
SET
  name = CASE lower(btrim(name))
    WHEN 'website' THEN 'Site'
    WHEN 'social media' THEN 'Redes sociais'
    WHEN 'event' THEN 'Evento'
    ELSE name
  END,
  updated_at = now()
WHERE lower(btrim(name)) IN ('website', 'social media', 'event');
