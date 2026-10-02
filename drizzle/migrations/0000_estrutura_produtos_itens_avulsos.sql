-- Atributos e base de custo do produto
alter table public.produtos
  add column if not exists material text,
  add column if not exists dimensoes text,
  add column if not exists acabamento text,
  add column if not exists base_custo text not null default 'completo' check (base_custo in ('completo','composto')),
  add column if not exists composicao_status text not null default 'nao_aplicavel' check (composicao_status in ('nao_aplicavel','pendente','definida')),
  add column if not exists versao integer not null default 1;

-- Composição: quantidade do filho por unidade do pai
create table public.produto_estrutura (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  pai_id uuid not null references public.produtos(id),
  filho_id uuid not null references public.produtos(id),
  quantidade numeric not null check (quantidade > 0),
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  unique (pai_id, filho_id),
  check (pai_id <> filho_id)
);
grant select on public.produto_estrutura to authenticated;
grant all on public.produto_estrutura to service_role;
alter table public.produto_estrutura enable row level security;
create policy "ler" on public.produto_estrutura for select to authenticated using (public.is_member(organization_id));

create or replace function public.validar_estrutura() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    with recursive desc_(id, nivel) as (
      select new.filho_id, 1
      union all
      select e.filho_id, d.nivel + 1 from produto_estrutura e join desc_ d on e.pai_id = d.id where d.nivel < 20
    ) select 1 from desc_ where id = new.pai_id
  ) then raise exception 'Composição inválida: o produto não pode conter a si mesmo (ciclo).'; end if;
  if (select organization_id from produtos where id = new.filho_id) <> new.organization_id
     or (select organization_id from produtos where id = new.pai_id) <> new.organization_id then
    raise exception 'Componente de outra organização.';
  end if;
  if (select tipo_item from produtos where id = new.pai_id) = 'P' then
    raise exception 'Peça é item final e não possui componentes.';
  end if;
  return new;
end $$;
create trigger produto_estrutura_validar before insert or update on public.produto_estrutura
  for each row execute function public.validar_estrutura();

-- Equivalência de códigos (rastreabilidade)
create table public.codigo_equivalencias (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  produto_id uuid not null references public.produtos(id),
  codigo_anterior text not null,
  codigo_novo text not null,
  motivo text not null,
  autor uuid,
  created_at timestamptz not null default now()
);
grant select on public.codigo_equivalencias to authenticated;
grant all on public.codigo_equivalencias to service_role;
alter table public.codigo_equivalencias enable row level security;
create policy "ler" on public.codigo_equivalencias for select to authenticated using (public.is_member(organization_id));

-- Itens avulsos e estrutura local na revisão
alter table public.revisao_componentes
  add column if not exists quantidade_avulsa numeric not null default 0 check (quantidade_avulsa >= 0),
  add column if not exists estrutura jsonb,
  add column if not exists estrutura_origem jsonb;

-- Árvore do catálogo (jsonb), usada na inclusão e na comparação
create or replace function public.arvore_produto(_produto uuid, _nivel int default 0) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p produtos;
begin
  select * into p from produtos where id = _produto;
  if not found or not is_member(p.organization_id) then raise exception 'Produto não encontrado.'; end if;
  if _nivel > 8 then raise exception 'Estrutura muito profunda.'; end if;
  return jsonb_build_object('produto_id', p.id, 'codigo', p.codigo, 'descricao', p.descricao, 'unidade', p.unidade,
    'tipo', p.tipo_item, 'base_custo', p.base_custo, 'composicao_status', p.composicao_status, 'versao', p.versao,
    'filhos', coalesce((select jsonb_agg(public.arvore_produto(e.filho_id, _nivel + 1) || jsonb_build_object('quantidade', e.quantidade) order by e.ordem, e.created_at)
      from produto_estrutura e where e.pai_id = p.id), '[]'::jsonb));
end $$;

