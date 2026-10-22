-- Estoque físico por proveniência; nenhum saldo histórico é presumido ou preenchido.
-- Quantidades numeric(18,6), valores enviados/retornados como texto, sem autoridade financeira.
-- Ordem de concorrência: autor -> item legado (quando aplicável) -> lock do estoque da organização.
alter table public.produtos add constraint alm_produto_tenant unique(organization_id,id);
alter table public.projetos add constraint alm_projeto_tenant unique(organization_id,id);
alter table public.projetos add constraint alm_projeto_revisao unique(organization_id,revisao_id,id);
alter table public.ordens_compra add constraint alm_oc_tenant unique(organization_id,id);
alter table public.ordens_producao add constraint alm_op_tenant unique(organization_id,id);
alter table public.ordem_compra_itens add constraint alm_oci_tenant unique(organization_id,id);
alter table public.ordem_producao_itens add constraint alm_opi_tenant unique(organization_id,id);
alter table public.recebimentos add constraint alm_recebimento_tenant unique(organization_id,id);
alter table public.apontamentos add constraint alm_apontamento_tenant unique(organization_id,id);

create table public.almoxarifados(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),
 nome text not null check(length(trim(nome)) between 2 and 120),descricao text not null default '' check(length(descricao)<=1000),ativo boolean not null default true,
 version integer not null default 1 check(version>0),created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,nome)
);
create table public.estoque_produto_politicas(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,produto_id uuid not null,
 exige_lote boolean not null default false,exige_serie boolean not null default false,estoque_minimo numeric(18,6) not null default 0 check(estoque_minimo>=0),
 version integer not null default 1,created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,produto_id),foreign key(organization_id,produto_id) references public.produtos(organization_id,id)
);
create table public.estoque_inventarios(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,produto_id uuid not null,local_id uuid not null,lote text,
 contada numeric(18,6) not null check(contada>=0),baseline numeric(18,6) not null check(baseline>=0),ledger_id bigint not null,
 estado text not null default 'aberto' check(estado in ('aberto','aprovado','cancelado')),motivo text not null check(length(trim(motivo)) between 3 and 2000),
 aprovado_por uuid references auth.users(id),aprovado_em timestamptz,version integer not null default 1,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),foreign key(organization_id,produto_id) references public.produtos(organization_id,id),foreign key(organization_id,local_id) references public.almoxarifados(organization_id,id)
);
create table public.estoque_conferencias(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,recebimento_id uuid,apontamento_id uuid,inventario_id uuid,produto_id uuid not null,local_id uuid not null,
 quantidade numeric(18,6) not null check(quantidade>0),unidade_origem text not null,fator numeric not null check(fator>0 and fator<>'NaN'::numeric),
 aceita numeric(18,6) not null check(aceita>=0),quarentena numeric(18,6) not null check(quarentena>=0),rejeitada numeric(18,6) not null check(rejeitada>=0),
 lote text check(length(lote)<=120),serie text check(length(serie)<=120),motivo text check(length(motivo)<=2000),reconciliacao text check(length(reconciliacao)<=4000),
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,produto_id,id),check(num_nonnulls(recebimento_id,apontamento_id,inventario_id)=1),check(aceita+quarentena+rejeitada=quantidade*fator),
 foreign key(organization_id,recebimento_id) references public.recebimentos(organization_id,id),foreign key(organization_id,apontamento_id) references public.apontamentos(organization_id,id),
 foreign key(organization_id,inventario_id) references public.estoque_inventarios(organization_id,id),foreign key(organization_id,produto_id) references public.produtos(organization_id,id),foreign key(organization_id,local_id) references public.almoxarifados(organization_id,id)
);
create index estoque_conferencia_recebimento on public.estoque_conferencias(organization_id,recebimento_id) where recebimento_id is not null;
create index estoque_conferencia_apontamento on public.estoque_conferencias(organization_id,apontamento_id) where apontamento_id is not null;
create unique index estoque_serie_unica on public.estoque_conferencias(organization_id,produto_id,serie) where serie is not null;
create table public.estoque_reservas(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,produto_id uuid not null,local_id uuid not null,projeto_id uuid,op_id uuid,pessoa_id uuid not null,lote text,
 quantidade numeric(18,6) not null check(quantidade>0),validade timestamptz not null,
 estado text not null default 'ativa' check(estado in ('ativa','retirada','concluida','cancelada')),motivo text,
 version integer not null default 1,created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,produto_id,id),check(num_nonnulls(projeto_id,op_id)=1),
 foreign key(organization_id,produto_id) references public.produtos(organization_id,id),foreign key(organization_id,local_id) references public.almoxarifados(organization_id,id),
 foreign key(organization_id,projeto_id) references public.projetos(organization_id,id),foreign key(organization_id,op_id) references public.ordens_producao(organization_id,id),foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id)
);
create index estoque_reservas_fila on public.estoque_reservas(organization_id,pessoa_id,estado,validade);
create index estoque_reservas_saldo on public.estoque_reservas(organization_id,produto_id,local_id,estado,validade);
create table public.estoque_reserva_itens(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,produto_id uuid not null,reserva_id uuid not null,conferencia_id uuid not null,quantidade numeric(18,6) not null check(quantidade>0),
 unique(organization_id,reserva_id,conferencia_id),foreign key(organization_id,produto_id,reserva_id) references public.estoque_reservas(organization_id,produto_id,id),foreign key(organization_id,produto_id,conferencia_id) references public.estoque_conferencias(organization_id,produto_id,id)
);
create table public.estoque_operacoes(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,tipo text not null check(tipo in ('conferencia','qualidade','transferencia','retirada','consumo','devolucao','estorno','inventario')),
 reserva_id uuid,conferencia_id uuid,inventario_id uuid,recebimento_estorno_id uuid,apontamento_estorno_id uuid,motivo text,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),unique(organization_id,id),
 foreign key(organization_id,reserva_id) references public.estoque_reservas(organization_id,id),foreign key(organization_id,conferencia_id) references public.estoque_conferencias(organization_id,id),foreign key(organization_id,inventario_id) references public.estoque_inventarios(organization_id,id),
 foreign key(organization_id,recebimento_estorno_id) references public.recebimentos(organization_id,id),foreign key(organization_id,apontamento_estorno_id) references public.apontamentos(organization_id,id)
);
create table public.estoque_movimentos(
 id uuid primary key default gen_random_uuid(),seq bigint generated always as identity unique,organization_id uuid not null,operacao_id uuid not null,produto_id uuid not null,conferencia_id uuid not null,
 local_id uuid,reserva_id uuid,pessoa_id uuid,posicao text not null check(posicao in ('aceito','quarentena','rejeitado','em_poder','consumido')),quantidade numeric(18,6) not null check(quantidade<>0),
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 check((posicao in ('aceito','quarentena','rejeitado') and local_id is not null and pessoa_id is null) or (posicao='em_poder' and local_id is null and pessoa_id is not null and reserva_id is not null) or (posicao='consumido' and local_id is null)),
 foreign key(organization_id,operacao_id) references public.estoque_operacoes(organization_id,id),foreign key(organization_id,produto_id,conferencia_id) references public.estoque_conferencias(organization_id,produto_id,id),
 foreign key(organization_id,local_id) references public.almoxarifados(organization_id,id),foreign key(organization_id,produto_id,reserva_id) references public.estoque_reservas(organization_id,produto_id,id),foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id)
);
create index estoque_movimentos_saldo on public.estoque_movimentos(organization_id,produto_id,local_id,conferencia_id,posicao);
create index estoque_movimentos_reserva on public.estoque_movimentos(organization_id,reserva_id,conferencia_id,posicao);
create table public.estoque_estorno_alocacoes(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,operacao_id uuid not null,conferencia_id uuid not null,quantidade numeric(18,6) not null check(quantidade>0),
 foreign key(organization_id,operacao_id) references public.estoque_operacoes(organization_id,id),foreign key(organization_id,conferencia_id) references public.estoque_conferencias(organization_id,id)
);

create table public.ferramenta_calibracao_politicas(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),nome text not null check(length(trim(nome)) between 3 and 120),numero integer not null check(numero>0),
 metodo text not null check(length(trim(metodo)) between 3 and 4000),fonte text not null check(length(trim(fonte)) between 3 and 2000),exige_validade boolean not null,
 profissional_id uuid not null,created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,nome,numero),foreign key(organization_id,profissional_id) references public.pessoas(organization_id,id)
);
create table public.ferramentas(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null references public.organizations(id),patrimonio text not null check(length(trim(patrimonio)) between 1 and 80),descricao text not null check(length(trim(descricao)) between 3 and 240),
 produto_id uuid,local_id uuid not null,proprietario text not null check(proprietario in ('nexus','terceiro')),proprietario_nome text check(length(proprietario_nome)<=200),
 condicao text not null default 'disponivel' check(condicao in ('disponivel','avariada','quarentena','manutencao','desativada')),exige_calibracao boolean not null default false,politica_calibracao_id uuid,
 version integer not null default 1,created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,patrimonio),check(proprietario<>'terceiro' or length(trim(proprietario_nome))>1),check(not exige_calibracao or politica_calibracao_id is not null),
 foreign key(organization_id,produto_id) references public.produtos(organization_id,id),foreign key(organization_id,local_id) references public.almoxarifados(organization_id,id),foreign key(organization_id,politica_calibracao_id) references public.ferramenta_calibracao_politicas(organization_id,id)
);
create table public.ferramenta_custodias(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,ferramenta_id uuid not null,pessoa_id uuid not null,agenda_evento_id uuid,
 inicio timestamptz not null,fim timestamptz not null,timezone text not null default 'America/Sao_Paulo',estado text not null default 'reservada' check(estado in ('reservada','retirada','devolvida','cancelada')),
 retirada_em timestamptz,devolvida_em timestamptz,condicao_devolucao text check(condicao_devolucao in ('disponivel','avariada','quarentena','manutencao','desativada')),motivo text,
 version integer not null default 1,created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(fim>inicio),
 unique(organization_id,id),foreign key(organization_id,ferramenta_id) references public.ferramentas(organization_id,id),foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id),foreign key(organization_id,agenda_evento_id) references public.agenda_eventos(organization_id,id)
);
create index ferramenta_reservas_periodo on public.ferramenta_custodias(organization_id,ferramenta_id,inicio,fim) where estado in ('reservada','retirada');
create table public.ferramenta_calibracoes(
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,ferramenta_id uuid not null,politica_id uuid not null,emissor text not null check(length(trim(emissor)) between 2 and 200),
 execucao date not null,validade date,referencia text check(length(referencia)<=1000),estado text not null default 'enviada' check(estado in ('enviada','em_conferencia','validada','revogada')),
 motivo text,conferido_por uuid references auth.users(id),conferido_em timestamptz,version integer not null default 1,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check(validade is null or validade>=execucao),
 unique(organization_id,id),foreign key(organization_id,ferramenta_id) references public.ferramentas(organization_id,id),foreign key(organization_id,politica_id) references public.ferramenta_calibracao_politicas(organization_id,id)
);

