create table public.familias_codigo (
  sigla text primary key check (sigla ~ '^[A-Z]{2,5}$'),
  nome text not null,
  grupo text not null,
  situacao text not null default 'confirmada' check (situacao in ('confirmada','a_confirmar')),
  observacao text,
  ordem int not null default 0
);
grant select on public.familias_codigo to authenticated;
grant all on public.familias_codigo to service_role;
alter table public.familias_codigo enable row level security;
create policy "familias leitura" on public.familias_codigo for select to authenticated using (true);

create table public.series_planilha (
  familia text not null references public.familias_codigo(sigla),
  tipo char(1) not null check (tipo in ('M','S','P')),
  ultimo int not null check (ultimo >= 0),
  pendencia text,
  origem text not null default 'RELAÇÃO DE CÓDIGOS NEXUS.xlsx, aba Relação de Códigos (leitura 30/09/2026)',
  primary key (familia, tipo)
);
grant select on public.series_planilha to authenticated;
grant all on public.series_planilha to service_role;
alter table public.series_planilha enable row level security;
create policy "series planilha leitura" on public.series_planilha for select to authenticated using (true);

create table public.series_codigo (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  familia text not null references public.familias_codigo(sigla),
  tipo char(1) not null check (tipo in ('M','S','P')),
  ultimo int not null default 0 check (ultimo >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, familia, tipo)
);
grant select on public.series_codigo to authenticated;
grant all on public.series_codigo to service_role;
alter table public.series_codigo enable row level security;
create policy "series membros" on public.series_codigo for select to authenticated using (public.is_member(organization_id));

alter table public.produtos
  add column familia text references public.familias_codigo(sigla),
  add column tipo_item char(1) check (tipo_item in ('M','S','P')),
  add column sequencia int check (sequencia > 0),
  add column codigo_legado text,
  add column chave_cadastro uuid;
create unique index produtos_chave_cadastro_idx on public.produtos(organization_id, chave_cadastro) where chave_cadastro is not null;
create unique index produtos_serie_seq_idx on public.produtos(organization_id, familia, tipo_item, sequencia) where sequencia is not null;

create or replace function public.formatar_codigo(_familia text, _tipo char, _seq int)
returns text language sql immutable set search_path = public as $$
  select _familia || '-NXS-' || _tipo || lpad(_seq::text, greatest(3, length(_seq::text)), '0')
$$;

-- Bloqueia código manual: só as funções de codificação liberam a gravação.
create or replace function public.proteger_codigo_produto() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('nexus.codigo_autorizado', true), '') = '1' then return new; end if;
  if tg_op = 'INSERT'
     or new.codigo is distinct from old.codigo or new.familia is distinct from old.familia
     or new.tipo_item is distinct from old.tipo_item or new.sequencia is distinct from old.sequencia
     or new.codigo_legado is distinct from old.codigo_legado then
    raise exception 'O código do item é gerado pelo sistema; use o cadastro de produtos.';
  end if;
  return new;
end $$;
create trigger produtos_codigo_protegido before insert or update on public.produtos
  for each row execute function public.proteger_codigo_produto();

-- Reserva o próximo número da série (com bloqueio). Nunca reduz nem reutiliza.
create or replace function public.reservar_sequencia(_org uuid, _familia text, _tipo char)
returns int language plpgsql security definer set search_path = public as $$
declare _base int; _max int; _n int;
begin
  select coalesce(ultimo, 0) into _base from series_planilha where familia = _familia and tipo = _tipo;
  select coalesce(max(sequencia), 0) into _max from produtos where organization_id = _org and familia = _familia and tipo_item = _tipo;
  insert into series_codigo(organization_id, familia, tipo, ultimo)
    values (_org, _familia, _tipo, greatest(coalesce(_base,0), _max))
    on conflict do nothing;
  select ultimo into _n from series_codigo where organization_id = _org and familia = _familia and tipo = _tipo for update;
  _n := greatest(_n, coalesce(_base,0), _max) + 1;
  update series_codigo set ultimo = _n, updated_at = now() where organization_id = _org and familia = _familia and tipo = _tipo;
  return _n;
