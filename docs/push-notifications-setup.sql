-- ============================================================
-- PUSH NOTIFICATIONS — Execute este SQL no seu Supabase (SQL Editor)
-- ============================================================
-- Também configure as secrets nas Edge Functions do projeto:
--   VAPID_PUBLIC_KEY  = BDU8KtY2ByrPzjGr94iHlfnoDQxT5fY32n9t6RroeCnySd8quhzfT6WEo718rjtu-ZC0E583_aXoVjyYWEMuwZM
--   VAPID_PRIVATE_KEY = cole_a_chave_privada_gerada_sem_colocar_no_codigo
--   VAPID_SUBJECT     = mailto:suporte@vexodev.com.br
-- Depois faça deploy das funções: push-subscribe e push-notify.
-- IMPORTANTE: elas precisam estar com verify_jwt = false, pois o preflight CORS (OPTIONS)
-- não envia token; o código da função valida o usuário manualmente pelo Authorization Bearer.

-- 1) Inscrições de push por dispositivo/usuário
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_label text NOT NULL DEFAULT 'Dispositivo',
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS push_subscriptions_workspace_idx
  ON public.push_subscriptions (workspace_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subs_select_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_select_own" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "push_subs_insert_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_insert_own" ON public.push_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "push_subs_update_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_update_own" ON public.push_subscriptions
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "push_subs_delete_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_delete_own" ON public.push_subscriptions
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- 2) Estado do último alerta enviado por produto (dedupe de notificações)
CREATE TABLE IF NOT EXISTS public.stock_alert_state (
  workspace_id uuid NOT NULL,
  produto_id uuid NOT NULL,
  last_state text NOT NULL CHECK (last_state IN ('ok','low','zero')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, produto_id)
);

GRANT SELECT ON public.stock_alert_state TO authenticated;
GRANT ALL ON public.stock_alert_state TO service_role;

ALTER TABLE public.stock_alert_state ENABLE ROW LEVEL SECURITY;
-- Apenas as edge functions (service_role) leem/escrevem — nenhuma policy para authenticated.