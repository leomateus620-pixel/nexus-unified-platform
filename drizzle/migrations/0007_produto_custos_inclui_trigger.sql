CREATE OR REPLACE FUNCTION public.custo_inclui_padrao() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF coalesce(array_length(NEW.inclui,1),0) = 0 AND NEW.origem LIKE 'media_ponderada%' THEN
    NEW.inclui := ARRAY['frete','ipi','difal'];
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_custo_inclui_padrao ON public.produto_custos;
CREATE TRIGGER trg_custo_inclui_padrao BEFORE INSERT ON public.produto_custos
  FOR EACH ROW EXECUTE FUNCTION public.custo_inclui_padrao();
ALTER TABLE public.produto_custos DISABLE TRIGGER USER;
UPDATE public.produto_custos SET inclui = ARRAY['frete','ipi','difal'] WHERE origem LIKE 'media_ponderada%' AND inclui = '{}';
ALTER TABLE public.produto_custos ENABLE TRIGGER USER;