create or replace function public.salvar_composicao(_produto uuid, _itens jsonb, _status text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p produtos; antes jsonb; i jsonb; n int := 0;
begin
  select * into p from produtos where id = _produto for update;
  if not found or auth.uid() is null or not pode(p.organization_id, 'editar_cadastro') then raise exception 'Sem permissão para editar a composição.'; end if;
  if p.tipo_item = 'P' and jsonb_array_length(coalesce(_itens,'[]')) > 0 then raise exception 'Peça é item final e não possui componentes.'; end if;
  if _status not in ('pendente','definida','nao_aplicavel') then raise exception 'Situação inválida.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('filho_id', filho_id, 'quantidade', quantidade) order by ordem), '[]') into antes from produto_estrutura where pai_id = _produto;
  delete from produto_estrutura where pai_id = _produto;
  for i in select * from jsonb_array_elements(coalesce(_itens,'[]')) loop
    if (i->>'quantidade')::numeric <= 0 then raise exception 'Quantidade por unidade deve ser positiva.'; end if;
    insert into produto_estrutura(organization_id, pai_id, filho_id, quantidade, ordem)
      values (p.organization_id, _produto, (i->>'filho_id')::uuid, (i->>'quantidade')::numeric, n);
    n := n + 1;
  end loop;
  update produtos set composicao_status = case when n > 0 then 'definida' when tipo_item = 'P' then 'nao_aplicavel' else 'pendente' end,
    versao = versao + 1 where id = _produto;
  insert into auditoria(organization_id, entidade, entidade_id, acao, dados, autor)
    values (p.organization_id, 'produto', _produto, 'composicao', jsonb_build_object('antes', antes, 'depois', _itens), auth.uid());
  return jsonb_build_object('id', _produto, 'componentes', n);
end $$;

create or replace function public.editar_produto(_produto uuid, _dados jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p produtos;
begin
  select * into p from produtos where id = _produto for update;
  if not found or auth.uid() is null or not pode(p.organization_id, 'editar_cadastro') then raise exception 'Sem permissão para editar o cadastro.'; end if;
  if coalesce(trim(_dados->>'descricao'),'') = '' or coalesce(trim(_dados->>'unidade'),'') = '' then raise exception 'Nome e unidade são obrigatórios.'; end if;
  update produtos set descricao = trim(_dados->>'descricao'), unidade = upper(trim(_dados->>'unidade')),
    ncm = nullif(trim(_dados->>'ncm'),''), modalidade = coalesce((_dados->>'modalidade')::modalidade_suprimento, modalidade),
    material = nullif(trim(_dados->>'material'),''), dimensoes = nullif(trim(_dados->>'dimensoes'),''),
    acabamento = nullif(trim(_dados->>'acabamento'),''), base_custo = coalesce(nullif(_dados->>'base_custo',''), base_custo),
    versao = versao + 1 where id = _produto;
  insert into auditoria(organization_id, entidade, entidade_id, acao, dados, autor)
    values (p.organization_id, 'produto', _produto, 'editar', jsonb_build_object('antes', to_jsonb(p), 'depois', _dados), auth.uid());
  return jsonb_build_object('id', _produto);
end $$;

-- Cadastro codificado: atributos, base de custo e composição na mesma transação
create or replace function public.cadastrar_produto_codificado(_org uuid, _familia text, _tipo character, _chave uuid, _dados jsonb, _custo numeric)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare _p produtos; _n int; _codigo text; i jsonb; k int := 0;
begin
  if auth.uid() is null or not public.pode(_org, 'importar_catalogo') then
    raise exception 'Sem permissão para cadastrar produtos.';
  end if;
  if _chave is null then raise exception 'Chave de cadastro obrigatória.'; end if;
  select * into _p from produtos where organization_id = _org and chave_cadastro = _chave;
  if found then return jsonb_build_object('id', _p.id, 'codigo', _p.codigo, 'repetido', true); end if;
  if not exists (select 1 from familias_codigo where sigla = _familia) then raise exception 'Família inválida.'; end if;
  if _tipo not in ('M','S','P') then raise exception 'Tipo inválido.'; end if;
  if coalesce(trim(_dados->>'descricao'),'') = '' or coalesce(trim(_dados->>'unidade'),'') = '' then
    raise exception 'Descrição e unidade são obrigatórias.';
  end if;
  if _custo is not null and _custo < 0 then raise exception 'Custo inválido.'; end if;
  if _tipo = 'P' and jsonb_array_length(coalesce(_dados->'composicao','[]')) > 0 then raise exception 'Peça é item final e não possui componentes.'; end if;
  perform pg_advisory_xact_lock(hashtext(_org::text || ':' || _chave::text));
  select * into _p from produtos where organization_id = _org and chave_cadastro = _chave;
  if found then return jsonb_build_object('id', _p.id, 'codigo', _p.codigo, 'repetido', true); end if;
  _n := public.reservar_sequencia(_org, _familia, _tipo);
  _codigo := public.formatar_codigo(_familia, _tipo, _n);
  perform set_config('nexus.codigo_autorizado', '1', true);
  insert into produtos(organization_id, codigo, descricao, unidade, ncm, modalidade, fabricante_id,
      indivisivel, origem, familia, tipo_item, sequencia, codigo_legado, chave_cadastro,
      material, dimensoes, acabamento, base_custo, composicao_status)
    values (_org, _codigo, trim(_dados->>'descricao'), upper(trim(_dados->>'unidade')), nullif(trim(_dados->>'ncm'),''),
      coalesce((_dados->>'modalidade')::modalidade_suprimento, 'comprar'), nullif(_dados->>'fabricante_id','')::uuid,
      coalesce((_dados->>'indivisivel')::boolean, upper(trim(_dados->>'unidade')) <> 'M'),
      coalesce(nullif(_dados->>'origem',''), 'cadastro manual'), _familia, _tipo, _n,
      nullif(_dados->>'codigo_legado',''), _chave,
      nullif(trim(_dados->>'material'),''), nullif(trim(_dados->>'dimensoes'),''), nullif(trim(_dados->>'acabamento'),''),
      case when _tipo = 'P' then 'completo' else coalesce(nullif(_dados->>'base_custo',''), 'composto') end,
      case when _tipo = 'P' then 'nao_aplicavel' when jsonb_array_length(coalesce(_dados->'composicao','[]')) > 0 then 'definida' else 'pendente' end)
    returning * into _p;
  perform set_config('nexus.codigo_autorizado', '', true);
  for i in select * from jsonb_array_elements(coalesce(_dados->'composicao','[]')) loop
    insert into produto_estrutura(organization_id, pai_id, filho_id, quantidade, ordem)
      values (_org, _p.id, (i->>'filho_id')::uuid, (i->>'quantidade')::numeric, k);
    k := k + 1;
  end loop;
  if _custo is not null then
    insert into produto_custos(organization_id, produto_id, custo, origem, created_by)
      values (_org, _p.id, _custo, _p.origem, auth.uid());
  end if;
  insert into auditoria(organization_id, entidade, entidade_id, acao, dados, autor)
    values (_org, 'produto', _p.id, 'cadastrar_codificado', jsonb_build_object('codigo', _codigo, 'componentes', k), auth.uid());
  return jsonb_build_object('id', _p.id, 'codigo', _codigo, 'repetido', false);
end $function$;

-- Reclassificação controlada de produto já codificado
create or replace function public.reclassificar_produto(_produto uuid, _familia text, _tipo character, _motivo text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare _p produtos; _n int; _codigo text; rv regras_versionadas;
begin
  select * into _p from produtos where id = _produto for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  if auth.uid() is null or not pode(_p.organization_id, 'aprovar_tecnica') then raise exception 'Reclassificação exige Engenharia ou Admin.'; end if;
  if _p.familia is null then raise exception 'Produto sem código definitivo: use a definição de código.'; end if;
  if coalesce(trim(_motivo),'') = '' then raise exception 'Motivo obrigatório.'; end if;
  if not exists (select 1 from familias_codigo where sigla = _familia) or _tipo not in ('M','S','P') then raise exception 'Família ou tipo inválido.'; end if;
  if _familia = _p.familia and _tipo = _p.tipo_item then raise exception 'Família e tipo já são os atuais.'; end if;
  if _tipo = 'P' and exists (select 1 from produto_estrutura where pai_id = _produto) then raise exception 'Remova a composição antes de classificar como Peça.'; end if;
  _n := reservar_sequencia(_p.organization_id, _familia, _tipo);
  _codigo := formatar_codigo(_familia, _tipo, _n);
  perform set_config('nexus.codigo_autorizado', '1', true);
  update produtos set codigo = _codigo, familia = _familia, tipo_item = _tipo, sequencia = _n,
    composicao_status = case when _tipo = 'P' then 'nao_aplicavel' else composicao_status end,
    base_custo = case when _tipo = 'P' then 'completo' else base_custo end, versao = versao + 1 where id = _produto;
  perform set_config('nexus.codigo_autorizado', '', true);
  insert into codigo_equivalencias(organization_id, produto_id, codigo_anterior, codigo_novo, motivo, autor)
    values (_p.organization_id, _produto, _p.codigo, _codigo, trim(_motivo), auth.uid());
  update revisao_componentes rc set codigo = _codigo from proposta_revisoes r
    where rc.produto_id = _produto and r.id = rc.revisao_id and r.status in ('rascunho','em_revisao');
  update proposta_revisoes r set regras_snapshot = jsonb_set(r.regras_snapshot, '{componentes}',
      (select jsonb_object_agg(k, case when v = to_jsonb(_p.codigo) then to_jsonb(_codigo) else v end)
         from jsonb_each(r.regras_snapshot->'componentes') e(k, v)))
    where r.organization_id = _p.organization_id and r.status in ('rascunho','em_revisao')
      and jsonb_typeof(r.regras_snapshot->'componentes') = 'object';
  select * into rv from regras_versionadas where organization_id = _p.organization_id and ativa order by versao desc limit 1;
  if found and jsonb_typeof(rv.regras->'componentes') = 'object' and exists (select 1 from jsonb_each(rv.regras->'componentes') e where e.value = to_jsonb(_p.codigo)) then
    update regras_versionadas set ativa = false where organization_id = _p.organization_id and ativa;
    insert into regras_versionadas(organization_id, versao, descricao, regras, ativa, origem, created_by)
      select _p.organization_id, (select max(versao) + 1 from regras_versionadas where organization_id = _p.organization_id),
        'Reclassificação ' || _p.codigo || ' → ' || _codigo,
        jsonb_set(rv.regras, '{componentes}', (select jsonb_object_agg(k, case when v = to_jsonb(_p.codigo) then to_jsonb(_codigo) else v end) from jsonb_each(rv.regras->'componentes') e(k, v))),
        true, 'reclassificacao', auth.uid();
  end if;
  insert into auditoria(organization_id, entidade, entidade_id, acao, motivo, dados, autor)
    values (_p.organization_id, 'produto', _produto, 'reclassificar', _motivo, jsonb_build_object('de', _p.codigo, 'para', _codigo), auth.uid());
  return jsonb_build_object('id', _produto, 'codigo', _codigo, 'anterior', _p.codigo);
end $$;

-- Inclusão de produto (com estrutura) na revisão editável
create or replace function public.incluir_produto_revisao(_rev uuid, _produto uuid, _quantidade numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r proposta_revisoes; arv jsonb; pid uuid; principal uuid;
begin
  select * into r from proposta_revisoes where id = _rev for update;
  if not found or auth.uid() is null or not is_member(r.organization_id) or not pode(r.organization_id, 'editar_revisao') then raise exception 'Acesso negado'; end if;
  if r.status not in ('rascunho','em_revisao') then raise exception 'Revisão emitida é imutável'; end if;
  if _quantidade is null or _quantidade < 0 then raise exception 'Quantidade inválida.'; end if;
  arv := arvore_produto(_produto);
  for pid in
    with recursive n(no) as (select arv union all select f from n, jsonb_array_elements(n.no->'filhos') f)
    select distinct (no->>'produto_id')::uuid from n
  loop
    insert into revisao_componentes(organization_id, revisao_id, produto_id, codigo, descricao, unidade, ncm, fabricante,
        modalidade, fornecedor_id, custo_adotado, custo_origem_id, indivisivel, multiplo_compra, incluido_orcamento)
      select r.organization_id, _rev, p.id, p.codigo, p.descricao, p.unidade, p.ncm, f.nome, p.modalidade, p.fornecedor_padrao_id,
        coalesce(c.custo, 0), c.id, p.indivisivel, p.multiplo_compra, true
      from produtos p left join fabricantes f on f.id = p.fabricante_id
      left join lateral (select id, custo from produto_custos where produto_id = p.id order by vigencia desc, created_at desc limit 1) c on true
      where p.id = pid and p.organization_id = r.organization_id
    on conflict (revisao_id, produto_id) do update set incluido_orcamento = true;
  end loop;
  if exists (select 1 from revisao_componentes where revisao_id = _rev and produto_id = _produto and indivisivel) and _quantidade <> trunc(_quantidade) then
    raise exception 'Item indivisível não aceita quantidade fracionada.';
  end if;
  update revisao_componentes set quantidade_avulsa = _quantidade,
    estrutura = case when jsonb_array_length(arv->'filhos') > 0 then arv else null end,
    estrutura_origem = case when jsonb_array_length(arv->'filhos') > 0 then arv else null end
    where revisao_id = _rev and produto_id = _produto returning id into principal;
  return jsonb_build_object('id', principal, 'componentes', (with recursive n(no) as (select arv union all select f from n, jsonb_array_elements(n.no->'filhos') f) select count(*) - 1 from n));
end $$;

-- Edição local: quantidade avulsa e estrutura entram no patch versionado
create or replace function nexus_private.atualizar_componentes_revisao(_rev uuid, _ids uuid[], _patch jsonb, _esperados jsonb)
 returns integer language plpgsql security definer set search_path to 'public' as $function$
declare
  r public.proposta_revisoes;
  permitidas text[] := array['incluido_orcamento','modalidade','fornecedor_id','custo_adotado','justificativa','custo_origem_id','quantidade_avulsa','estrutura'];
  chave text; item uuid; esperado jsonb; atual jsonb; atualizados integer;
begin
  select * into r from public.proposta_revisoes where id = _rev for update;
  if not found or auth.uid() is null or not public.is_member(r.organization_id) or not public.pode(r.organization_id,'editar_revisao') then
    raise exception 'Acesso negado';
  end if;
  if r.status not in ('rascunho','em_revisao') then raise exception 'Revisão emitida é imutável'; end if;
  if coalesce(array_length(_ids,1),0)=0 then raise exception 'Nenhum item selecionado'; end if;
  for chave in select jsonb_object_keys(_patch) loop
    if not (chave = any(permitidas)) then raise exception 'Campo não permitido: %', chave; end if;
  end loop;
  if _patch ? 'incluido_orcamento' and jsonb_typeof(_patch->'incluido_orcamento') <> 'boolean' then raise exception 'Inclusão inválida'; end if;
  if _patch ? 'modalidade' and (_patch->>'modalidade') not in ('comprar','fabricar','terceirizar') then raise exception 'Modalidade inválida'; end if;
  if _patch ? 'custo_adotado' and ((_patch->>'custo_adotado')::numeric < 0) then raise exception 'Custo inválido'; end if;
  if _patch ? 'quantidade_avulsa' and (jsonb_typeof(_patch->'quantidade_avulsa') <> 'number' or (_patch->>'quantidade_avulsa')::numeric < 0) then raise exception 'Quantidade inválida'; end if;
  if _patch ? 'estrutura' and jsonb_typeof(_patch->'estrutura') not in ('object','null') then raise exception 'Estrutura inválida'; end if;
  if _patch ? 'quantidade_avulsa' and exists (select 1 from public.revisao_componentes where id = any(_ids) and indivisivel)
     and (_patch->>'quantidade_avulsa')::numeric <> trunc((_patch->>'quantidade_avulsa')::numeric) then
    raise exception 'Item indivisível não aceita quantidade fracionada';
  end if;
  foreach item in array _ids loop
    select to_jsonb(c) into atual from public.revisao_componentes c
      where c.id=item and c.revisao_id=_rev and c.organization_id=r.organization_id;
    if atual is null then raise exception 'Item não pertence à revisão'; end if;
    esperado := _esperados->item::text;
    if esperado is null then raise exception 'Versão esperada ausente'; end if;
    for chave in select jsonb_object_keys(_patch) loop
      if (atual->chave) is distinct from (esperado->chave) then
        raise exception 'Conflito no componente: outro usuário alterou o campo. Trabalho local preservado.' using errcode='40001';
      end if;
    end loop;
  end loop;
  update public.revisao_componentes c set
    incluido_orcamento = case when _patch ? 'incluido_orcamento' then (_patch->>'incluido_orcamento')::boolean else c.incluido_orcamento end,
    modalidade = case when _patch ? 'modalidade' then (_patch->>'modalidade')::public.modalidade_suprimento else c.modalidade end,
    fornecedor_id = case when _patch ? 'fornecedor_id' then nullif(_patch->>'fornecedor_id','')::uuid else c.fornecedor_id end,
    custo_adotado = case when _patch ? 'custo_adotado' then (_patch->>'custo_adotado')::numeric else c.custo_adotado end,
    justificativa = case when _patch ? 'justificativa' then nullif(_patch->>'justificativa','') else c.justificativa end,
    custo_origem_id = case when _patch ? 'custo_origem_id' then nullif(_patch->>'custo_origem_id','')::uuid else c.custo_origem_id end,
    quantidade_avulsa = case when _patch ? 'quantidade_avulsa' then (_patch->>'quantidade_avulsa')::numeric else c.quantidade_avulsa end,
    estrutura = case when _patch ? 'estrutura' then nullif(_patch->'estrutura','null'::jsonb) else c.estrutura end
  where c.revisao_id=_rev and c.id=any(_ids);
  get diagnostics atualizados = row_count;
  return atualizados;
end $function$;

-- Histórico/checkpoint passam a rastrear itens avulsos e estrutura local
create or replace function public.objeto_rascunho(_t text, _r jsonb) returns jsonb
 language plpgsql immutable set search_path to 'public' as $function$
declare k text; v jsonb;
begin
 if _r is null then return '{}'::jsonb; end if;
 if _t='proposta_revisoes' then
  return jsonb_build_object('parametros',jsonb_build_object('nome','Parâmetros','campos',_r->'parametros'),
                           'textos',jsonb_build_object('nome','Textos do documento','campos',_r->'textos'));
 elsif _t='sistemas_dimensionados' then
  k:='sistema:'||(_r->>'id');
  v:=jsonb_build_object('nome',coalesce(nullif(_r->>'identificacao',''),'Sistema '||(_r->>'ordem')),'campos',jsonb_build_object(
    'identificacao',_r->'identificacao','tipo',_r->'tipo','metragem',_r->'metragem','trechos',_r->'trechos'));
 elsif _t='revisao_componentes' then
  k:='componente:'||(_r->>'id');
  v:=jsonb_build_object('nome',(_r->>'codigo')||' · '||(_r->>'descricao'),'justificativa',_r->'justificativa','rotulos',jsonb_build_object('fornecedor_id',_r->'fornecedor_nome'),'campos',jsonb_build_object(
    'incluido_orcamento',_r->'incluido_orcamento','modalidade',_r->'modalidade','fornecedor_id',_r->'fornecedor_id','custo_adotado',_r->'custo_adotado',
    'quantidade_avulsa',coalesce(_r->'quantidade_avulsa','0'::jsonb),'estrutura',coalesce(_r->'estrutura','null'::jsonb)));
 elsif _t='sistema_componentes' then
  if _r->>'override_quantidade' is null then return '{}'::jsonb; end if;
  k:='override:'||(_r->>'sistema_id')||':'||(_r->>'revisao_componente_id');
  v:=jsonb_build_object('nome','Ajuste de composição','justificativa',_r->'override_justificativa','campos',jsonb_build_object('override_quantidade',_r->'override_quantidade'));
 else return '{}'::jsonb;
 end if;
 return jsonb_build_object(k,v);
end $function$;

grant execute on function public.arvore_produto(uuid, int), public.salvar_composicao(uuid, jsonb, text), public.editar_produto(uuid, jsonb),
  public.reclassificar_produto(uuid, text, character, text), public.incluir_produto_revisao(uuid, uuid, numeric) to authenticated;