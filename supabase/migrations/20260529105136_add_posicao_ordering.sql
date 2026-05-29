-- Add `posicao` (ordering) column to categorias and produtos
ALTER TABLE public.categorias ADD COLUMN IF NOT EXISTS posicao INTEGER;
ALTER TABLE public.produtos   ADD COLUMN IF NOT EXISTS posicao INTEGER;

-- Backfill existing rows with deterministic positions
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY workspace_id ORDER BY COALESCE(criado_em, now()), id) AS rn
  FROM public.categorias
  WHERE posicao IS NULL
)
UPDATE public.categorias c SET posicao = r.rn FROM ranked r WHERE c.id = r.id;

WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY workspace_id, categoria_id ORDER BY COALESCE(criado_em, now()), id) AS rn
  FROM public.produtos
  WHERE posicao IS NULL
)
UPDATE public.produtos p SET posicao = r.rn FROM ranked r WHERE p.id = r.id;

CREATE INDEX IF NOT EXISTS idx_categorias_workspace_posicao ON public.categorias(workspace_id, posicao);
CREATE INDEX IF NOT EXISTS idx_produtos_categoria_posicao   ON public.produtos(categoria_id, posicao);