end $$;
revoke all on function public.reservar_sequencia(uuid, text, char) from public, anon, authenticated;

create or replace function public.previa_codigo(_org uuid, _familia text, _tipo char)
returns text language plpgsql stable security definer set search_path = public as $$
declare _n int;
begin
  if not public.is_member(_org) then raise exception 'Sem acesso.'; end if;
  if not exists (select 1 from familias_codigo where sigla = _familia) or _tipo not in ('M','S','P') then return null; end if;
  select greatest(
    coalesce((select ultimo from series_planilha where familia=_familia and tipo=_tipo),0),
    coalesce((select ultimo from series_codigo where organization_id=_org and familia=_familia and tipo=_tipo),0),
    coalesce((select max(sequencia) from produtos where organization_id=_org and familia=_familia and tipo_item=_tipo),0)) + 1 into _n;
  return public.formatar_codigo(_familia, _tipo, _n);
end $$;
grant execute on function public.previa_codigo(uuid, text, char) to authenticated;

create or replace function public.cadastrar_produto_codificado(
  _org uuid, _familia text, _tipo char, _chave uuid, _dados jsonb, _custo numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare _p produtos; _n int; _codigo text;
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
  perform pg_advisory_xact_lock(hashtext(_org::text || ':' || _chave::text));
  select * into _p from produtos where organization_id = _org and chave_cadastro = _chave;
  if found then return jsonb_build_object('id', _p.id, 'codigo', _p.codigo, 'repetido', true); end if;
  _n := public.reservar_sequencia(_org, _familia, _tipo);
  _codigo := public.formatar_codigo(_familia, _tipo, _n);
  perform set_config('nexus.codigo_autorizado', '1', true);
  insert into produtos(organization_id, codigo, descricao, unidade, ncm, modalidade, fabricante_id,
      indivisivel, origem, familia, tipo_item, sequencia, codigo_legado, chave_cadastro)
    values (_org, _codigo, trim(_dados->>'descricao'), upper(trim(_dados->>'unidade')), nullif(trim(_dados->>'ncm'),''),
      coalesce((_dados->>'modalidade')::modalidade_suprimento, 'comprar'), nullif(_dados->>'fabricante_id','')::uuid,
      coalesce((_dados->>'indivisivel')::boolean, upper(trim(_dados->>'unidade')) <> 'M'),
      coalesce(nullif(_dados->>'origem',''), 'cadastro manual'), _familia, _tipo, _n,
      nullif(_dados->>'codigo_legado',''), _chave)
    returning * into _p;
  perform set_config('nexus.codigo_autorizado', '', true);
  if _custo is not null then
    insert into produto_custos(organization_id, produto_id, custo, origem, created_by)
      values (_org, _p.id, _custo, _p.origem, auth.uid());
  end if;
  insert into auditoria(organization_id, entidade, entidade_id, acao, dados, autor)
    values (_org, 'produto', _p.id, 'cadastrar_codificado', jsonb_build_object('codigo', _codigo), auth.uid());
  return jsonb_build_object('id', _p.id, 'codigo', _codigo, 'repetido', false);
end $$;
revoke all on function public.cadastrar_produto_codificado(uuid, text, char, uuid, jsonb, numeric) from public, anon;
grant execute on function public.cadastrar_produto_codificado(uuid, text, char, uuid, jsonb, numeric) to authenticated;

insert into public.familias_codigo(sigla, nome, grupo, situacao, observacao, ordem) values
 ('SRG','Sistema de Resgate Giratório 360º','Resgate','confirmada',null,1),
 ('SRB','Sistema de Resgate Bandeirinha 360º','Resgate','confirmada',null,2),
 ('SRF','Sistema de Resgate Fixo (Poço de Elevador)','Resgate','confirmada',null,3),
 ('SRE','Sistema de Resgate Elevador Articulado (Poço de Elevador)','Resgate','confirmada',null,4),
 ('SRA','Sistema de Resgate Articulado – Intermediário Silo','Resgate','confirmada',null,5),
 ('ACP','Alçapão','Acesso','confirmada',null,10),
 ('EMA','Escada Marinheiro','Acesso','confirmada',null,11),
 ('ERA','Escada Rampa','Acesso','confirmada',null,12),
 ('ER','Escada Modular','Acesso','confirmada','Sem pasta própria no Drive',13),
 ('EAT','Escada de Acesso ao Centro do Silo','Acesso','confirmada',null,14),
 ('ESC','Escada (citada só em lista de material)','Acesso','a_confirmar','Classificação histórica a confirmar',15),
 ('JSS','Janela Superior Silo','Janelas','confirmada',null,20),
 ('JIS','Janela Inferior Silo','Janelas','confirmada',null,21),
 ('JIN','Janela de Inspeção','Janelas','confirmada',null,22),
 ('LVHF','Linha de Vida Horizontal Flexível','Linhas de vida','confirmada',null,30),
 ('LVH','Linha de Vida Horizontal (Expositor)','Linhas de vida','confirmada','Referência histórica ao expositor LVHF',31),
 ('LVHR','Linha de Vida Horizontal Rígida','Linhas de vida','confirmada',null,32),
 ('LVV','Linha de Vida Vertical','Linhas de vida','confirmada',null,33),
 ('GCO','Guarda-Corpo','Proteção e plataformas','confirmada',null,40),
 ('GDP','Grade de Proteção','Proteção e plataformas','confirmada',null,41),
 ('PAT','Plataformas de Trabalho','Proteção e plataformas','confirmada',null,42),
 ('PSO','Plataforma Superior Octogonal','Proteção e plataformas','confirmada',null,43),
 ('SUP','Suporte Monopé Superior Silo','Proteção e plataformas','confirmada',null,44),
 ('PLA','Placas de Identificação','Outras','confirmada',null,50),
 ('COM','Itens Comerciais','Outras','confirmada','Família específica da biblioteca de itens comerciais',51),
 ('CON','Não identificado (CON)','Outras','a_confirmar','Descrição a confirmar',52);

insert into public.series_planilha(familia, tipo, ultimo, pendencia) values
 ('SRG','M',8,null),('SRG','S',4,null),('SRG','P',32,null),
 ('SRB','M',3,null),('SRB','S',0,null),('SRB','P',11,null),
 ('SRF','P',1,null),
 ('SRE','M',3,null),('SRE','S',0,null),('SRE','P',6,null),
 ('SRA','M',4,null),('SRA','S',3,null),('SRA','P',8,null),
 ('ACP','M',3,null),('ACP','S',9,null),('ACP','P',32,null),
 ('EMA','M',1,'M1000/M2000/M3000 podem indicar dimensões dos módulos; não usados como sequência'),
 ('EMA','P',31,null),
 ('ERA','M',7,null),('ERA','S',2,null),('ERA','P',33,null),
 ('ER','M',1,null),('ER','P',26,null),
 ('EAT','M',0,null),
 ('ESC','M',0,'M1000/M2000 podem indicar dimensões; família a confirmar'),
 ('JSS','M',10,null),('JSS','S',10,null),('JSS','P',38,null),
 ('JIS','M',0,null),('JIS','S',2,null),('JIS','P',12,null),
 ('JIN','M',2,null),('JIN','S',3,null),('JIN','P',12,null),
 ('LVHF','S',6,null),('LVHF','P',49,null),
 ('LVH','M',0,null),('LVH','P',1,null),
 ('LVHR','M',3,null),('LVHR','P',8,null),
 ('LVV','P',10,null),
 ('GCO','M',6,null),('GCO','S',4,null),('GCO','P',201,null),
 ('GDP','S',10,null),('GDP','P',17,null),
 ('PAT','M',54,null),
 ('PAT','S',32,'S1500 associado à plataforma 1500 × 800; não usado como sequência'),
 ('PAT','P',303,'P47 e P047 têm descrições com medidas diferentes; verificar se são produtos distintos'),
 ('PSO','M',0,null),('PSO','P',1,null),
 ('SUP','S',1,null),('SUP','P',11,null),
 ('PLA','P',0,null),
 ('COM','M',8,null),('COM','P',8,null),
 ('CON','M',1,'Família CON sem descrição confirmada');