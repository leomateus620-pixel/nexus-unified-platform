CREATE OR REPLACE FUNCTION public.revisao_componente_custo_origem() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pc record;
BEGIN
  IF NEW.custo_origem_id IS NOT NULL AND (TG_OP = 'INSERT' OR NEW.custo_origem_id IS DISTINCT FROM OLD.custo_origem_id) THEN
    SELECT inclui, origem, vigencia INTO pc FROM produto_custos WHERE id = NEW.custo_origem_id;
    IF FOUND THEN
      IF TG_OP = 'UPDATE' OR coalesce(array_length(NEW.custo_inclui,1),0) = 0 THEN NEW.custo_inclui := coalesce(pc.inclui,'{}'); END IF;
      IF NEW.custo_fonte IS NULL OR TG_OP = 'UPDATE' THEN NEW.custo_fonte := jsonb_build_object('origem', pc.origem, 'vigencia', pc.vigencia); END IF;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND NEW.custo_origem_id IS NULL AND OLD.custo_origem_id IS NOT NULL AND NEW.custo_adotado IS DISTINCT FROM OLD.custo_adotado THEN
    NEW.custo_inclui := '{}';
    NEW.custo_fonte := jsonb_build_object('origem','ajuste manual');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_rc_custo_origem ON public.revisao_componentes;
CREATE TRIGGER trg_rc_custo_origem BEFORE INSERT OR UPDATE OF custo_origem_id, custo_adotado ON public.revisao_componentes
  FOR EACH ROW EXECUTE FUNCTION public.revisao_componente_custo_origem();