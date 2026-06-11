-- Tabela de somatórios (totalizadores customizados por workspace)
CREATE TABLE IF NOT EXISTS public.somatorios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          text NOT NULL,
  unit          text NOT NULL,
  item_refs     text[] NOT NULL DEFAULT '{}',
  min_quantity  numeric,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_somatorios_workspace
  ON public.somatorios (workspace_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.somatorios TO authenticated;
GRANT ALL ON public.somatorios TO service_role;

ALTER TABLE public.somatorios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "somatorios_select_own_workspace" ON public.somatorios
  FOR SELECT TO authenticated
  USING (workspace_id = public.get_my_workspace_id());

CREATE POLICY "somatorios_insert_own_workspace" ON public.somatorios
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id = public.get_my_workspace_id());

CREATE POLICY "somatorios_update_own_workspace" ON public.somatorios
  FOR UPDATE TO authenticated
  USING (workspace_id = public.get_my_workspace_id())
  WITH CHECK (workspace_id = public.get_my_workspace_id());

CREATE POLICY "somatorios_delete_own_workspace" ON public.somatorios
  FOR DELETE TO authenticated
  USING (workspace_id = public.get_my_workspace_id());
