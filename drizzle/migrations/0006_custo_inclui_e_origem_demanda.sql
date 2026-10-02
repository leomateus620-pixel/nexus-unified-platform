ALTER TABLE public.revisao_componentes
  ADD COLUMN IF NOT EXISTS custo_inclui text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custo_fonte jsonb,
  ADD COLUMN IF NOT EXISTS custo_atualizado_em timestamptz;
COMMENT ON COLUMN public.revisao_componentes.custo_inclui IS 'Despesas de aquisição já embutidas no custo adotado (frete, difal, ipi); o motor não as soma de novo.';
ALTER TABLE public.produto_custos
  ADD COLUMN IF NOT EXISTS inclui text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.demandas
  ADD COLUMN IF NOT EXISTS origem jsonb,
  ADD COLUMN IF NOT EXISTS quantidade_tecnica numeric;