create function public.alm_gerir(_org uuid) returns boolean language sql stable security definer set search_path='' as $$select public.operacao_pode(_org,'gerir_operacao') or public.pode(_org,'receber')$$;
create function public.alm_decimal(_valor jsonb,_positivo boolean default false) returns numeric language plpgsql immutable set search_path='' as $$
declare t text;v numeric;begin
 if jsonb_typeof(_valor) is distinct from 'string' or length(_valor#>>'{}')>40 then raise exception 'Informe quantidade decimal em texto.' using errcode='23514';end if;
 t:=_valor#>>'{}';if t !~ '^[0-9]{1,12}([.][0-9]{1,6})?$' then raise exception 'Quantidade exige até 12 inteiros e seis casas decimais.' using errcode='23514';end if;
 v:=t::numeric;if _positivo and v<=0 then raise exception 'Quantidade deve ser positiva.' using errcode='23514';end if;return v;
end$$;

-- Estorno físico e saldo legado pertencem à mesma transação de registrar_movimento.
-- Uma origem só pode perder quantidades ainda presentes e sem reserva; outra compra não a substitui.
create function public.alm_integrar_estorno() returns trigger language plpgsql security definer set search_path='' as $$
declare origem uuid:=new.estorno_de;tipo text:=tg_table_name;original numeric;anteriores numeric;conferido numeric;retornado numeric;nao_conferido numeric;resta numeric;fator numeric;produto uuid;op uuid;linha record;parte numeric;livre numeric;
begin
 if new.sinal<>-1 then return new;end if;
 perform public.alm_travar(new.organization_id);
 if tipo='recebimentos' then
 select r.quantidade into original from public.recebimentos r where r.organization_id=new.organization_id and r.id=origem and r.sinal=1 for update;
 select coalesce(sum(r.quantidade),0) into anteriores from public.recebimentos r where r.organization_id=new.organization_id and r.estorno_de=origem and r.sinal=-1 and r.id<>new.id;
 else
 select r.quantidade into original from public.apontamentos r where r.organization_id=new.organization_id and r.id=origem and r.sinal=1 for update;
 select coalesce(sum(r.quantidade),0) into anteriores from public.apontamentos r where r.organization_id=new.organization_id and r.estorno_de=origem and r.sinal=-1 and r.id<>new.id;
 end if;
 if original is null then raise exception 'Origem do estorno indisponível.' using errcode='23514';end if;
 select coalesce(sum(c.quantidade),0),min(c.fator),min(c.produto_id::text)::uuid into conferido,fator,produto from public.estoque_conferencias c where c.organization_id=new.organization_id and (case when tipo='recebimentos' then c.recebimento_id=origem else c.apontamento_id=origem end);
 if conferido=0 then return new;end if;
 select coalesce(sum(a.quantidade)/min(c.fator),0) into retornado from public.estoque_estorno_alocacoes a join public.estoque_conferencias c on c.organization_id=a.organization_id and c.id=a.conferencia_id where c.organization_id=new.organization_id and (case when tipo='recebimentos' then c.recebimento_id=origem else c.apontamento_id=origem end);
 nao_conferido:=greatest(0,original-anteriores-conferido+retornado);resta:=greatest(0,new.quantidade-nao_conferido)*fator;
 if resta=0 then return new;end if;
 perform public.alm_produto_fracao(new.organization_id,produto,resta);
 insert into public.estoque_operacoes(organization_id,tipo,recebimento_estorno_id,apontamento_estorno_id,motivo) values(new.organization_id,'estorno',case when tipo='recebimentos' then new.id end,case when tipo='apontamentos' then new.id end,'Estorno vinculado ao evento físico original') returning id into op;
 for linha in select m.conferencia_id,m.local_id,m.posicao,sum(m.quantidade) saldo,min(c.created_at) entrada from public.estoque_movimentos m join public.estoque_conferencias c on c.organization_id=m.organization_id and c.id=m.conferencia_id where m.organization_id=new.organization_id and m.posicao in ('aceito','quarentena','rejeitado') and (case when tipo='recebimentos' then c.recebimento_id=origem else c.apontamento_id=origem end) group by m.conferencia_id,m.local_id,m.posicao having sum(m.quantidade)>0 order by entrada,m.conferencia_id,m.local_id,m.posicao loop
 livre:=case when linha.posicao='aceito' then public.alm_livre_lote(new.organization_id,linha.conferencia_id,linha.local_id) else linha.saldo end;
 parte:=least(resta,greatest(0,livre));if parte>0 then
 perform public.alm_movimento(new.organization_id,op,produto,linha.conferencia_id,linha.local_id,null,null,linha.posicao,-parte);
 insert into public.estoque_estorno_alocacoes(organization_id,operacao_id,conferencia_id,quantidade) values(new.organization_id,op,linha.conferencia_id,parte);resta:=resta-parte;
 end if;exit when resta=0;end loop;
 if resta<>0 then raise exception 'Estorno bloqueado: a origem possui material reservado, em poder da equipe ou consumido. Devolva/libere a origem antes de estornar.' using errcode='23514';end if;
 return new;
end$$;
create function public.alm_imutavel() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Evento confirmado é imutável; use correção rastreável.' using errcode='23514';end$$;
create trigger alm_recebimento_estorno after insert on public.recebimentos for each row execute function public.alm_integrar_estorno();
create trigger alm_apontamento_estorno after insert on public.apontamentos for each row execute function public.alm_integrar_estorno();
create trigger alm_recebimento_imutavel before update or delete on public.recebimentos for each row execute function public.alm_imutavel();
create trigger alm_apontamento_imutavel before update or delete on public.apontamentos for each row execute function public.alm_imutavel();

create function public.alm_executar_ferramenta(_org uuid,_comando text,_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
<<alm_executar_ferramenta>>
declare f public.ferramentas;c public.ferramenta_custodias;cal public.ferramenta_calibracoes;pol public.ferramenta_calibracao_politicas;fid uuid;cid uuid;novo uuid;prof uuid;ini timestamptz;fim timestamptz;tz text;cond text;mot text;v integer;begin
 fid:=nullif(_dados->>'ferramenta_id','')::uuid;cid:=nullif(_dados->>'custodia_id','')::uuid;
 if cid is not null then select ferramenta_id into fid from public.ferramenta_custodias where organization_id=_org and id=cid;end if;
 if _comando='conferir_calibracao' then select ferramenta_id into fid from public.ferramenta_calibracoes where organization_id=_org and id=(_dados->>'calibracao_id')::uuid;end if;
 if fid is not null then
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nexus-ferramenta:'||_org::text||fid::text,0));
 select * into f from public.ferramentas where organization_id=_org and id=fid for update;if not found then raise exception 'Ferramenta indisponível.' using errcode='42501';end if;
 end if;
 if _comando='publicar_politica_calibracao' then
 perform public.alm_validar_payload(_dados,array['nome','metodo','fonte','exige_validade']);prof:=public.est_profissional(_org,auth.uid());
 if prof is null then raise exception 'Profissional autorizado e registro declarado são necessários.' using errcode='42501';end if;
 if jsonb_typeof(_dados->'exige_validade') is distinct from 'boolean' then raise exception 'Informe a política de validade.' using errcode='23514';end if;
 select coalesce(max(numero),0)+1 into v from public.ferramenta_calibracao_politicas where organization_id=_org and nome=public.alm_texto(_dados,'nome',120,3);
 insert into public.ferramenta_calibracao_politicas(organization_id,nome,numero,metodo,fonte,exige_validade,profissional_id) values(_org,public.alm_texto(_dados,'nome',120,3),v,public.alm_texto(_dados,'metodo',4000,3),public.alm_texto(_dados,'fonte',2000,3),(_dados->>'exige_validade')::boolean,prof) returning id into novo;
 return public.alm_obter(_org,'politicas_calibracao',novo);
 elsif _comando='salvar_ferramenta' then
 perform public.alm_validar_payload(_dados,array['ferramenta_id','expected_version','patrimonio','descricao','produto_id','local_id','proprietario','proprietario_nome','exige_calibracao','politica_calibracao_id']);
 if not exists(select 1 from public.almoxarifados where organization_id=_org and id=(_dados->>'local_id')::uuid and ativo) then raise exception 'Local ativo é necessário.' using errcode='23514';end if;
 if jsonb_typeof(_dados->'exige_calibracao') is distinct from 'boolean' then raise exception 'Informe necessidade de calibração.' using errcode='23514';end if;
 if fid is null then
 insert into public.ferramentas(organization_id,patrimonio,descricao,produto_id,local_id,proprietario,proprietario_nome,exige_calibracao,politica_calibracao_id) values(_org,public.alm_texto(_dados,'patrimonio',80,1),public.alm_texto(_dados,'descricao',240,3),nullif(_dados->>'produto_id','')::uuid,(_dados->>'local_id')::uuid,_dados->>'proprietario',nullif(public.alm_texto(_dados,'proprietario_nome',200),''),(_dados->>'exige_calibracao')::boolean,nullif(_dados->>'politica_calibracao_id','')::uuid) returning id into fid;
 else
 if f.version is distinct from (_dados->>'expected_version')::integer then raise exception 'Versão da ferramenta mudou.' using errcode='40001';end if;
 if exists(select 1 from public.ferramenta_custodias where organization_id=_org and ferramenta_id=fid and estado='retirada') and (f.local_id is distinct from (_dados->>'local_id')::uuid or f.produto_id is distinct from nullif(_dados->>'produto_id','')::uuid) then raise exception 'Confira e devolva a ferramenta antes de mudar local/modelo.' using errcode='23514';end if;
 update public.ferramentas set patrimonio=public.alm_texto(_dados,'patrimonio',80,1),descricao=public.alm_texto(_dados,'descricao',240,3),produto_id=nullif(_dados->>'produto_id','')::uuid,local_id=(_dados->>'local_id')::uuid,proprietario=_dados->>'proprietario',proprietario_nome=nullif(public.alm_texto(_dados,'proprietario_nome',200),''),exige_calibracao=(_dados->>'exige_calibracao')::boolean,politica_calibracao_id=nullif(_dados->>'politica_calibracao_id','')::uuid where id=fid;
 end if;
 elsif _comando='alterar_condicao' then
 perform public.alm_validar_payload(_dados,array['ferramenta_id','expected_version','condicao','motivo']);if f.version is distinct from (_dados->>'expected_version')::integer then raise exception 'Versão da ferramenta mudou.' using errcode='40001';end if;
 mot:=public.alm_texto(_dados,'motivo',2000,3);update public.ferramentas set condicao=_dados->>'condicao' where id=fid;
 insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,motivo) values(_org,'ferramentas',fid,'condicao',mot);
 elsif _comando='reservar_ferramenta' then
 perform public.alm_validar_payload(_dados,array['ferramenta_id','expected_version','pessoa_id','inicio','fim','timezone','agenda_evento_id']);if f.version is distinct from (_dados->>'expected_version')::integer then raise exception 'Versão da ferramenta mudou.' using errcode='40001';end if;
 if coalesce(_dados->>'inicio','')!~'(Z|[+-][0-9]{2}:[0-9]{2})$' or coalesce(_dados->>'fim','')!~'(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Informe instantes com fuso horário explícito.' using errcode='23514';end if;
 ini:=(_dados->>'inicio')::timestamptz;fim:=(_dados->>'fim')::timestamptz;if fim<=ini or ini<now()-interval '1 minute' then raise exception 'Período futuro válido é necessário.' using errcode='23514';end if;
 tz:=coalesce(nullif(public.alm_texto(_dados,'timezone',80),''),'America/Sao_Paulo');if not exists(select 1 from pg_catalog.pg_timezone_names where name=tz) then raise exception 'Fuso IANA inválido.' using errcode='23514';end if;
 if nullif(_dados->>'agenda_evento_id','') is not null then
 perform 1 from public.agenda_eventos e where e.organization_id=_org and e.id=(_dados->>'agenda_evento_id')::uuid for share;
 if not exists(select 1 from public.agenda_eventos e where e.organization_id=_org and e.id=(_dados->>'agenda_evento_id')::uuid and public.agenda_ler_evento(_org,e.id) and e.estado<>'cancelado' and e.timezone=tz and alm_executar_ferramenta.ini>=e.inicio and alm_executar_ferramenta.fim<=e.fim and exists(select 1 from public.agenda_participantes pa where pa.organization_id=_org and pa.evento_id=e.id and pa.pessoa_id=(_dados->>'pessoa_id')::uuid and pa.vigente)) then raise exception 'Reserva deve corresponder ao fuso, período e participante do evento autorizado.' using errcode='23514';end if;
 end if;
 perform public.alm_ferramenta_liberada(_org,fid,ini,fim,tz);
 if not exists(select 1 from public.pessoas where organization_id=_org and id=(_dados->>'pessoa_id')::uuid and ativa) then raise exception 'Pessoa ativa é necessária.' using errcode='23514';end if;
 if exists(select 1 from public.ferramenta_custodias fc where fc.organization_id=_org and fc.ferramenta_id=fid and (fc.estado='retirada' or (fc.estado='reservada' and fc.inicio<alm_executar_ferramenta.fim and alm_executar_ferramenta.ini<fc.fim))) then raise exception 'Ferramenta já reservada ou em poder de outra custódia.' using errcode='23514';end if;
 insert into public.ferramenta_custodias(organization_id,ferramenta_id,pessoa_id,inicio,fim,timezone,agenda_evento_id) values(_org,fid,(_dados->>'pessoa_id')::uuid,ini,fim,tz,nullif(_dados->>'agenda_evento_id','')::uuid);
 update public.ferramentas set updated_at=now() where id=fid;
 elsif _comando in ('retirar_ferramenta','devolver_ferramenta','cancelar_custodia') then
 perform public.alm_validar_payload(_dados,case when _comando='devolver_ferramenta' then array['custodia_id','expected_version','condicao','motivo'] else array['custodia_id','expected_version','motivo'] end);
 select * into c from public.ferramenta_custodias where organization_id=_org and id=cid for update;
 if not found or not(public.alm_gerir(_org) or public.operacao_minha_pessoa(_org,c.pessoa_id)) then raise exception 'Acesso negado.' using errcode='42501';end if;
 if c.version is distinct from (_dados->>'expected_version')::integer then raise exception 'Versão da custódia mudou.' using errcode='40001';end if;
 if _comando='retirar_ferramenta' then
 if c.estado<>'reservada' or c.inicio>now()+interval '1 minute' or c.fim<=now() then raise exception 'Custódia não está na janela de retirada.' using errcode='23514';end if;
 perform public.alm_ferramenta_liberada(_org,fid,now(),c.fim,c.timezone);
 if exists(select 1 from public.ferramenta_custodias where organization_id=_org and ferramenta_id=fid and estado='retirada' and id<>c.id) then raise exception 'Ferramenta ainda não devolvida.' using errcode='23514';end if;
 update public.ferramenta_custodias set estado='retirada',retirada_em=now() where id=c.id;
 elsif _comando='devolver_ferramenta' then
 if c.estado<>'retirada' then raise exception 'Somente custódia retirada aceita devolução.' using errcode='23514';end if;
 cond:=_dados->>'condicao';mot:=public.alm_texto(_dados,'motivo',2000,case when cond<>'disponivel' then 3 else 0 end);
 update public.ferramenta_custodias set estado='devolvida',devolvida_em=now(),condicao_devolucao=cond,motivo=nullif(mot,'') where id=c.id;
 update public.ferramentas set condicao=cond where id=fid;
 else
 if c.estado<>'reservada' then raise exception 'Devolva a ferramenta antes de cancelar.' using errcode='23514';end if;
 update public.ferramenta_custodias set estado='cancelada',motivo=public.alm_texto(_dados,'motivo',2000,3) where id=c.id;
 end if;
 elsif _comando='registrar_calibracao' then
 perform public.alm_validar_payload(_dados,array['ferramenta_id','politica_id','emissor','execucao','validade','referencia']);
 select * into pol from public.ferramenta_calibracao_politicas where organization_id=_org and id=(_dados->>'politica_id')::uuid;if not found then raise exception 'Política indisponível.' using errcode='42501';end if;
 if pol.exige_validade and nullif(_dados->>'validade','') is null then raise exception 'A política exige validade explícita.' using errcode='23514';end if;
 if (_dados->>'execucao')::date>current_date then raise exception 'Execução futura não comprova calibração.' using errcode='23514';end if;
 insert into public.ferramenta_calibracoes(organization_id,ferramenta_id,politica_id,emissor,execucao,validade,referencia) values(_org,fid,pol.id,public.alm_texto(_dados,'emissor',200,2),(_dados->>'execucao')::date,nullif(_dados->>'validade','')::date,nullif(public.alm_texto(_dados,'referencia',1000),''));
 elsif _comando='conferir_calibracao' then
 perform public.alm_validar_payload(_dados,array['calibracao_id','expected_version','estado','motivo']);
 select * into cal from public.ferramenta_calibracoes where organization_id=_org and id=(_dados->>'calibracao_id')::uuid for update;
 if not found then raise exception 'Calibração indisponível.' using errcode='42501';end if;
 if cal.version is distinct from (_dados->>'expected_version')::integer then raise exception 'Versão da calibração mudou.' using errcode='40001';end if;
 cond:=_dados->>'estado';if not ((cal.estado='enviada' and cond='em_conferencia') or (cal.estado='em_conferencia' and cond in ('validada','revogada')) or (cal.estado='validada' and cond='revogada')) then raise exception 'Transição de conferência não permitida.' using errcode='23514';end if;
 if public.est_profissional(_org,auth.uid()) is null then raise exception 'Conferência exige profissional autorizado.' using errcode='42501';end if;
 if cond='validada' and not exists(select 1 from public.anexos where organization_id=_org and calibracao_id=cal.id and estado='vinculado') then raise exception 'Anexe o certificado privado antes de validar.' using errcode='23514';end if;
 if cond='validada' and exists(select 1 from public.anexos where organization_id=_org and calibracao_id=cal.id and estado in ('pendente','enviado')) then raise exception 'Conclua ou cancele uploads pendentes.' using errcode='23514';end if;
 update public.ferramenta_calibracoes set estado=cond,motivo=nullif(public.alm_texto(_dados,'motivo',2000,case when cond='revogada' then 3 else 0 end),''),conferido_por=case when cond in ('validada','revogada') then auth.uid() else conferido_por end,conferido_em=case when cond in ('validada','revogada') then now() else conferido_em end where id=cal.id;
 else raise exception 'Comando não reconhecido.' using errcode='23514';end if;
 return public.alm_obter(_org,'ferramentas',fid);
end$$;
create function public.alm_travar(_org uuid) returns void language sql volatile security definer set search_path='' as $$select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nexus-estoque:'||_org::text,0))$$;
create function public.alm_ler_reserva(_org uuid,_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.operacao_pode(_org,'ver_operacao') and exists(select 1 from public.estoque_reservas r where r.organization_id=_org and r.id=_id and (public.alm_gerir(_org) or public.operacao_minha_pessoa(_org,r.pessoa_id)))$$;
create function public.alm_autor_ler_ferramenta(_org uuid,_id uuid,_autor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.operacao_autor_pode(_org,_autor,'ver_operacao') and exists(select 1 from public.ferramentas f where f.organization_id=_org and f.id=_id and (
 public.operacao_autor_pode(_org,_autor,'gerir_operacao') or (exists(select 1 from public.user_roles r where r.organization_id=_org and r.user_id=_autor and r.role in ('admin','engenharia','compras'))) or exists(
 select 1 from public.ferramenta_custodias c join public.pessoas p on p.organization_id=c.organization_id and p.id=c.pessoa_id where c.organization_id=_org and c.ferramenta_id=f.id and(c.estado in('retirada','devolvida') or(c.estado='reservada' and c.fim>now())) and p.ativa and p.user_id=_autor)))$$;
create function public.alm_ler_ferramenta(_org uuid,_id uuid) returns boolean language sql stable security definer set search_path='' as $$select public.alm_autor_ler_ferramenta(_org,_id,auth.uid())$$;
create function public.alm_permissoes(_org uuid) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('ler',public.operacao_pode(_org,'ver_operacao'),'gerir',public.alm_gerir(_org),'conferir',public.pode(_org,'receber'),'reservar',public.alm_gerir(_org),'aprovar_ajuste',public.pode(_org,'receber'),'publicar_politica_calibracao',public.est_profissional(_org,auth.uid()) is not null)$$;

-- Só consultas operacionais autorizadas, sem custo, preço, aquisição ou total comercial.
create function public.alm_saldo(_org uuid,_produto uuid,_local uuid default null,_conferencia uuid default null) returns jsonb language sql stable security definer set search_path='' as $$
 with b as(select coalesce(sum(m.quantidade) filter(where m.posicao='aceito'),0) a,coalesce(sum(m.quantidade) filter(where m.posicao='quarentena'),0) q,
 coalesce(sum(m.quantidade) filter(where m.posicao='rejeitado'),0) j,coalesce(sum(m.quantidade) filter(where m.posicao='em_poder'),0) p,coalesce(sum(m.quantidade) filter(where m.posicao='consumido'),0) c
 from public.estoque_movimentos m where m.organization_id=_org and m.produto_id=_produto and (_local is null or m.local_id=_local or (m.local_id is null and exists(select 1 from public.estoque_reservas z where z.organization_id=m.organization_id and z.id=m.reserva_id and z.local_id=_local))) and (_conferencia is null or m.conferencia_id=_conferencia)),
 r as(select coalesce(sum(greatest(0,i.quantidade-coalesce((select -sum(m.quantidade) from public.estoque_movimentos m join public.estoque_operacoes o on o.organization_id=m.organization_id and o.id=m.operacao_id where m.organization_id=_org and m.reserva_id=r.id and m.conferencia_id=i.conferencia_id and m.posicao='aceito' and o.tipo='retirada'),0))),0) n
 from public.estoque_reserva_itens i join public.estoque_reservas r on r.organization_id=i.organization_id and r.id=i.reserva_id where r.organization_id=_org and r.produto_id=_produto and r.estado in ('ativa','retirada') and r.validade>now() and (_local is null or r.local_id=_local) and (_conferencia is null or i.conferencia_id=_conferencia))
 select jsonb_build_object('fisico',(a+q+j+p)::text,'aceito',a::text,'quarentena',q::text,'rejeitado',j::text,'em_poder',p::text,'consumido',c::text,'reservado',n::text,'disponivel',greatest(0,a-n)::text) from b,r$$;
create function public.alm_reserva_quantidades(_org uuid,_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with x as(select coalesce(-sum(m.quantidade) filter(where m.posicao='aceito' and o.tipo='retirada'),0) retirada,coalesce(sum(m.quantidade) filter(where m.posicao='consumido'),0) consumida,coalesce(sum(m.quantidade) filter(where m.posicao='aceito' and o.tipo='devolucao'),0) devolvida,coalesce(sum(m.quantidade) filter(where m.posicao='em_poder'),0) poder from public.estoque_movimentos m join public.estoque_operacoes o on o.organization_id=m.organization_id and o.id=m.operacao_id where m.organization_id=_org and m.reserva_id=_id)
 select jsonb_build_object('quantidade',r.quantidade::text,'reservada',case when r.estado in ('ativa','retirada') and r.validade>now() then greatest(0,r.quantidade-x.retirada)::text else '0' end,'retirada',x.retirada::text,'consumida',x.consumida::text,'devolvida',x.devolvida::text,'em_poder',x.poder::text,'pendente_retirada',greatest(0,r.quantidade-x.retirada)::text) from public.estoque_reservas r,x where r.organization_id=_org and r.id=_id$$;
create function public.alm_livre_lote(_org uuid,_conferencia uuid,_local uuid) returns numeric language sql stable security definer set search_path='' as $$
 select coalesce((select sum(m.quantidade) from public.estoque_movimentos m where m.organization_id=_org and m.conferencia_id=_conferencia and m.local_id=_local and m.posicao='aceito'),0)-coalesce((select sum(greatest(0,i.quantidade-coalesce((select -sum(m.quantidade) from public.estoque_movimentos m join public.estoque_operacoes o on o.organization_id=m.organization_id and o.id=m.operacao_id where m.organization_id=_org and m.reserva_id=r.id and m.conferencia_id=i.conferencia_id and m.posicao='aceito' and o.tipo='retirada'),0))) from public.estoque_reserva_itens i join public.estoque_reservas r on r.organization_id=i.organization_id and r.id=i.reserva_id where i.organization_id=_org and i.conferencia_id=_conferencia and r.local_id=_local and r.estado in ('ativa','retirada') and r.validade>now()),0)$$;

-- Nenhuma política permissiva histórica deve permitir custos via aquisição a Campo.
drop policy "membros leem aquisicoes" on public.aquisicoes;
create policy "custos autorizados leem aquisicoes" on public.aquisicoes for select to authenticated using(public.pode(organization_id,'ver_custos'));

do $$declare t text;begin
 foreach t in array array['estoque_conferencias','estoque_reserva_itens','estoque_operacoes','estoque_movimentos','estoque_estorno_alocacoes','ferramenta_calibracao_politicas'] loop
 execute format('create trigger alm_imutavel before update or delete on public.%I for each row execute function public.alm_imutavel()',t);end loop;
 foreach t in array array['almoxarifados','estoque_produto_politicas','estoque_inventarios','estoque_reservas','ferramentas','ferramenta_custodias','ferramenta_calibracoes'] loop
 execute format('create trigger alm_guard before update on public.%I for each row execute function public.operacao_guard()',t);
 execute format('create trigger alm_audit after insert or update on public.%I for each row execute function public.operacao_audit()',t);end loop;
 foreach t in array array['almoxarifados','estoque_produto_politicas','estoque_inventarios','estoque_conferencias','estoque_reservas','estoque_reserva_itens','estoque_operacoes','estoque_movimentos','estoque_estorno_alocacoes','ferramentas','ferramenta_custodias','ferramenta_calibracoes','ferramenta_calibracao_politicas'] loop
 execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated,service_role',t);execute format('grant select on public.%I to authenticated',t);end loop;
end$$;
create policy ler on public.almoxarifados for select to authenticated using(public.operacao_pode(organization_id,'ver_operacao'));
create policy ler on public.estoque_produto_politicas for select to authenticated using(public.operacao_pode(organization_id,'ver_operacao'));
create policy ler on public.estoque_inventarios for select to authenticated using(public.alm_gerir(organization_id));
create policy ler on public.estoque_conferencias for select to authenticated using(public.alm_gerir(organization_id));
create policy ler on public.estoque_reservas for select to authenticated using(public.alm_ler_reserva(organization_id,id));
create policy ler on public.estoque_reserva_itens for select to authenticated using(public.alm_ler_reserva(organization_id,reserva_id));
create policy ler on public.estoque_movimentos for select to authenticated using(public.alm_gerir(organization_id) or (reserva_id is not null and public.alm_ler_reserva(organization_id,reserva_id)));
create policy ler on public.estoque_operacoes for select to authenticated using(public.alm_gerir(organization_id) or (reserva_id is not null and public.alm_ler_reserva(organization_id,reserva_id)));
create policy ler on public.estoque_estorno_alocacoes for select to authenticated using(public.alm_gerir(organization_id));
create policy ler on public.ferramentas for select to authenticated using(public.alm_ler_ferramenta(organization_id,id));
create policy ler on public.ferramenta_custodias for select to authenticated using(public.alm_ler_ferramenta(organization_id,ferramenta_id) and(public.alm_gerir(organization_id) or public.operacao_minha_pessoa(organization_id,pessoa_id)));
create policy ler on public.ferramenta_calibracoes for select to authenticated using(public.alm_ler_ferramenta(organization_id,ferramenta_id));
create policy ler on public.ferramenta_calibracao_politicas for select to authenticated using(public.operacao_pode(organization_id,'ver_operacao'));

create function public.alm_texto(_dados jsonb,_campo text,_max integer,_min integer default 0) returns text language plpgsql immutable set search_path='' as $$
declare v text;begin
 if _dados?_campo and _dados->_campo<>'null'::jsonb and jsonb_typeof(_dados->_campo)<>'string' then raise exception 'Campo % deve ser texto.',_campo using errcode='23514';end if;
 v:=trim(coalesce(_dados->>_campo,''));if length(v)<_min or length(v)>_max then raise exception 'Campo % deve ter entre % e % caracteres.',_campo,_min,_max using errcode='23514';end if;return v;
end$$;
create function public.alm_validar_payload(_dados jsonb,_campos text[]) returns void language plpgsql immutable set search_path='' as $$begin
 if jsonb_typeof(_dados) is distinct from 'object' or exists(select 1 from jsonb_object_keys(_dados) k where not k=any(_campos)) then raise exception 'Contrato de comando inválido.' using errcode='23514';end if;
end$$;
create function public.alm_produto_json(_org uuid,_id uuid) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('id',p.id,'codigo',p.codigo,'descricao',p.descricao,'unidade',p.unidade,'indivisivel',p.indivisivel) from public.produtos p where p.organization_id=_org and p.id=_id$$;
create function public.alm_ler_produto(_org uuid,_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.operacao_pode(_org,'ver_operacao') and exists(select 1 from public.produtos p where p.organization_id=_org and p.id=_id) and(public.alm_gerir(_org) or exists(select 1 from public.estoque_reservas r where r.organization_id=_org and r.produto_id=_id and public.operacao_minha_pessoa(_org,r.pessoa_id)))$$;
create function public.alm_produto_fracao(_org uuid,_id uuid,_quantidade numeric) returns void language plpgsql stable security definer set search_path='' as $$begin
 if _quantidade<>trunc(_quantidade,6) or _quantidade<0 or _quantidade>=1000000000000 or _quantidade='NaN'::numeric then raise exception 'Quantidade não é representável com seis casas decimais.' using errcode='23514';end if;
 if not exists(select 1 from public.produtos where organization_id=_org and id=_id) then raise exception 'Produto indisponível.' using errcode='42501';end if;
 if _quantidade<>trunc(_quantidade) and exists(select 1 from public.produtos where organization_id=_org and id=_id and indivisivel) then raise exception 'Produto indivisível exige quantidade inteira.' using errcode='23514';end if;
end$$;
create function public.alm_movimento(_org uuid,_op uuid,_produto uuid,_conferencia uuid,_local uuid,_reserva uuid,_pessoa uuid,_posicao text,_quantidade numeric) returns void language plpgsql security definer set search_path='' as $$begin
 if _quantidade<>0 then insert into public.estoque_movimentos(organization_id,operacao_id,produto_id,conferencia_id,local_id,reserva_id,pessoa_id,posicao,quantidade) values(_org,_op,_produto,_conferencia,_local,_reserva,_pessoa,_posicao,_quantidade);end if;
end$$;
create function public.alm_row(_org uuid,_tipo text,_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare j jsonb;begin
 if _tipo='locais' then select to_jsonb(x) into j from public.almoxarifados x where organization_id=_org and id=_id;
 elsif _tipo='materiais' then
 select jsonb_build_object('id',p.id,'produto',public.alm_produto_json(_org,p.id),'politica',coalesce((select jsonb_build_object('exige_lote',s.exige_lote,'exige_serie',s.exige_serie,'estoque_minimo',s.estoque_minimo::text,'version',s.version) from public.estoque_produto_politicas s where s.organization_id=_org and s.produto_id=p.id),'{"exige_lote":false,"exige_serie":false,"estoque_minimo":"0","version":0}'::jsonb),'saldo',public.alm_saldo(_org,p.id)) into j from public.produtos p where p.organization_id=_org and p.id=_id;
 elsif _tipo='conferencias' then
 select (to_jsonb(c)-array['quantidade','fator','aceita','quarentena','rejeitada'])||jsonb_build_object('quantidade',c.quantidade::text,'fator',c.fator::text,'aceita',c.aceita::text,'quarentena',c.quarentena::text,'rejeitada',c.rejeitada::text,'produto',public.alm_produto_json(_org,c.produto_id),'local_nome',l.nome) into j from public.estoque_conferencias c join public.almoxarifados l on l.organization_id=c.organization_id and l.id=c.local_id where c.organization_id=_org and c.id=_id;
 elsif _tipo='reservas' then
 select (to_jsonb(r)-'quantidade')||jsonb_build_object('produto',public.alm_produto_json(_org,r.produto_id),'local_nome',l.nome,'pessoa_nome',p.nome,'projeto_nome',pr.codigo,'op_numero',op.numero,'quantidades',public.alm_reserva_quantidades(_org,r.id)) into j from public.estoque_reservas r join public.almoxarifados l on l.organization_id=r.organization_id and l.id=r.local_id join public.pessoas p on p.organization_id=r.organization_id and p.id=r.pessoa_id left join public.projetos pr on pr.organization_id=r.organization_id and pr.id=r.projeto_id left join public.ordens_producao op on op.organization_id=r.organization_id and op.id=r.op_id where r.organization_id=_org and r.id=_id;
 elsif _tipo='movimentos' then
 select (to_jsonb(m)-array['quantidade','operacao_id','seq'])||jsonb_build_object('produto',public.alm_produto_json(_org,m.produto_id),'local_nome',l.nome,'operacao',o.tipo,'motivo',o.motivo,'quantidade',m.quantidade::text) into j from public.estoque_movimentos m join public.estoque_operacoes o on o.organization_id=m.organization_id and o.id=m.operacao_id left join public.almoxarifados l on l.organization_id=m.organization_id and l.id=m.local_id where m.organization_id=_org and m.id=_id;
 elsif _tipo='inventarios' then
 select (to_jsonb(i)-array['contada','baseline','ledger_id'])||jsonb_build_object('contada',i.contada::text,'baseline',i.baseline::text,'diferenca',(i.contada-i.baseline)::text,'produto',public.alm_produto_json(_org,i.produto_id),'local_nome',l.nome) into j from public.estoque_inventarios i join public.almoxarifados l on l.organization_id=i.organization_id and l.id=i.local_id where i.organization_id=_org and i.id=_id;
 elsif _tipo='politicas_calibracao' then select to_jsonb(p) into j from public.ferramenta_calibracao_politicas p where organization_id=_org and id=_id;
 elsif _tipo='ferramentas' then
 select to_jsonb(f)||jsonb_build_object('produto',public.alm_produto_json(_org,f.produto_id),'local_nome',l.nome,'disponibilidade',case when f.condicao<>'disponivel' then 'impedida' when exists(select 1 from public.ferramenta_custodias c where c.organization_id=_org and c.ferramenta_id=f.id and c.estado='retirada') then 'em_poder' when exists(select 1 from public.ferramenta_custodias c where c.organization_id=_org and c.ferramenta_id=f.id and c.estado='reservada' and c.fim>now()) then 'reservada' else 'disponivel' end) into j from public.ferramentas f join public.almoxarifados l on l.organization_id=f.organization_id and l.id=f.local_id where f.organization_id=_org and f.id=_id;
 end if;return j;end$$;
create function public.alm_obter(_org uuid,_tipo text,_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare j jsonb;extra jsonb:='{}';edita boolean:=false;executa boolean:=false;ent text;begin
 if not public.operacao_pode(_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _tipo='reservas' then if not public.alm_ler_reserva(_org,_id) then raise exception 'Acesso negado.' using errcode='42501';end if;executa:=true;
 elsif _tipo='materiais' then if not public.alm_ler_produto(_org,_id) then raise exception 'Acesso negado.' using errcode='42501';end if;
 elsif _tipo='ferramentas' then if not public.alm_ler_ferramenta(_org,_id) then raise exception 'Acesso negado.' using errcode='42501';end if;executa:=true;
 elsif _tipo='movimentos' and not public.alm_gerir(_org) then
 if not exists(select 1 from public.estoque_movimentos m where organization_id=_org and id=_id and public.alm_ler_reserva(_org,m.reserva_id)) then raise exception 'Acesso negado.' using errcode='42501';end if;
 elsif _tipo not in ('locais','politicas_calibracao') and not public.alm_gerir(_org) then raise exception 'Acesso negado.' using errcode='42501';end if;
 j:=public.alm_row(_org,_tipo,_id);if j is null then raise exception 'Registro indisponível.' using errcode='42501';end if;
 edita:=public.alm_gerir(_org) and _tipo in ('locais','materiais','ferramentas');
 if _tipo='materiais' then
 select jsonb_build_object('lotes',coalesce(jsonb_agg(jsonb_build_object('conferencia_id',x.conferencia_id,'local_id',x.local_id,'local_nome',x.nome,'lote',x.lote,'serie',x.serie,'saldo',public.alm_saldo(_org,_id,x.local_id,x.conferencia_id)) order by x.nome,x.conferencia_id),'[]')) into extra from(select distinct m.conferencia_id,m.local_id,l.nome,c.lote,c.serie from public.estoque_movimentos m join public.estoque_conferencias c on c.organization_id=m.organization_id and c.id=m.conferencia_id join public.almoxarifados l on l.organization_id=m.organization_id and l.id=m.local_id where m.organization_id=_org and m.produto_id=_id and m.local_id is not null) x;
 elsif _tipo='reservas' then
 select jsonb_build_object('alocacoes',coalesce(jsonb_agg(jsonb_build_object('conferencia_id',i.conferencia_id,'quantidade',i.quantidade::text,'retirada',coalesce((select -sum(m.quantidade) from public.estoque_movimentos m join public.estoque_operacoes o on o.organization_id=m.organization_id and o.id=m.operacao_id where m.organization_id=_org and m.reserva_id=_id and m.conferencia_id=i.conferencia_id and m.posicao='aceito' and o.tipo='retirada'),0)::text,'consumida',coalesce((select sum(m.quantidade) from public.estoque_movimentos m where m.organization_id=_org and m.reserva_id=_id and m.conferencia_id=i.conferencia_id and m.posicao='consumido'),0)::text,'devolvida',coalesce((select sum(m.quantidade) from public.estoque_movimentos m join public.estoque_operacoes o on o.organization_id=m.organization_id and o.id=m.operacao_id where m.organization_id=_org and m.reserva_id=_id and m.conferencia_id=i.conferencia_id and m.posicao='aceito' and o.tipo='devolucao'),0)::text)),'[]')) into extra from public.estoque_reserva_itens i where i.organization_id=_org and i.reserva_id=_id;
 elsif _tipo='ferramentas' then
 extra:=jsonb_build_object('custodias',coalesce((select jsonb_agg(to_jsonb(c)||jsonb_build_object('pessoa_nome',p.nome) order by c.inicio desc) from public.ferramenta_custodias c join public.pessoas p on p.organization_id=c.organization_id and p.id=c.pessoa_id where c.organization_id=_org and c.ferramenta_id=_id and (public.alm_gerir(_org) or public.operacao_minha_pessoa(_org,c.pessoa_id))),'[]'),'calibracoes',coalesce((select jsonb_agg(to_jsonb(c) order by c.execucao desc,c.id) from public.ferramenta_calibracoes c where c.organization_id=_org and c.ferramenta_id=_id),'[]'),'politicas',coalesce((select jsonb_agg(to_jsonb(p) order by p.nome,p.numero desc) from public.ferramenta_calibracao_politicas p where p.organization_id=_org),'[]'));
 end if;
 ent:=case _tipo when 'locais' then 'almoxarifados' when 'materiais' then 'estoque_produto_politicas' when 'reservas' then 'estoque_reservas' when 'inventarios' then 'estoque_inventarios' when 'ferramentas' then 'ferramentas' else '' end;
 return jsonb_build_object('tipo',_tipo,'id',_id,'registro',j,'historico',coalesce((select jsonb_agg(jsonb_build_object('id',h.id,'operacao',h.operacao,'motivo',h.motivo,'autor',h.autor,'created_at',h.created_at) order by h.id) from public.operacao_historico h where h.organization_id=_org and h.entidade=ent and h.entidade_id=_id),'[]'),'permissoes',public.alm_permissoes(_org)||jsonb_build_object('editar',edita,'executar',executa))||extra;
end$$;

create function public.alm_ferramenta_liberada(_org uuid,_id uuid,_inicio timestamptz,_fim timestamptz,_timezone text) returns void language plpgsql stable security definer set search_path='' as $$
declare f public.ferramentas;begin
 select * into f from public.ferramentas where organization_id=_org and id=_id;
 if not found or f.condicao<>'disponivel' then raise exception 'Ferramenta indisponível por sua condição atual.' using errcode='23514';end if;
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=_timezone) then raise exception 'Fuso IANA inválido.' using errcode='23514';end if;
 if f.exige_calibracao and not exists(select 1 from public.ferramenta_calibracoes c where c.organization_id=_org and c.ferramenta_id=f.id and c.politica_id=f.politica_calibracao_id and c.estado='validada' and c.execucao<=(_inicio at time zone _timezone)::date and (c.validade is null or c.validade>=((_fim-interval '1 microsecond') at time zone _timezone)::date)) then raise exception 'Calibração conferida conforme a política deve cobrir o serviço planejado.' using errcode='23514';end if;
end$$;

create function public.alm_executar(_org uuid,_chave uuid,_comando text,_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
<<alm_executar>>
declare r jsonb;d jsonb;tipo text;id uuid;pid uuid;lid uuid;dest uuid;eid uuid;item uuid;op uuid;orig text;unidade text;prod_origem uuid;fator numeric;qty numeric;aceita numeric;quar numeric;rej numeric;total numeric;livre numeric;resta numeric;parte numeric;withdrawn numeric;baseline numeric;seq_atual bigint;
 pol public.estoque_produto_politicas;local public.almoxarifados;conf public.estoque_conferencias;res public.estoque_reservas;inv public.estoque_inventarios;linha record;mot text;lote text;serie text;gestor boolean;fid uuid;cid uuid;src_receb uuid;src_apont uuid;payload jsonb:=jsonb_build_object('comando',_comando,'dados',_dados);
begin
 perform public.lev_travar_autor(_org,auth.uid());
 if not public.operacao_pode(_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 gestor:=public.alm_gerir(_org);
 if _comando in ('retirar','consumir','devolver','cancelar_reserva') then
 select * into res from public.estoque_reservas er where er.organization_id=_org and er.id=(_dados->>'reserva_id')::uuid;
 if not found or not(gestor or public.operacao_minha_pessoa(_org,res.pessoa_id)) then raise exception 'Acesso negado.' using errcode='42501';end if;
 elsif _comando in ('retirar_ferramenta','devolver_ferramenta','cancelar_custodia') then
 if not exists(select 1 from public.ferramenta_custodias c where c.organization_id=_org and c.id=(_dados->>'custodia_id')::uuid and (gestor or public.operacao_minha_pessoa(_org,c.pessoa_id))) then raise exception 'Acesso negado.' using errcode='42501';end if;
 elsif not gestor then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _comando in ('conferir_evento','reclassificar_quarentena','aprovar_inventario') and not public.pode(_org,'receber') then raise exception 'Conferência exige capacidade de recebimento.' using errcode='42501';end if;
 if _comando in ('publicar_politica_calibracao','conferir_calibracao') and public.est_profissional(_org,auth.uid()) is null then raise exception 'Profissional autorizado e registro declarado são necessários.' using errcode='42501';end if;
 r:=public.operacao_repetir(_org,_chave,'alm_executar',payload);if r is not null then d:=public.alm_obter(_org,r->>'tipo',(r->>'id')::uuid);return r||jsonb_build_object('detalhe',d);end if;
 if _comando in ('salvar_ferramenta','alterar_condicao','reservar_ferramenta','retirar_ferramenta','devolver_ferramenta','cancelar_custodia','publicar_politica_calibracao','registrar_calibracao','conferir_calibracao') then
 d:=public.alm_executar_ferramenta(_org,_comando,_dados);r:=jsonb_build_object('tipo',d->>'tipo','id',d->>'id','detalhe',d);return public.operacao_concluir(_org,_chave,'alm_executar',payload,r);
 end if;
 if _comando in ('conferir_evento','estornar_evento') then
 if _comando='conferir_evento' then src_receb:=nullif(_dados->>'recebimento_id','')::uuid;src_apont:=nullif(_dados->>'apontamento_id','')::uuid;
 else if _dados->>'tipo'='recebimento' then src_receb:=(_dados->>'evento_id')::uuid;elsif _dados->>'tipo'='apontamento' then src_apont:=(_dados->>'evento_id')::uuid;else raise exception 'Origem inválida.' using errcode='23514';end if;end if;
 if num_nonnulls(src_receb,src_apont)<>1 then raise exception 'Selecione um evento físico de origem.' using errcode='23514';end if;
 if src_receb is not null then
 select i.id,rc.produto_id,rc.unidade into item,prod_origem,unidade from public.recebimentos e join public.ordem_compra_itens i on i.organization_id=e.organization_id and i.id=e.item_id join public.demandas dm on dm.organization_id=i.organization_id and dm.id=i.demanda_id join public.revisao_componentes rc on rc.organization_id=dm.organization_id and rc.id=dm.revisao_componente_id where e.organization_id=_org and e.id=src_receb and e.sinal=1;
 perform 1 from public.ordem_compra_itens oi where oi.organization_id=_org and oi.id=item for update;
 else
 select i.id,rc.produto_id,rc.unidade into item,prod_origem,unidade from public.apontamentos e join public.ordem_producao_itens i on i.organization_id=e.organization_id and i.id=e.item_id join public.demandas dm on dm.organization_id=i.organization_id and dm.id=i.demanda_id join public.revisao_componentes rc on rc.organization_id=dm.organization_id and rc.id=dm.revisao_componente_id where e.organization_id=_org and e.id=src_apont and e.sinal=1;
 perform 1 from public.ordem_producao_itens oi where oi.organization_id=_org and oi.id=item for update;
 end if;
 if item is null then raise exception 'Evento físico indisponível.' using errcode='42501';end if;
 end if;
 perform public.alm_travar(_org);
 if _comando='salvar_local' then
 perform public.alm_validar_payload(_dados,array['local_id','expected_version','nome','descricao','ativo']);id:=nullif(_dados->>'local_id','')::uuid;
 if jsonb_typeof(_dados->'ativo') is distinct from 'boolean' then raise exception 'Informe situação do local.' using errcode='23514';end if;
 if id is null then insert into public.almoxarifados(organization_id,nome,descricao,ativo) values(_org,public.alm_texto(_dados,'nome',120,2),public.alm_texto(_dados,'descricao',1000),(_dados->>'ativo')::boolean) returning public.almoxarifados.id into id;
 else select * into local from public.almoxarifados where organization_id=_org and public.almoxarifados.id=alm_executar.id for update;if not found then raise exception 'Local indisponível.' using errcode='42501';end if;
 if local.version is distinct from (_dados->>'expected_version')::integer then raise exception 'Versão do local mudou.' using errcode='40001';end if;
 if not (_dados->>'ativo')::boolean and(exists(select 1 from public.estoque_movimentos where organization_id=_org and local_id=id group by produto_id having sum(quantidade)<>0) or exists(select 1 from public.ferramentas f where f.organization_id=_org and f.local_id=id and f.condicao<>'desativada')) then raise exception 'Transfira o saldo e confira ferramentas antes de arquivar o local.' using errcode='23514';end if;
 update public.almoxarifados set nome=public.alm_texto(_dados,'nome',120,2),descricao=public.alm_texto(_dados,'descricao',1000),ativo=(_dados->>'ativo')::boolean where public.almoxarifados.id=alm_executar.id;
 end if;tipo:='locais';
 elsif _comando='configurar_produto' then
 perform public.alm_validar_payload(_dados,array['produto_id','expected_version','exige_lote','exige_serie','estoque_minimo']);pid:=(_dados->>'produto_id')::uuid;
 qty:=public.alm_decimal(_dados->'estoque_minimo');perform public.alm_produto_fracao(_org,pid,qty);
 if jsonb_typeof(_dados->'exige_lote') is distinct from 'boolean' or jsonb_typeof(_dados->'exige_serie') is distinct from 'boolean' then raise exception 'Política exige opções booleanas.' using errcode='23514';end if;
 select * into pol from public.estoque_produto_politicas where organization_id=_org and produto_id=pid for update;
 if found then if pol.version is distinct from (_dados->>'expected_version')::integer then raise exception 'Política do produto mudou.' using errcode='40001';end if;
 update public.estoque_produto_politicas set exige_lote=(_dados->>'exige_lote')::boolean,exige_serie=(_dados->>'exige_serie')::boolean,estoque_minimo=qty where organization_id=_org and produto_id=pid;
 else if nullif(_dados->>'expected_version','') is not null then raise exception 'Política do produto mudou.' using errcode='40001';end if;
 insert into public.estoque_produto_politicas(organization_id,produto_id,exige_lote,exige_serie,estoque_minimo) values(_org,pid,(_dados->>'exige_lote')::boolean,(_dados->>'exige_serie')::boolean,qty);end if;id:=pid;tipo:='materiais';
 elsif _comando='conferir_evento' then
 perform public.alm_validar_payload(_dados,array['recebimento_id','apontamento_id','produto_id','local_id','quantidade','aceita','quarentena','rejeitada','lote','serie','motivo','reconciliacao']);pid:=(_dados->>'produto_id')::uuid;lid:=(_dados->>'local_id')::uuid;
 if prod_origem is not null and prod_origem<>pid then raise exception 'O produto deve corresponder à origem de catálogo.' using errcode='23514';end if;
 if prod_origem is null then perform public.alm_texto(_dados,'reconciliacao',4000,5);end if;
 if not exists(select 1 from public.almoxarifados where organization_id=_org and public.almoxarifados.id=lid and ativo) then raise exception 'Local ativo é necessário.' using errcode='23514';end if;
 qty:=public.alm_decimal(_dados->'quantidade',true);aceita:=public.alm_decimal(_dados->'aceita');quar:=public.alm_decimal(_dados->'quarentena');rej:=public.alm_decimal(_dados->'rejeitada');
 select case when upper(trim(p.unidade))=upper(trim(unidade)) then 1 else (select x.fator from public.produto_conversoes x where x.organization_id=_org and x.produto_id=pid and upper(trim(x.unidade_compra))=upper(trim(unidade)) and x.confirmado_por is not null order by x.created_at desc limit 1) end into fator from public.produtos p where p.organization_id=_org and p.id=pid;
 if fator is null or fator<=0 or fator='NaN'::numeric or length(fator::text)>120 then raise exception 'Conversão confirmada da unidade de origem é necessária.' using errcode='23514';end if;
 perform public.alm_produto_fracao(_org,pid,qty*fator);perform public.alm_produto_fracao(_org,pid,aceita);perform public.alm_produto_fracao(_org,pid,quar);perform public.alm_produto_fracao(_org,pid,rej);
 if aceita+quar+rej<>qty*fator then raise exception 'Aceito, quarentena e rejeitado devem fechar a quantidade convertida.' using errcode='23514';end if;
 if exists(select 1 from public.estoque_conferencias c where c.organization_id=_org and (c.recebimento_id=src_receb or c.apontamento_id=src_apont) and (c.produto_id<>pid or c.fator<>alm_executar.fator)) then raise exception 'A origem já possui produto/conversão conferidos diferentes.' using errcode='23514';end if;
 if src_receb is not null then select e.quantidade-coalesce((select sum(s.quantidade) from public.recebimentos s where s.organization_id=_org and s.estorno_de=e.id and s.sinal=-1),0) into total from public.recebimentos e where e.organization_id=_org and e.id=src_receb;
 else select e.quantidade-coalesce((select sum(s.quantidade) from public.apontamentos s where s.organization_id=_org and s.estorno_de=e.id and s.sinal=-1),0) into total from public.apontamentos e where e.organization_id=_org and e.id=src_apont;end if;
 select coalesce(sum(c.quantidade),0) into livre from public.estoque_conferencias c where c.organization_id=_org and(c.recebimento_id=src_receb or c.apontamento_id=src_apont);
 select total-livre+coalesce(sum(a.quantidade)/min(c.fator),0) into livre from public.estoque_estorno_alocacoes a join public.estoque_conferencias c on c.organization_id=a.organization_id and c.id=a.conferencia_id where c.organization_id=_org and(c.recebimento_id=src_receb or c.apontamento_id=src_apont);
 if qty>livre then raise exception 'Quantidade excede o evento físico ainda não conferido.' using errcode='23514';end if;
 lote:=nullif(public.alm_texto(_dados,'lote',120),'');serie:=nullif(public.alm_texto(_dados,'serie',120),'');select * into pol from public.estoque_produto_politicas where organization_id=_org and produto_id=pid;
 if (pol.exige_lote and lote is null) or (pol.exige_serie and serie is null) then raise exception 'Produto exige identificação de lote/série.' using errcode='23514';end if;
 if serie is not null and qty*fator<>1 then raise exception 'Série identifica uma ocorrência física individual.' using errcode='23514';end if;
 insert into public.estoque_conferencias(organization_id,recebimento_id,apontamento_id,produto_id,local_id,quantidade,unidade_origem,fator,aceita,quarentena,rejeitada,lote,serie,motivo,reconciliacao) values(_org,src_receb,src_apont,pid,lid,qty,unidade,fator,aceita,quar,rej,lote,serie,nullif(public.alm_texto(_dados,'motivo',2000),''),nullif(public.alm_texto(_dados,'reconciliacao',4000),'')) returning public.estoque_conferencias.id into id;
 insert into public.estoque_operacoes(organization_id,tipo,conferencia_id,motivo) values(_org,'conferencia',id,nullif(public.alm_texto(_dados,'motivo',2000),'')) returning public.estoque_operacoes.id into op;
 perform public.alm_movimento(_org,op,pid,id,lid,null,null,'aceito',aceita);perform public.alm_movimento(_org,op,pid,id,lid,null,null,'quarentena',quar);perform public.alm_movimento(_org,op,pid,id,lid,null,null,'rejeitado',rej);tipo:='conferencias';
 elsif _comando='reclassificar_quarentena' then
 perform public.alm_validar_payload(_dados,array['conferencia_id','local_id','quantidade','destino','motivo']);select * into conf from public.estoque_conferencias where organization_id=_org and public.estoque_conferencias.id=(_dados->>'conferencia_id')::uuid;
 if not found then raise exception 'Conferência indisponível.' using errcode='42501';end if;pid:=conf.produto_id;lid:=(_dados->>'local_id')::uuid;qty:=public.alm_decimal(_dados->'quantidade',true);perform public.alm_produto_fracao(_org,pid,qty);dest:=null;
 if _dados->>'destino' not in ('aceito','rejeitado') then raise exception 'Destino de qualidade inválido.' using errcode='23514';end if;
 select coalesce(sum(quantidade),0) into livre from public.estoque_movimentos where organization_id=_org and conferencia_id=conf.id and local_id=lid and posicao='quarentena';if qty>livre then raise exception 'Quarentena disponível insuficiente.' using errcode='23514';end if;
 insert into public.estoque_operacoes(organization_id,tipo,conferencia_id,motivo) values(_org,'qualidade',conf.id,public.alm_texto(_dados,'motivo',2000,3)) returning public.estoque_operacoes.id into op;
 perform public.alm_movimento(_org,op,pid,conf.id,lid,null,null,'quarentena',-qty);perform public.alm_movimento(_org,op,pid,conf.id,lid,null,null,_dados->>'destino',qty);id:=conf.id;tipo:='conferencias';
 elsif _comando='transferir' then
 perform public.alm_validar_payload(_dados,array['produto_id','origem_local_id','destino_local_id','quantidade','lote','motivo']);pid:=(_dados->>'produto_id')::uuid;lid:=(_dados->>'origem_local_id')::uuid;dest:=(_dados->>'destino_local_id')::uuid;qty:=public.alm_decimal(_dados->'quantidade',true);perform public.alm_produto_fracao(_org,pid,qty);lote:=nullif(public.alm_texto(_dados,'lote',120),'');
 if lid=dest or not exists(select 1 from public.almoxarifados where organization_id=_org and public.almoxarifados.id=dest and ativo) then raise exception 'Selecione outro local ativo de destino.' using errcode='23514';end if;
 insert into public.estoque_operacoes(organization_id,tipo,motivo) values(_org,'transferencia',public.alm_texto(_dados,'motivo',2000,3)) returning public.estoque_operacoes.id into op;resta:=qty;
 for linha in select c.id,public.alm_livre_lote(_org,c.id,lid) livre from public.estoque_conferencias c where c.organization_id=_org and c.produto_id=pid and(lote is null or c.lote=lote) order by c.created_at,c.id loop
 parte:=least(resta,greatest(0,linha.livre));if parte>0 then perform public.alm_movimento(_org,op,pid,linha.id,lid,null,null,'aceito',-parte);perform public.alm_movimento(_org,op,pid,linha.id,dest,null,null,'aceito',parte);resta:=resta-parte;end if;exit when resta=0;end loop;
 if resta>0 then raise exception 'Saldo aceito livre insuficiente para transferência.' using errcode='23514';end if;id:=pid;tipo:='materiais';
 elsif _comando='reservar' then
 perform public.alm_validar_payload(_dados,array['produto_id','local_id','projeto_id','op_id','pessoa_id','quantidade','validade','lote']);pid:=(_dados->>'produto_id')::uuid;lid:=(_dados->>'local_id')::uuid;qty:=public.alm_decimal(_dados->'quantidade',true);perform public.alm_produto_fracao(_org,pid,qty);lote:=nullif(public.alm_texto(_dados,'lote',120),'');
 if coalesce(_dados->>'validade','')!~'(Z|[+-][0-9]{2}:[0-9]{2})$' then raise exception 'Informe validade com fuso horário explícito.' using errcode='23514';end if;
 if num_nonnulls(nullif(_dados->>'projeto_id','')::uuid,nullif(_dados->>'op_id','')::uuid)<>1 or (_dados->>'validade')::timestamptz<=now() then raise exception 'Destino único e validade futura são necessários.' using errcode='23514';end if;
 if nullif(_dados->>'op_id','') is not null and not exists(select 1 from public.ordens_producao o where o.organization_id=_org and o.id=(_dados->>'op_id')::uuid and o.status in('rascunho','liberada')) then raise exception 'Selecione OP operacional ativa.' using errcode='23514';end if;
 if nullif(_dados->>'projeto_id','') is not null and not exists(select 1 from public.projetos p where p.organization_id=_org and p.id=(_dados->>'projeto_id')::uuid and lower(p.status) not in('concluido','concluído','cancelado')) then raise exception 'Selecione projeto operacional ativo.' using errcode='23514';end if;
 if not exists(select 1 from public.pessoas where organization_id=_org and public.pessoas.id=(_dados->>'pessoa_id')::uuid and ativa) then raise exception 'Pessoa ativa é necessária.' using errcode='23514';end if;
 if not exists(select 1 from public.almoxarifados where organization_id=_org and public.almoxarifados.id=lid and ativo) then raise exception 'Local ativo é necessário.' using errcode='23514';end if;
 insert into public.estoque_reservas(organization_id,produto_id,local_id,projeto_id,op_id,pessoa_id,quantidade,validade,lote) values(_org,pid,lid,nullif(_dados->>'projeto_id','')::uuid,nullif(_dados->>'op_id','')::uuid,(_dados->>'pessoa_id')::uuid,qty,(_dados->>'validade')::timestamptz,lote) returning public.estoque_reservas.id into id;resta:=qty;
 for linha in select c.id,public.alm_livre_lote(_org,c.id,lid) livre from public.estoque_conferencias c where c.organization_id=_org and c.produto_id=pid and(lote is null or c.lote=lote) order by c.created_at,c.id loop
 parte:=least(resta,greatest(0,linha.livre));if parte>0 then insert into public.estoque_reserva_itens(organization_id,produto_id,reserva_id,conferencia_id,quantidade) values(_org,pid,id,linha.id,parte);resta:=resta-parte;end if;exit when resta=0;end loop;
 if resta>0 then raise exception 'Saldo aceito disponível insuficiente; outra reserva pode ter sido confirmada.' using errcode='23514';end if;tipo:='reservas';
 elsif _comando in ('retirar','consumir','devolver','cancelar_reserva') then
 perform public.alm_validar_payload(_dados,case when _comando='cancelar_reserva' then array['reserva_id','expected_version','motivo'] else array['reserva_id','expected_version','quantidade','motivo'] end);
 select * into res from public.estoque_reservas where organization_id=_org and public.estoque_reservas.id=(_dados->>'reserva_id')::uuid for update;
 if not found or not(gestor or public.operacao_minha_pessoa(_org,res.pessoa_id)) then raise exception 'Acesso negado.' using errcode='42501';end if;
 if res.version is distinct from (_dados->>'expected_version')::integer then raise exception 'Versão da reserva mudou.' using errcode='40001';end if;
 if res.estado in ('cancelada','concluida') then raise exception 'Reserva encerrada.' using errcode='23514';end if;
 pid:=res.produto_id;lid:=res.local_id;id:=res.id;tipo:='reservas';r:=public.alm_reserva_quantidades(_org,res.id);
 if _comando='cancelar_reserva' then
 if (r->>'em_poder')::numeric>0 then raise exception 'Devolva ou consuma o material em poder antes de cancelar.' using errcode='23514';end if;
 update public.estoque_reservas set estado='cancelada',motivo=public.alm_texto(_dados,'motivo',2000,3) where public.estoque_reservas.id=res.id;
 else
 qty:=public.alm_decimal(_dados->'quantidade',true);perform public.alm_produto_fracao(_org,pid,qty);
 if _comando='retirar' and (res.validade<=now() or qty>(r->>'pendente_retirada')::numeric) then raise exception 'Reserva vencida ou quantidade acima do restante a retirar.' using errcode='23514';end if;
 if _comando in ('consumir','devolver') and qty>(r->>'em_poder')::numeric then raise exception 'Quantidade acima do material em poder desta reserva.' using errcode='23514';end if;
 insert into public.estoque_operacoes(organization_id,tipo,reserva_id,motivo) values(_org,case _comando when 'retirar' then 'retirada' when 'consumir' then 'consumo' else 'devolucao' end,res.id,nullif(public.alm_texto(_dados,'motivo',2000),'')) returning public.estoque_operacoes.id into op;resta:=qty;
 for linha in select i.conferencia_id,i.quantidade,coalesce((select -sum(m.quantidade) from public.estoque_movimentos m join public.estoque_operacoes o on o.organization_id=m.organization_id and o.id=m.operacao_id where m.organization_id=_org and m.reserva_id=res.id and m.conferencia_id=i.conferencia_id and m.posicao='aceito' and o.tipo='retirada'),0) retirada,coalesce((select sum(m.quantidade) from public.estoque_movimentos m where m.organization_id=_org and m.reserva_id=res.id and m.conferencia_id=i.conferencia_id and m.posicao='em_poder'),0) poder from public.estoque_reserva_itens i where i.organization_id=_org and i.reserva_id=res.id order by i.id loop
 parte:=least(resta,case when _comando='retirar' then linha.quantidade-linha.retirada else linha.poder end);if parte>0 then
 if _comando='retirar' then perform public.alm_movimento(_org,op,pid,linha.conferencia_id,lid,res.id,null,'aceito',-parte);perform public.alm_movimento(_org,op,pid,linha.conferencia_id,null,res.id,res.pessoa_id,'em_poder',parte);
 elsif _comando='consumir' then perform public.alm_movimento(_org,op,pid,linha.conferencia_id,null,res.id,res.pessoa_id,'em_poder',-parte);perform public.alm_movimento(_org,op,pid,linha.conferencia_id,null,res.id,res.pessoa_id,'consumido',parte);
 else perform public.alm_movimento(_org,op,pid,linha.conferencia_id,null,res.id,res.pessoa_id,'em_poder',-parte);perform public.alm_movimento(_org,op,pid,linha.conferencia_id,lid,res.id,null,'aceito',parte);end if;
 resta:=resta-parte;end if;exit when resta=0;end loop;
 if resta<>0 then raise exception 'As posições da reserva mudaram.' using errcode='40001';end if;
 r:=public.alm_reserva_quantidades(_org,res.id);update public.estoque_reservas set estado=case when (r->>'em_poder')::numeric=0 and (r->>'pendente_retirada')::numeric=0 then 'concluida' else 'retirada' end where public.estoque_reservas.id=res.id;
 end if;
 elsif _comando='estornar_evento' then
 perform public.alm_validar_payload(_dados,array['tipo','evento_id','quantidade','motivo']);mot:=public.alm_texto(_dados,'motivo',2000,3);qty:=public.alm_decimal(_dados->'quantidade',true);
 select c.produto_id into pid from public.estoque_conferencias c where c.organization_id=_org and(c.recebimento_id=src_receb or c.apontamento_id=src_apont) limit 1;
 if pid is null then raise exception 'Evento ainda não conferido: use o estorno no fluxo de suprimentos.' using errcode='23514';end if;
 begin perform public.registrar_movimento(_dados->>'tipo',item,qty,'alm:'||_chave::text,coalesce(src_receb,src_apont));exception when raise_exception then raise exception '%',sqlerrm using errcode='23514';end;
 insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,motivo) values(_org,'produtos',pid,'estornar_evento',mot);id:=pid;tipo:='materiais';
 elsif _comando='criar_inventario' then
 perform public.alm_validar_payload(_dados,array['produto_id','local_id','lote','contada','motivo']);pid:=(_dados->>'produto_id')::uuid;lid:=(_dados->>'local_id')::uuid;lote:=nullif(public.alm_texto(_dados,'lote',120),'');qty:=public.alm_decimal(_dados->'contada');perform public.alm_produto_fracao(_org,pid,qty);
 if not exists(select 1 from public.almoxarifados where organization_id=_org and public.almoxarifados.id=lid and ativo) then raise exception 'Local ativo é necessário.' using errcode='23514';end if;
 select coalesce(sum(m.quantidade),0),coalesce(max(m.seq),0) into baseline,seq_atual from public.estoque_movimentos m join public.estoque_conferencias c on c.organization_id=m.organization_id and c.id=m.conferencia_id where m.organization_id=_org and m.produto_id=pid and m.local_id=lid and m.posicao='aceito' and(lote is null or c.lote=lote);
 insert into public.estoque_inventarios(organization_id,produto_id,local_id,lote,contada,baseline,ledger_id,motivo) values(_org,pid,lid,lote,qty,baseline,seq_atual,public.alm_texto(_dados,'motivo',2000,3)) returning public.estoque_inventarios.id into id;tipo:='inventarios';
 elsif _comando in ('aprovar_inventario','cancelar_inventario') then
 perform public.alm_validar_payload(_dados,array['inventario_id','expected_version','motivo']);select * into inv from public.estoque_inventarios where organization_id=_org and public.estoque_inventarios.id=(_dados->>'inventario_id')::uuid for update;
 if not found then raise exception 'Inventário indisponível.' using errcode='42501';end if;
 if inv.version is distinct from (_dados->>'expected_version')::integer then raise exception 'Versão do inventário mudou.' using errcode='40001';end if;
 if inv.estado<>'aberto' then raise exception 'Inventário encerrado.' using errcode='23514';end if;id:=inv.id;tipo:='inventarios';mot:=public.alm_texto(_dados,'motivo',2000,3);
 if _comando='cancelar_inventario' then update public.estoque_inventarios set estado='cancelado',motivo=mot where public.estoque_inventarios.id=inv.id;
 else
 pid:=inv.produto_id;lid:=inv.local_id;qty:=inv.contada-inv.baseline;
 select coalesce(max(m.seq),0) into seq_atual from public.estoque_movimentos m join public.estoque_conferencias c on c.organization_id=m.organization_id and c.id=m.conferencia_id where m.organization_id=_org and m.produto_id=pid and m.local_id=lid and m.posicao='aceito' and(inv.lote is null or c.lote=inv.lote);
 if seq_atual<>inv.ledger_id then raise exception 'Houve movimentação após a contagem; cancele e reconte.' using errcode='40001';end if;
 if qty>0 then
 select * into pol from public.estoque_produto_politicas where organization_id=_org and produto_id=pid;if pol.exige_serie or(pol.exige_lote and inv.lote is null) then raise exception 'Ajuste serializado requer conferência individual identificada; não use contagem agregada.' using errcode='23514';end if;
 insert into public.estoque_conferencias(organization_id,inventario_id,produto_id,local_id,quantidade,unidade_origem,fator,aceita,quarentena,rejeitada,lote,motivo) select _org,inv.id,pid,lid,qty,p.unidade,1,qty,0,0,inv.lote,mot from public.produtos p where p.organization_id=_org and p.id=pid returning public.estoque_conferencias.id into eid;
 insert into public.estoque_operacoes(organization_id,tipo,inventario_id,motivo) values(_org,'inventario',inv.id,mot) returning public.estoque_operacoes.id into op;perform public.alm_movimento(_org,op,pid,eid,lid,null,null,'aceito',qty);
 elsif qty<0 then
 insert into public.estoque_operacoes(organization_id,tipo,inventario_id,motivo) values(_org,'inventario',inv.id,mot) returning public.estoque_operacoes.id into op;resta:=-qty;
 for linha in select c.id,public.alm_livre_lote(_org,c.id,lid) livre from public.estoque_conferencias c where c.organization_id=_org and c.produto_id=pid and(inv.lote is null or c.lote=inv.lote) order by c.created_at,c.id loop parte:=least(resta,greatest(0,linha.livre));if parte>0 then perform public.alm_movimento(_org,op,pid,linha.id,lid,null,null,'aceito',-parte);resta:=resta-parte;end if;exit when resta=0;end loop;
 if resta>0 then raise exception 'Ajuste negativo afetaria reserva ativa; resolva a reserva e reconte.' using errcode='23514';end if;
 end if;
 update public.estoque_inventarios set estado='aprovado',aprovado_por=auth.uid(),aprovado_em=now(),motivo=mot where public.estoque_inventarios.id=inv.id;
 end if;
 else raise exception 'Comando não reconhecido.' using errcode='23514';end if;
 d:=public.alm_obter(_org,tipo,id);r:=jsonb_build_object('tipo',tipo,'id',id,'detalhe',d);return public.operacao_concluir(_org,_chave,'alm_executar',payload,r);
end$$;

create function public.alm_listar(_org uuid,_tipo text,_busca text default '',_estado text default null,_local uuid default null,_pagina integer default 0,_limite integer default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q text;r jsonb;begin
 if not public.operacao_pode(_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _pagina<0 or _pagina>10000 or _limite<1 or _limite>50 or length(_busca)>120 then raise exception 'Filtro inválido.' using errcode='23514';end if;
 case _tipo
 when 'materiais' then q:='select p.id,p.created_at from public.produtos p where p.organization_id=$1 and public.alm_ler_produto($1,p.id) and position(lower($2) in lower(p.codigo||'' ''||p.descricao))>0 and($4 is null or exists(select 1 from public.estoque_movimentos m where m.organization_id=$1 and m.produto_id=p.id and m.local_id=$4))';
 when 'locais' then q:='select l.id,l.created_at from public.almoxarifados l where l.organization_id=$1 and position(lower($2) in lower(l.nome))>0 and($3 is null or l.ativo=($3=''ativo'')) and($4 is null or l.id=$4)';
 when 'reservas' then q:='select r.id,r.created_at from public.estoque_reservas r join public.produtos p on p.organization_id=r.organization_id and p.id=r.produto_id join public.pessoas pe on pe.organization_id=r.organization_id and pe.id=r.pessoa_id where r.organization_id=$1 and public.alm_ler_reserva($1,r.id) and position(lower($2) in lower(p.codigo||'' ''||p.descricao||'' ''||pe.nome))>0 and($3 is null or r.estado=$3) and($4 is null or r.local_id=$4)';
 when 'ferramentas' then q:='select f.id,f.created_at from public.ferramentas f where f.organization_id=$1 and public.alm_ler_ferramenta($1,f.id) and position(lower($2) in lower(f.patrimonio||'' ''||f.descricao))>0 and($3 is null or f.condicao=$3) and($4 is null or f.local_id=$4)';
 when 'movimentos' then q:='select m.id,m.created_at from public.estoque_movimentos m join public.produtos p on p.organization_id=m.organization_id and p.id=m.produto_id where m.organization_id=$1 and(public.alm_gerir($1) or public.alm_ler_reserva($1,m.reserva_id)) and position(lower($2) in lower(p.codigo||'' ''||p.descricao))>0 and($3 is null or m.posicao=$3) and($4 is null or m.local_id=$4)';
 when 'conferencias' then q:='select c.id,c.created_at from public.estoque_conferencias c join public.produtos p on p.organization_id=c.organization_id and p.id=c.produto_id where c.organization_id=$1 and public.alm_gerir($1) and position(lower($2) in lower(p.codigo||'' ''||p.descricao||'' ''||coalesce(c.lote,'''')||'' ''||coalesce(c.serie,'''')))>0 and($4 is null or c.local_id=$4)';
 when 'inventarios' then q:='select i.id,i.created_at from public.estoque_inventarios i join public.produtos p on p.organization_id=i.organization_id and p.id=i.produto_id where i.organization_id=$1 and public.alm_gerir($1) and position(lower($2) in lower(p.codigo||'' ''||p.descricao))>0 and($3 is null or i.estado=$3) and($4 is null or i.local_id=$4)';
 else raise exception 'Consulta inválida.' using errcode='23514';end case;
 execute 'with encontrados as materialized('||q||'), pagina as(select id,created_at from encontrados order by created_at desc,id limit $6 offset $5*$6) select jsonb_build_object(''registros'',coalesce((select jsonb_agg(public.alm_row($1,$7,x.id) order by x.created_at desc,x.id) from pagina x),''[]''),''total'',(select count(*) from encontrados),''pagina'',$5,''limite'',$6,''permissoes'',public.alm_permissoes($1))' into r using _org,_busca,_estado,_local,_pagina,_limite,_tipo;return r;
end$$;
create function public.alm_opcoes(_org uuid,_tipo text,_busca text default '',_local uuid default null,_pagina integer default 0,_limite integer default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare q text;r jsonb;begin
 if not public.operacao_pode(_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if _pagina<0 or _pagina>10000 or _limite<1 or _limite>50 or length(_busca)>120 then raise exception 'Filtro inválido.' using errcode='23514';end if;
 if _tipo not in ('produtos','pessoas','locais','ferramentas','politicas_calibracao') and not public.alm_gerir(_org) then raise exception 'Acesso negado.' using errcode='42501';end if;
 case _tipo
 when 'produtos' then q:='select p.id,p.codigo||'' · ''||p.descricao nome,p.unidade contexto,jsonb_build_object(''produto_id'',p.id,''unidade'',p.unidade) dados from public.produtos p where p.organization_id=$1 and(public.alm_gerir($1) or public.alm_ler_produto($1,p.id))';
 when 'pessoas' then q:='select p.id,p.nome,coalesce(p.funcao,'''') contexto,jsonb_build_object(''pessoa_id'',p.id) dados from public.pessoas p where p.organization_id=$1 and p.ativa and(public.alm_gerir($1) or public.operacao_minha_pessoa($1,p.id))';
 when 'locais' then q:='select l.id,l.nome,l.descricao contexto,jsonb_build_object(''local_id'',l.id) dados from public.almoxarifados l where l.organization_id=$1 and l.ativo and($3 is null or l.id=$3)';
 when 'projetos' then q:='select p.id,p.codigo nome,c.razao_social contexto,jsonb_build_object(''projeto_id'',p.id) dados from public.projetos p join public.clientes c on c.organization_id=p.organization_id and c.id=p.cliente_id where p.organization_id=$1 and p.status not in(''Cancelado'',''Concluído'',''cancelado'',''concluido'')';
 when 'ordens_producao' then q:='select o.id,o.numero nome,o.status contexto,jsonb_build_object(''op_id'',o.id) dados from public.ordens_producao o where o.organization_id=$1 and o.status in(''rascunho'',''liberada'')';
 when 'ferramentas' then q:='select f.id,f.patrimonio||'' · ''||f.descricao nome,f.condicao contexto,jsonb_build_object(''ferramenta_id'',f.id) dados from public.ferramentas f where f.organization_id=$1 and public.alm_ler_ferramenta($1,f.id)';
 when 'politicas_calibracao' then q:='select p.id,p.nome||'' V''||p.numero::text nome,p.fonte contexto,jsonb_build_object(''politica_calibracao_id'',p.id) dados from public.ferramenta_calibracao_politicas p where p.organization_id=$1';
 when 'recebimentos' then q:='select e.id,o.numero||'' · ''||rc.descricao nome,''Recebido · ''||e.recebido_em::text contexto,jsonb_build_object(''recebimento_id'',e.id,''produto_id'',rc.produto_id,''quantidade'',(e.quantidade-coalesce((select sum(z.quantidade) from public.recebimentos z where z.organization_id=$1 and z.estorno_de=e.id and z.sinal=-1),0)-coalesce((select sum(c.quantidade) from public.estoque_conferencias c where c.organization_id=$1 and c.recebimento_id=e.id),0)+coalesce((select sum(a.quantidade)/min(c.fator) from public.estoque_estorno_alocacoes a join public.estoque_conferencias c on c.organization_id=a.organization_id and c.id=a.conferencia_id where c.organization_id=$1 and c.recebimento_id=e.id),0))::text,''unidade'',rc.unidade) dados from public.recebimentos e join public.ordem_compra_itens i on i.organization_id=e.organization_id and i.id=e.item_id join public.ordens_compra o on o.organization_id=i.organization_id and o.id=i.ordem_id join public.demandas d on d.organization_id=i.organization_id and d.id=i.demanda_id join public.revisao_componentes rc on rc.organization_id=d.organization_id and rc.id=d.revisao_componente_id where e.organization_id=$1 and e.sinal=1';
 when 'apontamentos' then q:='select e.id,o.numero||'' · ''||rc.descricao nome,''Produzido · ''||e.apontado_em::text contexto,jsonb_build_object(''apontamento_id'',e.id,''produto_id'',rc.produto_id,''quantidade'',(e.quantidade-coalesce((select sum(z.quantidade) from public.apontamentos z where z.organization_id=$1 and z.estorno_de=e.id and z.sinal=-1),0)-coalesce((select sum(c.quantidade) from public.estoque_conferencias c where c.organization_id=$1 and c.apontamento_id=e.id),0)+coalesce((select sum(a.quantidade)/min(c.fator) from public.estoque_estorno_alocacoes a join public.estoque_conferencias c on c.organization_id=a.organization_id and c.id=a.conferencia_id where c.organization_id=$1 and c.apontamento_id=e.id),0))::text,''unidade'',rc.unidade) dados from public.apontamentos e join public.ordem_producao_itens i on i.organization_id=e.organization_id and i.id=e.item_id join public.ordens_producao o on o.organization_id=i.organization_id and o.id=i.ordem_id join public.demandas d on d.organization_id=i.organization_id and d.id=i.demanda_id join public.revisao_componentes rc on rc.organization_id=d.organization_id and rc.id=d.revisao_componente_id where e.organization_id=$1 and e.sinal=1';
 else raise exception 'Seletor inválido.' using errcode='23514';end case;
 execute 'with encontrados as materialized(select * from('||q||') x where position(lower($2) in lower(nome||'' ''||contexto))>0 and(not dados?''quantidade'' or (dados->>''quantidade'')::numeric>0)), pagina as(select * from encontrados order by nome,id limit $5 offset $4*$5) select jsonb_build_object(''registros'',coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(''id'',id,''nome'',nome,''contexto'',contexto)||dados) order by nome,id) from pagina),''[]''),''total'',(select count(*) from encontrados),''pagina'',$4,''limite'',$5)' into r using _org,_busca,_local,_pagina,_limite;return r;
end$$;

-- Pais de arquivos reutilizam o registro canônico; intenções antigas não recebem novas chaves no hash.
alter table public.anexos add column ferramenta_id uuid,add column calibracao_id uuid;
alter table public.anexos drop constraint anexos_check;
alter table public.anexos add constraint anexos_pai_unico check(num_nonnulls(pessoa_id,acao_id,qualificacao_id,ferramenta_id,calibracao_id)=1),
 add constraint anexo_ferramenta_tenant foreign key(organization_id,ferramenta_id) references public.ferramentas(organization_id,id),
 add constraint anexo_calibracao_tenant foreign key(organization_id,calibracao_id) references public.ferramenta_calibracoes(organization_id,id);
create index anexo_ferramenta on public.anexos(organization_id,ferramenta_id,estado) where ferramenta_id is not null;
create index anexo_calibracao on public.anexos(organization_id,calibracao_id,estado) where calibracao_id is not null;
create function public.operacao_guard_anexo() returns trigger language plpgsql set search_path='' as $$begin
 if(to_jsonb(new)-array['estado','confirmado_em']) is distinct from(to_jsonb(old)-array['estado','confirmado_em']) then raise exception 'Metadados e origem do arquivo são imutáveis.' using errcode='23514';end if;
 if old.estado in('vinculado','cancelado') or not((old.estado in('pendente','enviado') and new.estado in('enviado','vinculado','cancelado'))) then raise exception 'Arquivo confirmado ou cancelado é imutável.' using errcode='23514';end if;return new;
end$$;
create trigger operacao_guard_anexo before update on public.anexos for each row execute function public.operacao_guard_anexo();
create function public.alm_autor_gerir(_org uuid,_autor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.operacao_autor_pode(_org,_autor,'gerir_operacao') or (exists(select 1 from public.memberships where organization_id=_org and user_id=_autor) and exists(select 1 from public.user_roles where organization_id=_org and user_id=_autor and role='compras'))$$;
create function public.operacao_autor_destino_anexo(_org uuid,_pai jsonb,_autor uuid,_escrever boolean default false) returns boolean language plpgsql stable security definer set search_path='' as $$
declare p uuid:=nullif(_pai->>'pessoa_id','')::uuid;a uuid:=nullif(_pai->>'acao_id','')::uuid;q uuid:=nullif(_pai->>'qualificacao_id','')::uuid;f uuid:=nullif(_pai->>'ferramenta_id','')::uuid;c uuid:=nullif(_pai->>'calibracao_id','')::uuid;begin
 if num_nonnulls(p,a,q,f,c)<>1 or not exists(select 1 from public.memberships where organization_id=_org and user_id=_autor) then return false;end if;
 if p is not null then return public.operacao_autor_pode(_org,_autor,'ver_equipe') and exists(select 1 from public.pessoas pe where pe.organization_id=_org and pe.id=p and(public.operacao_autor_pode(_org,_autor,'gerir_equipe') or(pe.ativa and pe.user_id=_autor)));
 elsif q is not null then return public.operacao_autor_pode(_org,_autor,'ver_equipe') and exists(select 1 from public.pessoa_qualificacoes pq join public.pessoas pe on pe.organization_id=pq.organization_id and pe.id=pq.pessoa_id where pq.organization_id=_org and pq.id=q and(not _escrever or pq.estado in('enviada','em_conferencia')) and(public.operacao_autor_pode(_org,_autor,'gerir_equipe') or(pe.ativa and pe.user_id=_autor)));
 elsif a is not null then return public.operacao_autor_pode(_org,_autor,'ver_operacao') and exists(select 1 from public.acoes_operacionais ac where ac.organization_id=_org and ac.id=a and(not _escrever or ac.estado not in('concluida','cancelada')) and(public.operacao_autor_pode(_org,_autor,'gerir_operacao') or exists(select 1 from public.pessoas pe where pe.organization_id=_org and pe.user_id=_autor and pe.ativa and(pe.id=ac.responsavel_id or exists(select 1 from public.acao_colaboradores cc where cc.organization_id=_org and cc.acao_id=a and cc.pessoa_id=pe.id)))));
 elsif f is not null then return public.alm_autor_ler_ferramenta(_org,f,_autor) and(not _escrever or public.alm_autor_gerir(_org,_autor) or exists(select 1 from public.ferramenta_custodias fc join public.pessoas pe on pe.organization_id=fc.organization_id and pe.id=fc.pessoa_id where fc.organization_id=_org and fc.ferramenta_id=f and fc.estado='retirada' and pe.ativa and pe.user_id=_autor));
 else return exists(select 1 from public.ferramenta_calibracoes ca where ca.organization_id=_org and ca.id=c and public.alm_autor_ler_ferramenta(_org,ca.ferramenta_id,_autor) and(not _escrever or(public.alm_autor_gerir(_org,_autor) and ca.estado in('enviada','em_conferencia'))));end if;
end$$;
create or replace function public.operacao_autor_ler_anexo(_org uuid,_id uuid,_autor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.anexos a where a.organization_id=_org and a.id=_id and a.estado<>'cancelado' and public.operacao_autor_destino_anexo(_org,to_jsonb(a),_autor,false))$$;
create function public.operacao_travar_pai_anexo(_org uuid,_pai jsonb) returns void language plpgsql security definer set search_path='' as $$
declare p uuid:=nullif(_pai->>'pessoa_id','')::uuid;a uuid:=nullif(_pai->>'acao_id','')::uuid;q uuid:=nullif(_pai->>'qualificacao_id','')::uuid;f uuid:=nullif(_pai->>'ferramenta_id','')::uuid;c uuid:=nullif(_pai->>'calibracao_id','')::uuid;begin
 if c is not null then select ferramenta_id into f from public.ferramenta_calibracoes where organization_id=_org and id=c;end if;
 if f is not null then perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('nexus-ferramenta:'||_org::text||f::text,0));perform 1 from public.ferramentas where organization_id=_org and id=f for update;perform 1 from public.ferramenta_custodias where organization_id=_org and ferramenta_id=f order by id for share;end if;
 if c is not null then perform 1 from public.ferramenta_calibracoes where organization_id=_org and id=c for update;
 elsif p is not null then perform 1 from public.pessoas where organization_id=_org and id=p for share;
 elsif q is not null then perform 1 from public.pessoa_qualificacoes where organization_id=_org and id=q for share;
 elsif a is not null then perform 1 from public.acoes_operacionais where organization_id=_org and id=a for share;perform 1 from public.acao_colaboradores where organization_id=_org and acao_id=a order by pessoa_id for share;end if;
end$$;
create or replace function public.preparar_anexo_operacional(_org uuid,_chave uuid,_dados jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.anexos;r jsonb;novo uuid:=gen_random_uuid();begin
 perform public.lev_travar_autor(_org,auth.uid());perform public.operacao_travar_pai_anexo(_org,_dados);
 if nullif(_dados->>'acao_id','') is not null and exists(select 1 from public.acoes_operacionais where organization_id=_org and id=(_dados->>'acao_id')::uuid and estado in('concluida','cancelada') and public.operacao_ler_acao(_org,id)) then raise exception 'Ação encerrada não recebe novas evidências.' using errcode='23514';end if;
 if not public.operacao_autor_destino_anexo(_org,_dados,auth.uid(),true) then raise exception 'Acesso negado.' using errcode='42501';end if;
 perform public.alm_validar_payload(_dados,array['pessoa_id','acao_id','qualificacao_id','ferramenta_id','calibracao_id','nome','mime','tamanho','sha256']);
 r:=public.operacao_repetir(_org,_chave,'preparar_anexo',_dados);if r is not null then return r;end if;
 insert into public.anexos(id,organization_id,pessoa_id,acao_id,qualificacao_id,ferramenta_id,calibracao_id,nome,mime,tamanho,sha256,caminho) values(novo,_org,nullif(_dados->>'pessoa_id','')::uuid,nullif(_dados->>'acao_id','')::uuid,nullif(_dados->>'qualificacao_id','')::uuid,nullif(_dados->>'ferramenta_id','')::uuid,nullif(_dados->>'calibracao_id','')::uuid,_dados->>'nome',_dados->>'mime',(_dados->>'tamanho')::bigint,_dados->>'sha256',_org::text||'/anexos/'||novo::text) returning * into a;
 return public.operacao_concluir(_org,_chave,'preparar_anexo',_dados,to_jsonb(a));
end$$;
create function public.operacao_pode_enviar_anexo(_org uuid,_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.anexos a where a.organization_id=_org and a.id=_id and a.created_by=auth.uid() and a.estado in('pendente','enviado') and public.operacao_autor_destino_anexo(_org,to_jsonb(a),auth.uid(),true))$$;
create or replace function public.confirmar_anexo_operacional(_org uuid,_id uuid,_autor uuid,_sha256 text) returns void language plpgsql security definer set search_path='' as $$
declare a public.anexos;begin
 perform public.lev_travar_autor(_org,_autor);select * into a from public.anexos where organization_id=_org and id=_id;
 if not found then raise exception 'Arquivo indisponível.' using errcode='42501';end if;
 perform public.operacao_travar_pai_anexo(_org,to_jsonb(a));select * into a from public.anexos where organization_id=_org and id=_id for update;
 if a.created_by is distinct from _autor or a.sha256 is distinct from _sha256 or a.estado='cancelado' or not public.operacao_autor_destino_anexo(_org,to_jsonb(a),_autor,false) then raise exception 'Acesso revogado.' using errcode='42501';end if;
 if a.estado='vinculado' then return;end if;
 if not public.operacao_autor_destino_anexo(_org,to_jsonb(a),_autor,true) then raise exception 'O destino não aceita novos arquivos.' using errcode='23514';end if;
 if not exists(select 1 from storage.objects where bucket_id='nexus-operacional' and name=a.caminho and(metadata->>'size')::bigint=a.tamanho and metadata->>'mimetype'=a.mime) then raise exception 'Armazenamento ainda não confirmado.' using errcode='23514';end if;
 update public.anexos set estado='vinculado',confirmado_em=now() where id=_id;
end$$;
create function public.cancelar_anexo_operacional(_org uuid,_id uuid,_chave uuid,_motivo text) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.anexos;r jsonb;p jsonb:=jsonb_build_object('id',_id,'motivo',_motivo);begin
 perform public.lev_travar_autor(_org,auth.uid());select * into a from public.anexos where organization_id=_org and id=_id;if not found then raise exception 'Acesso negado.' using errcode='42501';end if;
 perform public.operacao_travar_pai_anexo(_org,to_jsonb(a));select * into a from public.anexos where organization_id=_org and id=_id for update;
 if a.created_by<>auth.uid() or not public.operacao_autor_destino_anexo(_org,to_jsonb(a),auth.uid(),true) then raise exception 'Acesso negado.' using errcode='42501';end if;
 if length(trim(_motivo)) not between 5 and 2000 then raise exception 'Informe motivo com cinco a 2000 caracteres.' using errcode='23514';end if;
 r:=public.operacao_repetir(_org,_chave,'cancelar_anexo',p);if r is not null then return r;end if;
 if a.estado not in('pendente','enviado') then raise exception 'Só upload pendente pode ser cancelado.' using errcode='23514';end if;
 update public.anexos set estado='cancelado' where id=_id returning * into a;
 insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,motivo) values(_org,'anexos',_id,'cancelar',_motivo);
 return public.operacao_concluir(_org,_chave,'cancelar_anexo',p,to_jsonb(a));
end$$;
create function public.listar_anexos_operacionais(_org uuid,_pai jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;begin
 perform public.alm_validar_payload(_pai,array['pessoa_id','acao_id','qualificacao_id','ferramenta_id','calibracao_id']);
 if not public.operacao_autor_destino_anexo(_org,_pai,auth.uid(),false) then raise exception 'Acesso negado.' using errcode='42501';end if;
 select jsonb_build_object('registros',coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('pode_retomar',public.operacao_pode_enviar_anexo(_org,x.id),'pode_cancelar',public.operacao_pode_enviar_anexo(_org,x.id)) order by x.created_at desc,x.id),'[]'),'permissoes',jsonb_build_object('adicionar',public.operacao_autor_destino_anexo(_org,_pai,auth.uid(),true))) into r from(select a.* from public.anexos a where a.organization_id=_org and a.estado<>'cancelado' and(a.pessoa_id=nullif(_pai->>'pessoa_id','')::uuid or a.acao_id=nullif(_pai->>'acao_id','')::uuid or a.qualificacao_id=nullif(_pai->>'qualificacao_id','')::uuid or a.ferramenta_id=nullif(_pai->>'ferramenta_id','')::uuid or a.calibracao_id=nullif(_pai->>'calibracao_id','')::uuid) order by a.created_at desc,a.id limit 50)x;return r;
end$$;
drop policy nexus_operacional_upload on storage.objects;
create policy nexus_operacional_upload on storage.objects for insert to authenticated with check(bucket_id='nexus-operacional' and exists(select 1 from public.anexos a where a.caminho=name and public.operacao_pode_enviar_anexo(a.organization_id,a.id)));

-- A única evolução de cabeçalho emitido é o vínculo inicial ao projeto exato da revisão aceita.
-- A RPC abaixo adquire a trava da revisão antes das linhas; nenhum conteúdo de ordem é reaberto.
create or replace function public.ordem_cabecalho_imutavel() returns trigger language plpgsql security definer set search_path='' as $$
declare travado text[]:=array['emitida','liberada','concluida','cancelada'];begin
 if old.status=any(travado) then
 if old.projeto_id is null and new.projeto_id is not null and(to_jsonb(new)-'projeto_id')=(to_jsonb(old)-'projeto_id') then
 perform public.travar_revisao(old.revisao_id);
 if not public.pode(old.organization_id,'aceitar_comercial') or not exists(select 1 from public.projetos p join public.proposta_revisoes r on r.organization_id=p.organization_id and r.id=p.revisao_id join public.propostas pr on pr.organization_id=r.organization_id and pr.id=r.proposta_id where p.organization_id=old.organization_id and p.id=new.projeto_id and p.revisao_id=old.revisao_id and r.status='aceita' and p.proposta_id=pr.id and p.cliente_id=pr.cliente_id) then raise exception 'Projeto deve corresponder exatamente à revisão aceita desta ordem.' using errcode='23514';end if;
 insert into public.auditoria(organization_id,entidade,entidade_id,acao,dados,autor) values(old.organization_id,tg_table_name,new.id,'vincular_projeto',jsonb_build_object('projeto_id',new.projeto_id,'revisao_id',old.revisao_id),auth.uid());return new;
 end if;
 if(to_jsonb(new)-'status') is distinct from(to_jsonb(old)-'status') then raise exception 'Ordem emitida/liberada é imutável; use aditivo ou cancelamento';end if;
 if new.status is distinct from old.status and not(new.status in('concluida','cancelada') and old.status in('emitida','liberada')) then raise exception 'Transição de ordem não permitida';end if;
 end if;return new;
end$$;
create function public.aceitar_projeto_operacional(_org uuid,_revisao uuid,_chave uuid,_motivo text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.proposta_revisoes;p public.propostas;pr public.projetos;anterior jsonb;ret jsonb;alterou boolean;n integer;payload jsonb:=jsonb_build_object('revisao_id',_revisao,'motivo',_motivo);begin
 perform public.lev_travar_autor(_org,auth.uid());if not public.pode(_org,'aceitar_comercial') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if length(coalesce(_motivo,''))>500 then raise exception 'Motivo excede 500 caracteres.' using errcode='23514';end if;
 perform public.travar_revisao(_revisao);select * into r from public.proposta_revisoes where organization_id=_org and id=_revisao for update;if not found then raise exception 'Acesso negado.' using errcode='42501';end if;
 anterior:=public.operacao_repetir(_org,_chave,'aceitar_projeto_operacional',payload);if anterior is not null then return anterior;end if;
 if r.status not in('enviada','aceita') then raise exception 'A revisão precisa estar enviada para ser aceita.' using errcode='23514';end if;
 select * into p from public.propostas where organization_id=_org and id=r.proposta_id for update;if not found then raise exception 'Proposta indisponível.' using errcode='42501';end if;
 alterou:=r.status='enviada';if alterou then update public.proposta_revisoes set status='aceita',aceita_em=now() where id=r.id;end if;
 insert into public.projetos(organization_id,codigo,proposta_id,revisao_id,cliente_id) values(_org,'PRJ-'||regexp_replace(p.numero,'/','-'),p.id,r.id,p.cliente_id) on conflict(revisao_id) do nothing;
 get diagnostics n=row_count;alterou:=alterou or n>0;
 select * into pr from public.projetos where organization_id=_org and revisao_id=r.id for update;
 if not found or pr.proposta_id<>p.id or pr.cliente_id<>p.cliente_id then raise exception 'Projeto existente não corresponde à proposta aceita; confira o vínculo.' using errcode='23514';end if;
 if p.projeto_id is not null and p.projeto_id<>pr.id then raise exception 'A proposta já possui outro projeto; confira a mudança de escopo.' using errcode='23514';end if;
 perform 1 from public.ordens_compra where organization_id=_org and revisao_id=r.id order by id for update;
 perform 1 from public.ordens_producao where organization_id=_org and revisao_id=r.id order by id for update;
 if exists(select 1 from public.ordens_compra where organization_id=_org and revisao_id=r.id and projeto_id is not null and projeto_id<>pr.id) or exists(select 1 from public.ordens_producao where organization_id=_org and revisao_id=r.id and projeto_id is not null and projeto_id<>pr.id) then raise exception 'Ordens já vinculadas a outro projeto exigem reconciliação.' using errcode='23514';end if;
 update public.propostas set projeto_id=pr.id where id=p.id and projeto_id is distinct from pr.id;
 get diagnostics n=row_count;alterou:=alterou or n>0;
 update public.ordens_compra set projeto_id=pr.id where organization_id=_org and revisao_id=r.id and projeto_id is null;
 get diagnostics n=row_count;alterou:=alterou or n>0;
 update public.ordens_producao set projeto_id=pr.id where organization_id=_org and revisao_id=r.id and projeto_id is null;
 get diagnostics n=row_count;alterou:=alterou or n>0;
 if alterou then insert into public.auditoria(organization_id,entidade,entidade_id,acao,dados,autor) values(_org,'revisao',r.id,case when r.status='enviada' then 'aceitar' else 'reconciliar_projeto' end,jsonb_build_object('projeto_id',pr.id,'motivo',_motivo),auth.uid());end if;
 ret:=jsonb_build_object('status','aceitar','revisao_id',r.id,'proposta_id',p.id,'projeto_id',pr.id);return public.operacao_concluir(_org,_chave,'aceitar_projeto_operacional',payload,ret);
end$$;

-- A integridade nova não presume que cabeçalhos históricos estejam limpos: a validação falha de forma explícita.
alter table public.fornecedores add constraint alm_fornecedor_tenant unique(organization_id,id);
alter table public.demandas add constraint alm_demanda_revisao unique(organization_id,revisao_id,id);
alter table public.ordens_compra add constraint alm_oc_revisao unique(organization_id,revisao_id,id);
alter table public.ordens_producao add constraint alm_op_revisao unique(organization_id,revisao_id,id);
alter table public.ordens_compra add constraint alm_oc_revisao_fk foreign key(organization_id,revisao_id) references public.proposta_revisoes(organization_id,id),add constraint alm_oc_fornecedor_fk foreign key(organization_id,fornecedor_id) references public.fornecedores(organization_id,id),add constraint alm_oc_projeto_fk foreign key(organization_id,revisao_id,projeto_id) references public.projetos(organization_id,revisao_id,id);
alter table public.ordens_producao add constraint alm_op_revisao_fk foreign key(organization_id,revisao_id) references public.proposta_revisoes(organization_id,id),add constraint alm_op_projeto_fk foreign key(organization_id,revisao_id,projeto_id) references public.projetos(organization_id,revisao_id,id);
alter table public.ordem_compra_itens add constraint alm_oci_ordem_fk foreign key(organization_id,ordem_id) references public.ordens_compra(organization_id,id);
alter table public.ordem_producao_itens add constraint alm_opi_ordem_fk foreign key(organization_id,ordem_id) references public.ordens_producao(organization_id,id);
alter table public.recebimentos add constraint alm_recebimento_item_fk foreign key(organization_id,item_id) references public.ordem_compra_itens(organization_id,id);
alter table public.apontamentos add constraint alm_apontamento_item_fk foreign key(organization_id,item_id) references public.ordem_producao_itens(organization_id,id);

create function public.alm_contexto_ordem() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.projeto_id is not null and not exists(select 1 from public.projetos p join public.proposta_revisoes r on r.organization_id=p.organization_id and r.id=p.revisao_id join public.propostas pr on pr.organization_id=r.organization_id and pr.id=r.proposta_id where p.organization_id=new.organization_id and p.id=new.projeto_id and p.revisao_id=new.revisao_id and p.proposta_id=pr.id and p.cliente_id=pr.cliente_id) then raise exception 'Projeto e revisão da ordem não correspondem.' using errcode='23514';end if;return new;
end$$;
create trigger alm_contexto_ordem before insert or update on public.ordens_compra for each row execute function public.alm_contexto_ordem();
create trigger alm_contexto_ordem before insert or update on public.ordens_producao for each row execute function public.alm_contexto_ordem();

create function public.alm_unidade_catalogo_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if(new.unidade is distinct from old.unidade or new.indivisivel is distinct from old.indivisivel) and exists(select 1 from public.estoque_conferencias where organization_id=old.organization_id and produto_id=old.id) then raise exception 'Produto com histórico físico preserva unidade e indivisibilidade; reconcilie a unidade antes de alterar o catálogo.' using errcode='23514';end if;return new;
end$$;
create trigger alm_unidade_catalogo before update on public.produtos for each row execute function public.alm_unidade_catalogo_guard();

-- A interface completa de Agenda entregará reagendamento conjunto. Até lá, impedir projeções contraditórias.
create function public.alm_agenda_reserva_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if(new.inicio is distinct from old.inicio or new.fim is distinct from old.fim or new.timezone is distinct from old.timezone or(new.estado='cancelado' and old.estado<>'cancelado')) and exists(select 1 from public.ferramenta_custodias c where c.organization_id=old.organization_id and c.agenda_evento_id=old.id and c.estado in('reservada','retirada')) then raise exception 'Confira e cancele/devolva as reservas de ferramentas antes de alterar o período, fuso ou cancelar este evento.' using errcode='23514';end if;return new;
end$$;
create trigger alm_agenda_reserva before update on public.agenda_eventos for each row execute function public.alm_agenda_reserva_guard();

-- Negar descoberta de helpers e DML direto. Projeções públicas são estritamente autenticadas.
do $$declare f record;begin
 for f in select p.oid::regprocedure assinatura from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and(p.proname like 'alm\_%' escape '\' or p.proname in('operacao_autor_destino_anexo','operacao_travar_pai_anexo','operacao_pode_enviar_anexo','listar_anexos_operacionais','cancelar_anexo_operacional','aceitar_projeto_operacional')) loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.assinatura);end loop;
end$$;
grant execute on function public.alm_ler_reserva(uuid,uuid),public.alm_ler_ferramenta(uuid,uuid),public.alm_gerir(uuid) to authenticated;
grant execute on function public.alm_listar(uuid,text,text,text,uuid,integer,integer),public.alm_opcoes(uuid,text,text,uuid,integer,integer),public.alm_obter(uuid,text,uuid),public.alm_executar(uuid,uuid,text,jsonb),public.operacao_pode_enviar_anexo(uuid,uuid),public.listar_anexos_operacionais(uuid,jsonb),public.cancelar_anexo_operacional(uuid,uuid,uuid,text),public.aceitar_projeto_operacional(uuid,uuid,uuid,text) to authenticated;
revoke all on function public.operacao_autor_ler_anexo(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.confirmar_anexo_operacional(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.confirmar_anexo_operacional(uuid,uuid,uuid,text) to service_role;
