-- Bucket de storage para backups
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('backups', 'backups', false, 10485760, ARRAY['application/json'])
ON CONFLICT (id) DO NOTHING;

-- Tabela de log
CREATE TABLE IF NOT EXISTS public.backup_logs (
  id            text PRIMARY KEY,
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  storage_path  text NOT NULL,
  tamanho_bytes bigint NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'erro')),
  erro_msg      text,
  criado_em     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backup_logs_workspace_data
  ON public.backup_logs (workspace_id, criado_em DESC);

ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_isolation" ON public.backup_logs FOR SELECT
  USING (workspace_id = public.get_my_workspace_id());

CREATE POLICY "workspace_owner_insert_backup_logs" ON public.backup_logs FOR INSERT
  WITH CHECK (workspace_id = public.get_my_workspace_id());

-- Retenção automática
CREATE OR REPLACE FUNCTION public.cleanup_old_backups(p_workspace_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE old_record RECORD;
BEGIN
  FOR old_record IN (
    SELECT id, storage_path FROM public.backup_logs
    WHERE workspace_id = p_workspace_id AND status = 'ok'
    ORDER BY criado_em DESC OFFSET 7
  ) LOOP
    DELETE FROM storage.objects WHERE bucket_id = 'backups' AND name = old_record.storage_path;
    DELETE FROM public.backup_logs WHERE id = old_record.id;
  END LOOP;
END; $$;