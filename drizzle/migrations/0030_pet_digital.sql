-- PET Digital Nexus. Migração aditiva; não modifica recibos ou contratos legados.
-- Não habilita emissão: exige procedimento aprovado e integração ICP-Brasil efetiva.
-- OS e PET são domínios diferentes; presença PET nunca gera apontamento financeiro/OS.
create table public.ordens_servico (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 numero bigint generated always as identity, cliente_id uuid not null, unidade_id uuid not null,
 titulo text not null check(length(trim(titulo)) between 3 and 200), escopo text not null default '', responsavel_id uuid,
 estado text not null default 'aberta' check(estado in('aberta','em_execucao','concluida','cancelada')),
 version integer not null default 1, created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,cliente_id,unidade_id) references public.unidades(organization_id,cliente_id,id),
 foreign key(organization_id,responsavel_id) references public.pessoas(organization_id,id)
);
create table public.os_participantes (
 organization_id uuid not null, os_id uuid not null, pessoa_id uuid not null, funcao text not null default 'equipe',
 primary key(organization_id,os_id,pessoa_id), foreign key(organization_id,os_id) references public.ordens_servico(organization_id,id),
 foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id)
);
create table public.os_apontamentos (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, os_id uuid not null, pessoa_id uuid not null,
 inicio timestamptz not null, fim timestamptz not null check(fim>inicio), descricao text not null,
 fonte text not null default 'apontamento_os' check(fonte='apontamento_os'), chave uuid not null,
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 unique(organization_id,chave), foreign key(organization_id,os_id) references public.ordens_servico(organization_id,id),
 foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id)
);
create table public.pet_espacos (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), unidade_id uuid not null,
 identificacao text not null check(length(trim(identificacao)) between 2 and 200), localizacao text not null check(length(trim(localizacao)) between 3 and 1000),
 caracteristicas text not null default '', referencias_tecnicas jsonb not null default '[]', ativo boolean not null default true,
 version integer not null default 1, created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,unidade_id,id), unique(organization_id,unidade_id,identificacao),
 foreign key(organization_id,unidade_id) references public.unidades(organization_id,id)
);
create table public.pet_modelos (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), nome text not null,
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), unique(organization_id,id)
);
-- A designação técnica é um ato de governança externo ao editor de formulários.
-- Somente manutenção autorizada pode nomear o responsável; papel admin não basta para aprovar procedimentos.
create table public.pet_responsaveis_tecnicos (
 organization_id uuid not null, pessoa_id uuid not null, designacao text not null, inicio timestamptz not null, fim timestamptz,
 primary key(organization_id,pessoa_id,inicio), foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id), check(fim is null or fim>inicio)
);
create table public.pet_modelo_versoes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, modelo_id uuid not null, versao integer not null check(versao>0),
 procedimento jsonb not null check(jsonb_typeof(procedimento)='object'), estado text not null default 'rascunho' check(estado in('rascunho','aprovado','retirado')),
 aprovado_por uuid, aprovado_em timestamptz, declaracao_aprovacao text, sha256 text not null check(sha256~'^[0-9a-f]{64}$'),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,modelo_id,versao),
 foreign key(organization_id,modelo_id) references public.pet_modelos(organization_id,id),
 foreign key(organization_id,aprovado_por) references public.pessoas(organization_id,id),
 check((estado='aprovado' and aprovado_por is not null and aprovado_em is not null and length(declaracao_aprovacao)>=20) or estado<>'aprovado')
);
create table public.pet_permissoes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), sequencia bigint generated always as identity,
 numero text generated always as ('PET-'||lpad(sequencia::text,6,'0')) stored,
 os_id uuid not null, cliente_id uuid not null, unidade_id uuid not null, espaco_id uuid not null, modelo_versao_id uuid,
 atividade text not null check(length(trim(atividade)) between 3 and 4000), timezone text not null,
 estado_documental text not null default 'rascunho' check(estado_documental in('rascunho','em_conferencia','aguardando_assinaturas','emitida','encerramento_pendente','encerrada','cancelada')),
 condicao_operacional text not null default 'nao_liberada' check(condicao_operacional in('nao_liberada','liberada','em_atividade','interrompida','emergencia','terminada')),
 termino_previsto timestamptz not null, emitida_em timestamptz, termino_operacional_em timestamptz, encerrada_em timestamptz,
 retencao_ate timestamptz, conteudo jsonb not null default '{}' check(jsonb_typeof(conteudo)='object'),
 snapshot_identificacao jsonb not null, revisao_atual_id uuid,
 version integer not null default 1, created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,numero),
 foreign key(organization_id,cliente_id,unidade_id,os_id) references public.ordens_servico(organization_id,cliente_id,unidade_id,id),
 foreign key(organization_id,unidade_id,espaco_id) references public.pet_espacos(organization_id,unidade_id,id),
 foreign key(organization_id,modelo_versao_id) references public.pet_modelo_versoes(organization_id,id),
 check(emitida_em is null or(termino_previsto>emitida_em and termino_previsto<=emitida_em+interval '24 hours'))
);
create table public.pet_revisoes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, pet_id uuid not null, versao integer not null,
 conteudo jsonb not null, sha256 text not null check(sha256~'^[0-9a-f]{64}$'), finalidade text not null check(finalidade in('conferencia','emissao','encerramento','retificacao')),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,pet_id,id),unique(organization_id,pet_id,versao),
 foreign key(organization_id,pet_id) references public.pet_permissoes(organization_id,id)
);
alter table public.pet_permissoes add constraint pet_revisao_tenant foreign key(organization_id,id,revisao_atual_id) references public.pet_revisoes(organization_id,pet_id,id);
create table public.pet_participantes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,pet_id uuid not null,pessoa_id uuid not null,
 nome_snapshot text not null,funcao text not null check(funcao in('supervisor','vigia','substituto_vigia','trabalhador','resgate')),
 classificacao text not null check(classificacao in('interno','terceirizado')),empresa text,contato text,
 inicio timestamptz not null default now(),fim timestamptz,
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,pet_id,id),check(fim is null or fim>=inicio),
 check(classificacao<>'terceirizado' or length(trim(empresa))>=2),
 foreign key(organization_id,pet_id) references public.pet_permissoes(organization_id,id),
 foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id)
);
create unique index pet_participante_vigente on public.pet_participantes(organization_id,pet_id,pessoa_id,funcao) where fim is null;
create table public.pet_respostas (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,pet_id uuid not null,item text not null,
 resposta text not null check(resposta in('sim','nao','nao_aplicavel','nao_verificado')),justificativa text,
 conferido_por uuid not null default auth.uid() references auth.users(id),conferido_em timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,pet_id,item),foreign key(organization_id,pet_id) references public.pet_permissoes(organization_id,id)
);
create table public.pet_avaliacoes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,pet_id uuid not null,
 etapa text not null check(etapa in('inicial','apos_ventilacao','reavaliacao')),instrumento text not null,numero_serie text not null,
 responsavel_id uuid not null,momento timestamptz not null,calibracao text not null,contexto text,
 recebido_em timestamptz not null default clock_timestamp(),created_by uuid not null default auth.uid() references auth.users(id),
 unique(organization_id,id),unique(organization_id,pet_id,id),
 foreign key(organization_id,pet_id) references public.pet_permissoes(organization_id,id),foreign key(organization_id,responsavel_id) references public.pessoas(organization_id,id)
);
create table public.pet_leituras (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,pet_id uuid not null,avaliacao_id uuid not null,
 agente text not null,valor numeric not null check(valor>=0 and valor<'Infinity'::numeric),unidade text not null,origem text not null,
 unique(organization_id,id),unique(organization_id,avaliacao_id,agente),foreign key(organization_id,pet_id,avaliacao_id) references public.pet_avaliacoes(organization_id,pet_id,id)
);
-- As chaves/configurações do provedor ficam no servidor, nunca nesta tabela nem no browser.
create table public.pet_assinatura_integracoes (
 organization_id uuid primary key references public.organizations(id),provedor text not null,
 ambiente text not null check(ambiente in('homologacao','producao')),configurada boolean not null default false,
 icp_brasil boolean not null default false,verificado_em timestamptz,configuracao_referencia text not null,
 check(not configurada or(icp_brasil and verificado_em is not null))
);
create table public.pet_assinaturas (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,pet_id uuid not null,revisao_id uuid not null,pessoa_id uuid not null,participante_id uuid not null,
 finalidade text not null check(finalidade in('emissao','entrada','saida','encerramento')),declaracao text not null check(length(declaracao)>=10),
 conteudo_sha256 text not null check(conteudo_sha256~'^[0-9a-f]{64}$'),conteudo_assinado jsonb not null,metodo text not null check(metodo in('coletada_tela','aceite_autenticado','certificada_icp_brasil')),
 estado text not null default 'pendente' check(estado in('pendente','coletada','aceite_registrado','validada','falha')),
 provedor text,provedor_id text,identidade_verificada jsonb,validacao jsonb,
 evento_em timestamptz not null,assinada_em timestamptz,created_by uuid references auth.users(id) default auth.uid(),created_at timestamptz not null default now(),
 unique(organization_id,id),unique(organization_id,pet_id,id),
 foreign key(organization_id,pet_id,revisao_id) references public.pet_revisoes(organization_id,pet_id,id),
 foreign key(organization_id,pet_id,participante_id) references public.pet_participantes(organization_id,pet_id,id),
 foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id),
 check(estado<>'validada' or(metodo='certificada_icp_brasil' and provedor_id is not null and identidade_verificada is not null and validacao is not null and assinada_em is not null))
);
create table public.pet_eventos_presenca (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,pet_id uuid not null,pessoa_id uuid not null,participante_id uuid not null,revisao_id uuid not null,
 tipo text not null check(tipo in('entrada','saida','retificacao')),momento_declarado timestamptz not null,recebido_em timestamptz not null default clock_timestamp(),
 origem text not null check(origem in('online','offline','informado_posteriormente','contingencia_fisica')),
 exige_conferencia boolean not null default false,assinatura_id uuid,assinatura_pendente boolean not null default true,
 retifica_id uuid,motivo text,created_by uuid not null default auth.uid() references auth.users(id),
 unique(organization_id,id),unique(organization_id,pet_id,id),
 foreign key(organization_id,pet_id) references public.pet_permissoes(organization_id,id),foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id),
 foreign key(organization_id,pet_id,participante_id) references public.pet_participantes(organization_id,pet_id,id),
 foreign key(organization_id,pet_id,revisao_id) references public.pet_revisoes(organization_id,pet_id,id),
 foreign key(organization_id,pet_id,assinatura_id) references public.pet_assinaturas(organization_id,pet_id,id),
 foreign key(organization_id,pet_id,retifica_id) references public.pet_eventos_presenca(organization_id,pet_id,id)
);
create table public.pet_intervalos (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,pet_id uuid not null,pessoa_id uuid not null,
 entrada_id uuid not null,saida_id uuid,entrada_em timestamptz not null,saida_em timestamptz,
 unique(organization_id,id),unique(organization_id,entrada_id),unique(organization_id,saida_id),
 foreign key(organization_id,pessoa_id) references public.pessoas(organization_id,id),
 foreign key(organization_id,pet_id,entrada_id) references public.pet_eventos_presenca(organization_id,pet_id,id),
 foreign key(organization_id,pet_id,saida_id) references public.pet_eventos_presenca(organization_id,pet_id,id),
 check(saida_em is null or saida_em>=entrada_em),check((saida_id is null)=(saida_em is null))
);
-- Impede dupla entrada na mesma PET e em espaços incompatíveis, inclusive entre dispositivos.
create unique index pet_pessoa_dentro on public.pet_intervalos(organization_id,pessoa_id) where saida_em is null;
create table public.pet_eventos_operacionais (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,pet_id uuid not null,tipo text not null,motivo text not null,
 momento timestamptz not null default clock_timestamp(),dados jsonb not null default '{}',
 created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),foreign key(organization_id,pet_id) references public.pet_permissoes(organization_id,id)
);
create table public.pet_prorrogacoes (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,pet_id uuid not null,supervisor_id uuid not null,
 termino_anterior timestamptz not null,termino_novo timestamptz not null,condicoes jsonb not null,decisao text not null check(decisao in('aprovada','recusada')),
 motivo text not null,created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default clock_timestamp(),
 unique(organization_id,id),foreign key(organization_id,pet_id) references public.pet_permissoes(organization_id,id),foreign key(organization_id,supervisor_id) references public.pessoas(organization_id,id)
);
create table public.pet_documentos (
 id uuid primary key default gen_random_uuid(),organization_id uuid not null,pet_id uuid not null,revisao_id uuid not null,
 tipo text not null check(tipo in('emissao','aditamento','encerramento','relatorio_derivado','original_assinado')),
 estado text not null default 'solicitado' check(estado in('solicitado','gerando','disponivel','falha')),anexo_id uuid,
 sha256 text check(sha256~'^[0-9a-f]{64}$'),original_documento_id uuid,erro text,
 created_by uuid references auth.users(id) default auth.uid(),created_at timestamptz not null default now(),
 unique(organization_id,id),foreign key(organization_id,pet_id,revisao_id) references public.pet_revisoes(organization_id,pet_id,id),
 foreign key(organization_id,anexo_id) references public.anexos(organization_id,id),
 foreign key(organization_id,original_documento_id) references public.pet_documentos(organization_id,id),
 check(estado<>'disponivel' or(anexo_id is not null and sha256 is not null))
);
create table public.pet_assinatura_callbacks (
 organization_id uuid not null,provedor text not null,evento_id text not null,assinatura_id uuid not null,payload_sha256 text not null,
 recebido_em timestamptz not null default now(),primary key(organization_id,provedor,evento_id),
 foreign key(organization_id,assinatura_id) references public.pet_assinaturas(organization_id,id)
);
alter table public.pet_participantes add constraint pet_participante_pessoa unique(organization_id,pet_id,id,pessoa_id);
alter table public.pet_assinaturas add constraint pet_assinatura_participante_pessoa foreign key(organization_id,pet_id,participante_id,pessoa_id) references public.pet_participantes(organization_id,pet_id,id,pessoa_id);
alter table public.pet_eventos_presenca add constraint pet_evento_participante_pessoa foreign key(organization_id,pet_id,participante_id,pessoa_id) references public.pet_participantes(organization_id,pet_id,id,pessoa_id);
create unique index pet_provedor_identificador on public.pet_assinaturas(organization_id,provedor,provedor_id) where provedor_id is not null;
create index pet_lista_unidade on public.pet_permissoes(organization_id,unidade_id,created_at desc,id);
create index pet_lista_os on public.pet_permissoes(organization_id,os_id,created_at desc,id);
create index pet_equipe on public.pet_participantes(organization_id,pet_id,pessoa_id,fim);
create index pet_presenca_historico on public.pet_eventos_presenca(organization_id,pet_id,momento_declarado,id);
create index pet_eventos_historico on public.pet_eventos_operacionais(organization_id,pet_id,created_at,id);
create index pet_avaliacoes_historico on public.pet_avaliacoes(organization_id,pet_id,momento desc,id);

create function public.pet_sha256(p_valor jsonb) returns text language sql immutable set search_path='' as $$select encode(sha256(convert_to(p_valor::text,'UTF8')),'hex')$$;
create function public.pet_autor_ler(p_org uuid,p_id uuid,p_autor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.operacao_autor_pode(p_org,p_autor,'ver_operacao') and exists(select 1 from public.pet_permissoes p where p.organization_id=p_org and p.id=p_id and(
 public.operacao_autor_pode(p_org,p_autor,'gerir_operacao') or exists(select 1 from public.pet_participantes pt join public.pessoas pe on pe.organization_id=pt.organization_id and pe.id=pt.pessoa_id where pt.organization_id=p_org and pt.pet_id=p_id and pe.user_id=p_autor and pe.ativa)
 or exists(select 1 from public.ordens_servico o join public.pessoas pe on pe.organization_id=o.organization_id and pe.id=o.responsavel_id where o.organization_id=p_org and o.id=p.os_id and pe.user_id=p_autor and pe.ativa)));
$$;
create function public.pet_ler(p_org uuid,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$select public.pet_autor_ler(p_org,p_id,auth.uid())$$;
create function public.os_ler(p_org uuid,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.operacao_pode(p_org,'ver_operacao') and exists(select 1 from public.ordens_servico o where o.organization_id=p_org and o.id=p_id and(public.operacao_pode(p_org,'gerir_operacao') or public.operacao_minha_pessoa(p_org,o.responsavel_id) or exists(select 1 from public.os_participantes pt where pt.organization_id=p_org and pt.os_id=o.id and public.operacao_minha_pessoa(p_org,pt.pessoa_id)) or exists(select 1 from public.pet_permissoes p where p.organization_id=p_org and p.os_id=o.id and public.pet_ler(p_org,p.id))));
$$;
create function public.pet_operar(p_org uuid,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.pet_ler(p_org,p_id) and(public.operacao_pode(p_org,'gerir_operacao') or exists(select 1 from public.pet_participantes pt join public.pessoas pe on pe.organization_id=pt.organization_id and pe.id=pt.pessoa_id where pt.organization_id=p_org and pt.pet_id=p_id and pt.fim is null and pt.funcao in('supervisor','vigia') and pe.user_id=auth.uid() and pe.ativa));
$$;
create function public.pet_imutavel() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Evidência histórica imutável. Registre retificação com motivo.' using errcode='23514';end$$;
create function public.pet_guard() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' then raise exception 'PET e documentos devem ser preservados, inclusive após encerramento.' using errcode='23514';end if;
 if new.organization_id<>old.organization_id or new.id<>old.id or new.created_by is distinct from old.created_by or new.created_at<>old.created_at then raise exception 'Identidade e autoria imutáveis.' using errcode='23514';end if;
 if tg_table_name='pet_permissoes' then
  if(new.os_id,new.cliente_id,new.unidade_id,new.espaco_id,new.sequencia,new.snapshot_identificacao) is distinct from(old.os_id,old.cliente_id,old.unidade_id,old.espaco_id,old.sequencia,old.snapshot_identificacao) then raise exception 'O contexto histórico da PET é imutável.' using errcode='23514';end if;
  if old.estado_documental not in('rascunho','em_conferencia') and(new.conteudo,new.atividade,new.modelo_versao_id) is distinct from(old.conteudo,old.atividade,old.modelo_versao_id) then raise exception 'Conteúdo coberto por conferência/assinaturas exige nova versão formal.' using errcode='23514';end if;
 end if;
 new.version:=old.version+1;new.updated_at:=clock_timestamp();return new;
end$$;
create function public.pet_intervalo_guard() returns trigger language plpgsql set search_path='' as $$begin
 if old.saida_id is not null or(to_jsonb(new)-array['saida_id','saida_em']) is distinct from(to_jsonb(old)-array['saida_id','saida_em']) then raise exception 'Intervalo confirmado é imutável; correção exige registro auditável próprio.' using errcode='23514';end if;return new;end$$;
create function public.pet_intervalo_vinculos_guard() returns trigger language plpgsql set search_path='' as $$begin
 if not exists(select 1 from public.pet_eventos_presenca e where e.organization_id=new.organization_id and e.pet_id=new.pet_id and e.id=new.entrada_id and e.pessoa_id=new.pessoa_id and e.tipo='entrada' and e.momento_declarado=new.entrada_em) or(new.saida_id is not null and not exists(select 1 from public.pet_eventos_presenca e where e.organization_id=new.organization_id and e.pet_id=new.pet_id and e.id=new.saida_id and e.pessoa_id=new.pessoa_id and e.tipo='saida' and e.momento_declarado=new.saida_em)) then raise exception 'Intervalo não corresponde aos eventos individuais confirmados.' using errcode='23514';end if;return new;
end$$;
create trigger pet_intervalo_vinculos_guard before insert or update on public.pet_intervalos for each row execute function public.pet_intervalo_vinculos_guard();
create function public.pet_participante_guard() returns trigger language plpgsql set search_path='' as $$begin
 if old.fim is not null or(to_jsonb(new)-'fim') is distinct from(to_jsonb(old)-'fim') then raise exception 'Participação histórica imutável.' using errcode='23514';end if;return new;end$$;
create function public.pet_resposta_guard() returns trigger language plpgsql set search_path='' as $$declare pid uuid:=coalesce((to_jsonb(new)->>'pet_id')::uuid,(to_jsonb(old)->>'pet_id')::uuid);begin
 if exists(select 1 from public.pet_permissoes where id=pid and estado_documental not in('rascunho','em_conferencia')) then raise exception 'Respostas conferidas são imutáveis.' using errcode='23514';end if;
 if tg_op='DELETE' then return old;end if;return new;end$$;
do $$declare t text;begin
 foreach t in array array['ordens_servico','pet_espacos','pet_permissoes'] loop
  execute format('create trigger pet_guard before update or delete on public.%I for each row execute function public.pet_guard()',t);
 end loop;
 foreach t in array array['pet_revisoes','pet_avaliacoes','pet_leituras','pet_eventos_presenca','pet_eventos_operacionais','pet_prorrogacoes','pet_assinatura_callbacks','os_apontamentos'] loop
  execute format('create trigger pet_imutavel before update or delete on public.%I for each row execute function public.pet_imutavel()',t);
 end loop;
 foreach t in array array['ordens_servico','os_participantes','os_apontamentos','pet_espacos','pet_modelos','pet_modelo_versoes','pet_responsaveis_tecnicos','pet_permissoes','pet_revisoes','pet_participantes','pet_respostas','pet_avaliacoes','pet_leituras','pet_eventos_presenca','pet_intervalos','pet_eventos_operacionais','pet_prorrogacoes','pet_assinaturas','pet_documentos','pet_assinatura_callbacks','pet_assinatura_integracoes'] loop
  execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
 end loop;
 foreach t in array array['pet_revisoes','pet_participantes','pet_respostas','pet_avaliacoes','pet_leituras','pet_eventos_presenca','pet_intervalos','pet_eventos_operacionais','pet_prorrogacoes','pet_assinaturas','pet_documentos'] loop
  execute format('grant select on public.%I to authenticated',t);execute format('create policy pet_ler on public.%I for select to authenticated using(public.pet_ler(organization_id,pet_id))',t);
 end loop;
end$$;
create trigger pet_intervalo_guard before update on public.pet_intervalos for each row execute function public.pet_intervalo_guard();
create trigger pet_intervalo_preservar before delete on public.pet_intervalos for each row execute function public.pet_imutavel();
create trigger pet_participante_guard before update on public.pet_participantes for each row execute function public.pet_participante_guard();
create trigger pet_participante_preservar before delete on public.pet_participantes for each row execute function public.pet_imutavel();
create trigger pet_resposta_guard before update or delete on public.pet_respostas for each row execute function public.pet_resposta_guard();
grant select on public.ordens_servico,public.os_participantes,public.os_apontamentos,public.pet_espacos,public.pet_modelos,public.pet_modelo_versoes,public.pet_permissoes to authenticated;
create policy pet_ler on public.pet_permissoes for select to authenticated using(public.pet_ler(organization_id,id));
create policy os_ler on public.ordens_servico for select to authenticated using(public.os_ler(organization_id,id));
create policy os_ler on public.os_participantes for select to authenticated using(public.os_ler(organization_id,os_id));
create policy os_ler on public.os_apontamentos for select to authenticated using(public.os_ler(organization_id,os_id));
create policy pet_espaco_ler on public.pet_espacos for select to authenticated using(public.operacao_pode(organization_id,'gerir_operacao') or exists(select 1 from public.pet_permissoes p where p.organization_id=pet_espacos.organization_id and p.espaco_id=pet_espacos.id and public.pet_ler(p.organization_id,p.id)));
create policy pet_modelo_ler on public.pet_modelos for select to authenticated using(public.operacao_pode(organization_id,'ver_operacao'));
create policy pet_modelo_ler on public.pet_modelo_versoes for select to authenticated using(public.operacao_pode(organization_id,'ver_operacao'));

-- Pendências são dados de domínio, usados pela UI e reavaliados na transação de emissão.
create function public.pet_pendencias(p_org uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.pet_permissoes;m public.pet_modelo_versoes;x jsonb;y jsonb;pend jsonb:='[]';aid uuid;begin
 select * into p from public.pet_permissoes where organization_id=p_org and id=p_id;
 if not found then raise exception 'Registro indisponível.' using errcode='42501';end if;
 select * into m from public.pet_modelo_versoes where organization_id=p_org and id=p.modelo_versao_id;
 if m.id is null or m.estado<>'aprovado' then pend:=pend||jsonb_build_array(jsonb_build_object('codigo','modelo','campo','modelo_versao_id','mensagem','Selecione um procedimento versionado aprovado pelo responsável técnico.'));end if;
 if p.termino_previsto<=clock_timestamp() then pend:=pend||jsonb_build_array(jsonb_build_object('codigo','validade','campo','termino_previsto','mensagem','Informe o término da jornada futura, sem duração padrão de 24 horas.'));end if;
 if p.termino_previsto>coalesce(p.emitida_em,clock_timestamp())+interval '24 hours' then pend:=pend||jsonb_build_array(jsonb_build_object('codigo','limite','campo','termino_previsto','mensagem','O limite total da PET é de 24 horas; a validade deve corresponder à jornada.'));end if;
 for x in select to_jsonb(v) from(values('supervisor'),('vigia'),('trabalhador'),('resgate'))v(funcao) loop
  if not exists(select 1 from public.pet_participantes where organization_id=p_org and pet_id=p_id and fim is null and funcao=x->>'funcao') then
   pend:=pend||jsonb_build_array(jsonb_build_object('codigo','equipe','campo','participantes','mensagem','Relacione participante na função '||(x->>'funcao')||'.'));
  end if;
 end loop;
 if exists(select 1 from public.pet_participantes pt join public.pessoas pe on pe.organization_id=pt.organization_id and pe.id=pt.pessoa_id where pt.organization_id=p_org and pt.pet_id=p_id and pt.fim is null and not pe.ativa) then
  pend:=pend||jsonb_build_array(jsonb_build_object('codigo','pessoa_inativa','campo','participantes','mensagem','Há participante desativado no cadastro. Confira a equipe e prepare nova revisão.'));
 end if;
 if jsonb_typeof(p.conteudo->'perigos') is distinct from 'array' or jsonb_array_length(coalesce(p.conteudo->'perigos','[]'))=0 or exists(select 1 from jsonb_array_elements(coalesce(p.conteudo->'perigos','[]')) risco where length(trim(coalesce(risco->>'perigo','')))<2 or length(trim(coalesce(risco->>'medida','')))<3) then
  pend:=pend||jsonb_build_array(jsonb_build_object('codigo','perigos','campo','perigos','mensagem','Identifique os perigos e associe medidas preventivas verificadas.'));
 end if;
 if length(trim(coalesce(p.conteudo#>>'{procedimentos,comunicacao}','')))<3 or length(trim(coalesce(p.conteudo#>>'{procedimentos,resgate}','')))<3 then
  pend:=pend||jsonb_build_array(jsonb_build_object('codigo','procedimentos','campo','procedimentos','mensagem','Descreva os procedimentos operacionais de comunicação e resgate.'));
 end if;
 if coalesce(p.conteudo#>>'{monitoramento_continuo,confirmado}','false')<>'true' or length(trim(coalesce(p.conteudo#>>'{monitoramento_continuo,equipamento}','')))<2 or length(trim(coalesce(p.conteudo#>>'{monitoramento_continuo,registro}','')))<3 then
  pend:=pend||jsonb_build_array(jsonb_build_object('codigo','monitoramento','campo','monitoramento_continuo','mensagem','Confirme o monitoramento atmosférico contínuo, equipamento e registro. Leituras manuais não o substituem.'));
 end if;
 if coalesce(p.conteudo#>>'{procedimentos,dispositivo_adequado}','') not in('sim','true') then
  pend:=pend||jsonb_build_array(jsonb_build_object('codigo','dispositivo','campo','procedimentos.dispositivo_adequado','mensagem','Confira a adequação do dispositivo e dos equipamentos ao ambiente de uso.'));
 end if;
 if length(trim(coalesce(p.conteudo->>'contatos_emergencia','')))<5 then pend:=pend||jsonb_build_array(jsonb_build_object('codigo','emergencia','campo','contatos_emergencia','mensagem','Informe os contatos operacionais de emergência e resgate.'));end if;
 for x in select value from jsonb_array_elements(coalesce(m.procedimento->'itens','[]')) loop
  select to_jsonb(r) into y from public.pet_respostas r where r.organization_id=p_org and r.pet_id=p_id and r.item=x->>'id';
  if coalesce((x->>'obrigatorio')::boolean,false) and(y is null or y->>'resposta' in('nao_verificado','nao')) then
   pend:=pend||jsonb_build_array(jsonb_build_object('codigo','resposta','campo',x->>'id','mensagem','Confira o item: '||coalesce(x->>'rotulo',x->>'id')));
  elsif y->>'resposta'='nao_aplicavel' and(not coalesce((x->>'permite_na')::boolean,false) or(coalesce((x->>'justificativa_na')::boolean,true) and length(trim(coalesce(y->>'justificativa','')))<5)) then
   pend:=pend||jsonb_build_array(jsonb_build_object('codigo','na_invalido','campo',x->>'id','mensagem','Não se aplica exige previsão e justificativa no procedimento: '||coalesce(x->>'rotulo',x->>'id')));
  end if;
  -- Evidência obrigatória vem do pipeline privado confirmado, nunca de flags do formulário.
  if coalesce((x->>'evidencia_obrigatoria')::boolean,false) and not exists(select 1 from public.anexos a where a.organization_id=p_org and to_jsonb(a)->>'pet_id'=p_id::text and to_jsonb(a)->>'pet_item'=x->>'id' and a.estado='vinculado') then
   pend:=pend||jsonb_build_array(jsonb_build_object('codigo','evidencia','campo',x->>'id','mensagem','Evidência confirmada obrigatória para '||coalesce(x->>'rotulo',x->>'id')));
  end if;
 end loop;
 select id into aid from public.pet_avaliacoes where organization_id=p_org and pet_id=p_id and etapa in('inicial','apos_ventilacao','reavaliacao') order by momento desc,id desc limit 1;
 if aid is null then pend:=pend||jsonb_build_array(jsonb_build_object('codigo','avaliacao','campo','avaliacoes','mensagem','Registre avaliação atmosférica com instrumento, responsável e leituras.'));
 else
  for x in select value from jsonb_array_elements(coalesce(m.procedimento->'agentes','[]')) loop
   select to_jsonb(l) into y from public.pet_leituras l where l.organization_id=p_org and l.avaliacao_id=aid and l.agente=x->>'agente';
   if y is null or y->>'unidade' is distinct from x->>'unidade' or(nullif(x->>'minimo','') is not null and(y->>'valor')::numeric<(x->>'minimo')::numeric) or(nullif(x->>'maximo','') is not null and(y->>'valor')::numeric>(x->>'maximo')::numeric) then
    pend:=pend||jsonb_build_array(jsonb_build_object('codigo','leitura','campo','avaliacoes.'||(x->>'agente'),'mensagem','Leitura ausente ou incompatível com o critério aprovado para '||(x->>'agente')||'.'));
   end if;
  end loop;
 end if;
 for x in select value from jsonb_array_elements(coalesce(m.procedimento->'qualificacoes','[]')) loop
  if exists(select 1 from public.pet_participantes pt where pt.organization_id=p_org and pt.pet_id=p_id and pt.fim is null and pt.funcao=x->>'funcao' and not exists(select 1 from public.pessoa_qualificacoes q where q.organization_id=p_org and q.pessoa_id=pt.pessoa_id and q.competencia_id=(x->>'competencia_id')::uuid and q.estado='validada' and q.conclusao<=(clock_timestamp() at time zone p.timezone)::date and(q.validade is null or q.validade>=(p.termino_previsto at time zone p.timezone)::date))) then
   pend:=pend||jsonb_build_array(jsonb_build_object('codigo','qualificacao','campo','participantes','mensagem','Qualificação conferida/valida pendente na função '||(x->>'funcao')||'.'));
  end if;
 end loop;
 if not exists(select 1 from public.pet_assinatura_integracoes where organization_id=p_org and configurada and icp_brasil) then
  pend:=pend||jsonb_build_array(jsonb_build_object('codigo','integracao','campo','assinaturas','mensagem','Integração não configurada: assinatura certificada ICP-Brasil. A liberação permanece bloqueada.'));
 end if;
 return pend;
end$$;

create function public.pet_obter(p_org uuid,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.pet_permissoes;r jsonb;agora timestamptz:=clock_timestamp();begin
 if not public.pet_ler(p_org,p_id) then raise exception 'Registro indisponível.' using errcode='42501';end if;
 select * into p from public.pet_permissoes where organization_id=p_org and id=p_id;
 r:=jsonb_build_object('pet',to_jsonb(p)||jsonb_build_object('validade_temporal',case when p.emitida_em is null then 'nao_emitida' when p.termino_previsto<=agora then 'expirada' else 'vigente' end),
 'os',(select to_jsonb(o) from public.ordens_servico o where o.organization_id=p_org and o.id=p.os_id),
 'espaco',(select to_jsonb(e) from public.pet_espacos e where e.organization_id=p_org and e.id=p.espaco_id),
 'revisoes',coalesce((select jsonb_agg(to_jsonb(x) order by x.versao) from public.pet_revisoes x where x.organization_id=p_org and x.pet_id=p_id),'[]'),
 'participantes',coalesce((select jsonb_agg(to_jsonb(x) order by x.inicio,x.id) from public.pet_participantes x where x.organization_id=p_org and x.pet_id=p_id),'[]'),
 'respostas',coalesce((select jsonb_agg(to_jsonb(x) order by x.item) from public.pet_respostas x where x.organization_id=p_org and x.pet_id=p_id),'[]'),
 'avaliacoes',coalesce((select jsonb_agg(to_jsonb(x) order by x.momento) from public.pet_avaliacoes x where x.organization_id=p_org and x.pet_id=p_id),'[]'),
 'leituras',coalesce((select jsonb_agg(to_jsonb(x) order by x.agente) from public.pet_leituras x where x.organization_id=p_org and x.pet_id=p_id),'[]'),
 'presencas',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('assinatura_pendente',not exists(select 1 from public.pet_assinaturas a where a.organization_id=p_org and a.pet_id=p_id and a.pessoa_id=x.pessoa_id and a.finalidade=x.tipo and a.estado='validada' and a.evento_em=x.momento_declarado)) order by x.recebido_em,x.id) from public.pet_eventos_presenca x where x.organization_id=p_org and x.pet_id=p_id),'[]'),
 'intervalos',coalesce((select jsonb_agg(to_jsonb(x)||jsonb_build_object('segundos',greatest(0,floor(extract(epoch from(coalesce(x.saida_em,agora)-x.entrada_em)))),'pessoa_nome',(select pt.nome_snapshot from public.pet_participantes pt where pt.organization_id=p_org and pt.pet_id=p_id and pt.pessoa_id=x.pessoa_id order by pt.created_at desc limit 1)) order by x.entrada_em) from public.pet_intervalos x where x.organization_id=p_org and x.pet_id=p_id),'[]'),
 'eventos',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from public.pet_eventos_operacionais x where x.organization_id=p_org and x.pet_id=p_id),'[]'),
 'prorrogacoes',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from public.pet_prorrogacoes x where x.organization_id=p_org and x.pet_id=p_id),'[]'),
 'modelo',(select to_jsonb(v) from public.pet_modelo_versoes v where v.organization_id=p_org and v.id=p.modelo_versao_id),
 'assinaturas',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from public.pet_assinaturas x where x.organization_id=p_org and x.pet_id=p_id),'[]'),
 'documentos',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at,x.id) from public.pet_documentos x where x.organization_id=p_org and x.pet_id=p_id),'[]'),
 'pendencias',public.pet_pendencias(p_org,p_id),'servidor_em',agora,
 'metricas',jsonb_build_object('duracao_documental_segundos',case when p.emitida_em is not null then floor(extract(epoch from(coalesce(p.encerrada_em,agora)-p.emitida_em))) else 0 end,
 'permanencia_segundos',coalesce((select sum(greatest(0,floor(extract(epoch from(coalesce(x.saida_em,agora)-x.entrada_em))))) from public.pet_intervalos x where x.organization_id=p_org and x.pet_id=p_id),0),
 'horas_pessoa_segundos',coalesce((select sum(greatest(0,floor(extract(epoch from(coalesce(x.saida_em,agora)-x.entrada_em))))) from public.pet_intervalos x where x.organization_id=p_org and x.pet_id=p_id),0),
 'presentes',(select count(*) from public.pet_intervalos x where x.organization_id=p_org and x.pet_id=p_id and x.saida_em is null)),
 'permissoes',jsonb_build_object('editar',public.operacao_pode(p_org,'gerir_operacao') and p.estado_documental in('rascunho','em_conferencia'),'operar',public.pet_operar(p_org,p_id),'conferir',public.operacao_pode(p_org,'revisar_operacao'),'emitir',public.pet_operar(p_org,p_id),'baixar',true));
 return r;
end$$;
create function public.pet_listar(p_org uuid,p_filtros jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb;begin
 if not public.operacao_pode(p_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 select jsonb_build_object('registros',coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc,x.id),'[]'),'ordens',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at desc) from public.ordens_servico o where o.organization_id=p_org and public.os_ler(p_org,o.id)),'[]'),
 'total',(select count(*) from public.pet_permissoes p where p.organization_id=p_org and public.pet_ler(p_org,p.id) and(nullif(p_filtros->>'unidade_id','') is null or p.unidade_id=(p_filtros->>'unidade_id')::uuid) and(nullif(p_filtros->>'os_id','') is null or p.os_id=(p_filtros->>'os_id')::uuid))) into r
 from(select p.*,e.identificacao as espaco_nome,(select pt.nome_snapshot from public.pet_participantes pt where pt.organization_id=p_org and pt.pet_id=p.id and pt.funcao='supervisor' and pt.fim is null limit 1) as responsavel_nome,
 (select count(*) from public.pet_intervalos i where i.organization_id=p_org and i.pet_id=p.id and i.saida_em is null) as presentes,
 case when p.emitida_em is null then 'nao_emitida' when p.termino_previsto<=clock_timestamp() then 'expirada' else 'vigente' end as validade_temporal
 from public.pet_permissoes p join public.pet_espacos e on e.organization_id=p.organization_id and e.id=p.espaco_id
 where p.organization_id=p_org and public.pet_ler(p_org,p.id) and(nullif(p_filtros->>'unidade_id','') is null or p.unidade_id=(p_filtros->>'unidade_id')::uuid) and(nullif(p_filtros->>'os_id','') is null or p.os_id=(p_filtros->>'os_id')::uuid)
 order by p.created_at desc,p.id limit least(100,greatest(1,coalesce((p_filtros->>'limite')::integer,50))) offset greatest(0,coalesce((p_filtros->>'pagina')::integer,0))*least(100,greatest(1,coalesce((p_filtros->>'limite')::integer,50))))x;
 return r;
end$$;
create function public.pet_opcoes(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.operacao_pode(p_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 return jsonb_build_object('clientes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'razao_social',razao_social,'nome',coalesce(nome_exibicao,razao_social))) from public.clientes where organization_id=p_org and situacao='Ativo' and public.operacao_pode(p_org,'gerir_operacao')),'[]'),
 'unidades',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'cliente_id',u.cliente_id,'nome',u.nome,'endereco',u.endereco)) from public.unidades u where u.organization_id=p_org and u.arquivado_em is null and(public.operacao_pode(p_org,'gerir_operacao') or exists(select 1 from public.pet_permissoes p where p.organization_id=p_org and p.unidade_id=u.id and public.pet_ler(p_org,p.id)))),'[]'),
 'pessoas',coalesce((select jsonb_agg(jsonb_build_object('id',id,'nome',nome,'vinculo',vinculo,'funcao',funcao,'telefone_profissional',telefone_profissional)) from public.pessoas where organization_id=p_org and ativa and(public.operacao_pode(p_org,'gerir_operacao') or public.operacao_minha_pessoa(p_org,id))),'[]'),
 'espacos',coalesce((select jsonb_agg(to_jsonb(e)) from public.pet_espacos e where organization_id=p_org and ativo and(public.operacao_pode(p_org,'gerir_operacao') or exists(select 1 from public.pet_permissoes p where p.organization_id=p_org and p.espaco_id=e.id and public.pet_ler(p_org,p.id)))),'[]'),
 'modelos',coalesce((select jsonb_agg(to_jsonb(v)||jsonb_build_object('nome',m.nome)) from public.pet_modelo_versoes v join public.pet_modelos m on m.organization_id=v.organization_id and m.id=v.modelo_id where v.organization_id=p_org),'[]'),
 'ordens',coalesce((select jsonb_agg(to_jsonb(o)) from public.ordens_servico o where organization_id=p_org and public.os_ler(p_org,o.id)),'[]'),
 'integracao_assinatura',coalesce((select jsonb_build_object('configurada',configurada and icp_brasil,'provedor',provedor,'ambiente',ambiente) from public.pet_assinatura_integracoes where organization_id=p_org),jsonb_build_object('configurada',false,'mensagem','Integração não configurada')));
end$$;

create function public.pet_executar(p_org uuid,p_comando jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare cmd text:=p_comando->>'comando';d jsonb:=p_comando->'dados';chave uuid:=(p_comando->>'chave')::uuid;
 pid uuid:=nullif(d->>'pet_id','')::uuid;oid uuid:=nullif(d->>'os_id','')::uuid;eid uuid;rid uuid;sid uuid;did uuid;
 p public.pet_permissoes;o public.ordens_servico;es public.pet_espacos;pt public.pet_participantes;iv public.pet_intervalos;s public.pet_assinaturas;m public.pet_modelo_versoes;
 x jsonb;y jsonb;r jsonb;pend jsonb;snap jsonb;momento timestamptz;origem text;atual timestamptz:=clock_timestamp();func text;versao integer;ret_tipo text;ret_id uuid;papel text;begin
 perform public.ag_payload(p_comando,array['chave','comando','dados']);
 if chave is null or jsonb_typeof(d) is distinct from 'object' then raise exception 'Comando e chave idempotente obrigatórios.' using errcode='23514';end if;
 perform public.lev_travar_autor(p_org,auth.uid());
 if not public.operacao_pode(p_org,'ver_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if cmd in('criar_os','iniciar_os','concluir_os','salvar_espaco','criar_pet','salvar_rascunho','salvar_modelo') and not public.operacao_pode(p_org,'gerir_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if cmd in('conferir','aprovar_modelo','retificar') and not public.operacao_pode(p_org,'revisar_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
 if pid is not null then
  select * into p from public.pet_permissoes where organization_id=p_org and id=pid for update;
  if not found or not public.pet_ler(p_org,pid) then raise exception 'Registro indisponível.' using errcode='42501';end if;
  if cmd not in('preparar_assinatura','solicitar_documento') and not public.pet_operar(p_org,pid) then raise exception 'Acesso negado.' using errcode='42501';end if;
 end if;
 -- Recibo guarda referência, nunca dá acesso a conteúdo depois da revogação.
 r:=public.operacao_repetir(p_org,chave,'pet:'||cmd,d);
 if r is not null then
  if r->>'tipo'='pet' then return r||jsonb_build_object('detalhe',public.pet_obter(p_org,(r->>'id')::uuid));end if;
  if r->>'tipo'='os' and not public.os_ler(p_org,(r->>'id')::uuid) then raise exception 'Registro indisponível.' using errcode='42501';end if;
  return r;
 end if;
 if pid is not null and cmd not in('registrar_saida','interromper') and p.version is distinct from(d->>'expected_version')::integer then raise exception 'PET alterada por outra pessoa. Recarregue e confira antes de continuar.' using errcode='40001';end if;
 if cmd='criar_os' then
  perform public.ag_payload(d,array['cliente_id','unidade_id','titulo','escopo','responsavel_id']);
  if not exists(select 1 from public.unidades u join public.clientes c on c.organization_id=u.organization_id and c.id=u.cliente_id where u.organization_id=p_org and u.id=(d->>'unidade_id')::uuid and u.cliente_id=(d->>'cliente_id')::uuid and u.arquivado_em is null and c.situacao='Ativo') then raise exception 'Cliente/unidade indisponíveis ou de outra organização.' using errcode='23514';end if;
  if nullif(d->>'responsavel_id','') is not null and not exists(select 1 from public.pessoas where organization_id=p_org and id=(d->>'responsavel_id')::uuid and ativa) then raise exception 'Responsável indisponível.' using errcode='23514';end if;
  insert into public.ordens_servico(organization_id,cliente_id,unidade_id,titulo,escopo,responsavel_id) values(p_org,(d->>'cliente_id')::uuid,(d->>'unidade_id')::uuid,public.ag_texto(d,'titulo',3,200),coalesce(d->>'escopo',''),nullif(d->>'responsavel_id','')::uuid) returning id into ret_id;ret_tipo:='os';
 elsif cmd in('iniciar_os','concluir_os') then
  perform public.ag_payload(d,array['os_id','expected_version']);
  select * into o from public.ordens_servico where organization_id=p_org and id=oid for update;
  if not found or not public.os_ler(p_org,oid) then raise exception 'Registro indisponível.' using errcode='42501';end if;
  if o.version is distinct from(d->>'expected_version')::integer then raise exception 'OS alterada; recarregue.' using errcode='40001';end if;
  if o.estado in('concluida','cancelada') then raise exception 'OS já encerrada.' using errcode='23514';end if;
  if cmd='concluir_os' and exists(select 1 from public.pet_permissoes pp where pp.organization_id=p_org and pp.os_id=oid and(pp.estado_documental not in('encerrada','cancelada') or exists(select 1 from public.pet_intervalos i where i.organization_id=p_org and i.pet_id=pp.id and i.saida_em is null))) then raise exception 'Confira e encerre as PETs e presenças pendentes. Concluir a OS não encerra PETs.' using errcode='23514';end if;
  update public.ordens_servico set estado=case cmd when 'iniciar_os' then 'em_execucao' else 'concluida' end where id=oid;ret_tipo:='os';ret_id:=oid;
 elsif cmd='salvar_espaco' then
  perform public.ag_payload(d,array['unidade_id','identificacao','localizacao','caracteristicas','referencias_tecnicas']);
  if not exists(select 1 from public.unidades where organization_id=p_org and id=(d->>'unidade_id')::uuid and arquivado_em is null) then raise exception 'Unidade indisponível.' using errcode='23514';end if;
  insert into public.pet_espacos(organization_id,unidade_id,identificacao,localizacao,caracteristicas,referencias_tecnicas) values(p_org,(d->>'unidade_id')::uuid,public.ag_texto(d,'identificacao',2,200),public.ag_texto(d,'localizacao',3,1000),coalesce(d->>'caracteristicas',''),coalesce(d->'referencias_tecnicas','[]')) returning id into ret_id;ret_tipo:='espaco';
 elsif cmd='salvar_modelo' then
  perform public.ag_payload(d,array['nome','modelo_id','procedimento']);
  if jsonb_typeof(d->'procedimento') is distinct from 'object' then raise exception 'Informe o procedimento versionado.' using errcode='23514';end if;
  if nullif(d->>'modelo_id','') is null then insert into public.pet_modelos(organization_id,nome) values(p_org,public.ag_texto(d,'nome',3,200)) returning id into rid;
  else select id into rid from public.pet_modelos where organization_id=p_org and id=(d->>'modelo_id')::uuid for update;if rid is null then raise exception 'Modelo indisponível.' using errcode='42501';end if;end if;
  select coalesce(max(v.versao),0)+1 into versao from public.pet_modelo_versoes v where v.organization_id=p_org and v.modelo_id=rid;
  insert into public.pet_modelo_versoes(organization_id,modelo_id,versao,procedimento,sha256) values(p_org,rid,versao,d->'procedimento',public.pet_sha256(d->'procedimento')) returning id into ret_id;ret_tipo:='modelo';
 elsif cmd='aprovar_modelo' then
  perform public.ag_payload(d,array['modelo_versao_id','responsavel_id','declaracao']);
  if not exists(select 1 from public.pet_responsaveis_tecnicos t join public.pessoas pe on pe.organization_id=t.organization_id and pe.id=t.pessoa_id where t.organization_id=p_org and t.pessoa_id=(d->>'responsavel_id')::uuid and t.inicio<=atual and(t.fim is null or t.fim>atual) and pe.user_id=auth.uid() and pe.ativa and length(trim(coalesce(pe.registro_profissional,'')))>=3) then raise exception 'Aprovação exige responsável técnico designado e identificado, em sua própria sessão.' using errcode='42501';end if;
  select * into m from public.pet_modelo_versoes where organization_id=p_org and id=(d->>'modelo_versao_id')::uuid for update;
  if not found or m.estado<>'rascunho' then raise exception 'Versão indisponível para aprovação.' using errcode='23514';end if;
  if jsonb_array_length(coalesce(m.procedimento->'itens','[]'))=0 or jsonb_array_length(coalesce(m.procedimento->'agentes','[]'))=0 or jsonb_array_length(coalesce(m.procedimento->'qualificacoes','[]'))=0 or length(trim(coalesce(m.procedimento->>'procedimento_resgate','')))<10 or coalesce((m.procedimento->>'monitoramento_continuo')::boolean,false)<>true then raise exception 'Defina critérios de checklist, atmosfera, qualificações, monitoramento contínuo e resgate antes da aprovação.' using errcode='23514';end if;
  for x in select value from jsonb_array_elements(m.procedimento->'agentes') loop
   if length(trim(coalesce(x->>'agente','')))<1 or length(trim(coalesce(x->>'unidade','')))<1 or(nullif(x->>'minimo','') is null and nullif(x->>'maximo','') is null) or(nullif(x->>'minimo','') is not null and nullif(x->>'maximo','') is not null and(x->>'minimo')::numeric>(x->>'maximo')::numeric) then raise exception 'Defina agente, unidade e faixa técnica coerente em todos os critérios.' using errcode='23514';end if;
  end loop;
  update public.pet_modelo_versoes set estado='aprovado',aprovado_por=(d->>'responsavel_id')::uuid,aprovado_em=atual,declaracao_aprovacao=public.ag_texto(d,'declaracao',20,4000) where id=m.id;ret_tipo:='modelo';ret_id:=m.id;
 elsif cmd='criar_pet' then
  perform public.ag_payload(d,array['os_id','espaco_id','atividade','termino_previsto','timezone','modelo_id','modelo_versao_id']);
  select * into o from public.ordens_servico where organization_id=p_org and id=oid for update;
  if not found or not public.os_ler(p_org,oid) or o.estado in('concluida','cancelada') then raise exception 'OS indisponível para nova PET.' using errcode='23514';end if;
  select * into es from public.pet_espacos where organization_id=p_org and unidade_id=o.unidade_id and id=(d->>'espaco_id')::uuid and ativo for share;
  if not found then raise exception 'O espaço deve pertencer à unidade da OS.' using errcode='23514';end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=d->>'timezone') then raise exception 'Fuso inválido.' using errcode='23514';end if;
  if(d->>'termino_previsto')::timestamptz<=atual or(d->>'termino_previsto')::timestamptz>atual+interval '24 hours' then raise exception 'Informe o término da jornada futura, até o limite máximo de 24 horas.' using errcode='23514';end if;
  snap:=jsonb_build_object('organizacao',(select nome from public.organizations where id=p_org),'cliente',(select to_jsonb(c)-array['created_by','updated_by'] from public.clientes c where c.organization_id=p_org and c.id=o.cliente_id),'unidade',(select to_jsonb(u)-array['created_by','updated_by'] from public.unidades u where u.organization_id=p_org and u.id=o.unidade_id),'espaco',to_jsonb(es),'os',to_jsonb(o));
  insert into public.pet_permissoes(organization_id,os_id,cliente_id,unidade_id,espaco_id,modelo_versao_id,atividade,termino_previsto,timezone,snapshot_identificacao)
  values(p_org,o.id,o.cliente_id,o.unidade_id,es.id,coalesce(nullif(d->>'modelo_versao_id',''),nullif(d->>'modelo_id',''))::uuid,public.ag_texto(d,'atividade',3,4000),(d->>'termino_previsto')::timestamptz,d->>'timezone',snap) returning id into pid;
  ret_tipo:='pet';ret_id:=pid;
 elsif cmd='salvar_rascunho' then
  perform public.ag_payload(d,array['pet_id','expected_version','atividade','termino_previsto','conteudo','participantes','respostas','modelo_versao_id','modelo_id']);
  if p.estado_documental not in('rascunho','em_conferencia') then raise exception 'Conteúdo conferido/assinado não aceita alteração. Registre nova versão formal.' using errcode='23514';end if;
  if jsonb_typeof(d->'conteudo') is distinct from 'object' or jsonb_typeof(d->'participantes') is distinct from 'array' or jsonb_array_length(d->'participantes')>100 or jsonb_typeof(d->'respostas') is distinct from 'array' or jsonb_array_length(d->'respostas')>300 then raise exception 'Confira conteúdo, equipe e respostas.' using errcode='23514';end if;
  if(d->>'termino_previsto')::timestamptz<=atual or(d->>'termino_previsto')::timestamptz>atual+interval '24 hours' then raise exception 'Confira o término da jornada.' using errcode='23514';end if;
  update public.pet_permissoes set atividade=public.ag_texto(d,'atividade',3,4000),termino_previsto=(d->>'termino_previsto')::timestamptz,conteudo=d->'conteudo',modelo_versao_id=coalesce(nullif(d->>'modelo_versao_id','')::uuid,nullif(d->>'modelo_id','')::uuid,p.modelo_versao_id),estado_documental='rascunho',revisao_atual_id=null where id=pid;
  update public.pet_participantes set fim=atual where organization_id=p_org and pet_id=pid and fim is null and not exists(select 1 from jsonb_array_elements(d->'participantes') pp where(pp->>'pessoa_id')::uuid=pet_participantes.pessoa_id and pp->>'funcao'=pet_participantes.funcao and pp->>'classificacao'=pet_participantes.classificacao and coalesce(pp->>'empresa','')=coalesce(pet_participantes.empresa,''));
  for x in select value from jsonb_array_elements(d->'participantes') loop
   perform public.ag_payload(x,array['pessoa_id','funcao','classificacao','empresa','contato']);
   if not exists(select 1 from public.pessoas where organization_id=p_org and id=(x->>'pessoa_id')::uuid and ativa) then raise exception 'Pessoa indisponível ou de outra organização.' using errcode='23514';end if;
   insert into public.pet_participantes(organization_id,pet_id,pessoa_id,nome_snapshot,funcao,classificacao,empresa,contato,inicio) select p_org,pid,pe.id,pe.nome,x->>'funcao',x->>'classificacao',nullif(x->>'empresa',''),x->>'contato',atual from public.pessoas pe where pe.organization_id=p_org and pe.id=(x->>'pessoa_id')::uuid on conflict(organization_id,pet_id,pessoa_id,funcao) where fim is null do nothing;
  end loop;
  delete from public.pet_respostas where organization_id=p_org and pet_id=pid;
  for x in select value from jsonb_array_elements(d->'respostas') loop
   perform public.ag_payload(x,array['item','resposta','justificativa']);
   insert into public.pet_respostas(organization_id,pet_id,item,resposta,justificativa) values(p_org,pid,public.ag_texto(x,'item',1,160),x->>'resposta',x->>'justificativa');
  end loop;ret_tipo:='pet';ret_id:=pid;
 elsif cmd='registrar_avaliacao' then
  perform public.ag_payload(d,array['pet_id','expected_version','etapa','instrumento','numero_serie','responsavel_id','momento','calibracao','contexto','leituras']);
  if p.estado_documental in('aguardando_assinaturas','encerrada','cancelada') then raise exception 'Revisão congelada/encerrada não recebe avaliação; prepare nova conferência antes da emissão.' using errcode='23514';end if;
  if not exists(select 1 from public.pet_participantes where organization_id=p_org and pet_id=pid and pessoa_id=(d->>'responsavel_id')::uuid and fim is null and funcao in('supervisor','vigia','substituto_vigia')) then raise exception 'Responsável deve estar formalmente relacionado à PET.' using errcode='23514';end if;
  momento:=(d->>'momento')::timestamptz;if momento>atual+interval '30 seconds' or momento<p.created_at-interval '1 day' then raise exception 'Confira o horário real da avaliação.' using errcode='23514';end if;
  if jsonb_typeof(d->'leituras') is distinct from 'array' or jsonb_array_length(d->'leituras') not between 1 and 30 then raise exception 'Informe leituras estruturadas.' using errcode='23514';end if;
  insert into public.pet_avaliacoes(organization_id,pet_id,etapa,instrumento,numero_serie,responsavel_id,momento,calibracao,contexto) values(p_org,pid,d->>'etapa',public.ag_texto(d,'instrumento',2,200),public.ag_texto(d,'numero_serie',2,200),(d->>'responsavel_id')::uuid,momento,public.ag_texto(d,'calibracao',3,1000),d->>'contexto') returning id into eid;
  for x in select value from jsonb_array_elements(d->'leituras') loop
   perform public.ag_payload(x,array['agente','valor','unidade','origem']);
   insert into public.pet_leituras(organization_id,pet_id,avaliacao_id,agente,valor,unidade,origem) values(p_org,pid,eid,public.ag_texto(x,'agente',1,100),(x->>'valor')::numeric,public.ag_texto(x,'unidade',1,40),public.ag_texto(x,'origem',2,200));
  end loop;
  update public.pet_permissoes set version=version where id=pid;ret_tipo:='pet';ret_id:=pid;
 elsif cmd='conferir' then
  perform public.ag_payload(d,array['pet_id','expected_version']);
  if p.estado_documental not in('rascunho','em_conferencia') then raise exception 'PET não está em preparação.' using errcode='23514';end if;
  pend:=public.pet_pendencias(p_org,pid);
  -- Integração pode estar ausente na conferência; permanece bloqueio obrigatório na emissão.
  if exists(select 1 from jsonb_array_elements(pend) pend_item where pend_item->>'codigo'<>'integracao') then raise exception '%',pend using errcode='23514';end if;
  snap:=jsonb_build_object('identificacao',p.snapshot_identificacao,'atividade',p.atividade,'termino_previsto',p.termino_previsto,'timezone',p.timezone,'conteudo',p.conteudo,'modelo_versao_id',p.modelo_versao_id,
   'participantes',coalesce((select jsonb_agg(to_jsonb(pt) order by pt.id) from public.pet_participantes pt where pt.organization_id=p_org and pt.pet_id=pid and pt.fim is null),'[]'),
   'respostas',coalesce((select jsonb_agg(to_jsonb(rr) order by rr.item) from public.pet_respostas rr where rr.organization_id=p_org and rr.pet_id=pid),'[]'),
   'avaliacoes',coalesce((select jsonb_agg(to_jsonb(av) order by av.momento) from public.pet_avaliacoes av where av.organization_id=p_org and av.pet_id=pid),'[]'),
   'leituras',coalesce((select jsonb_agg(to_jsonb(l) order by l.id) from public.pet_leituras l where l.organization_id=p_org and l.pet_id=pid),'[]'),
   'evidencias',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'item',to_jsonb(a)->>'pet_item','nome',a.nome,'sha256',a.sha256,'tamanho',a.tamanho,'mime',a.mime) order by a.id) from public.anexos a where a.organization_id=p_org and to_jsonb(a)->>'pet_id'=pid::text and a.estado='vinculado'),'[]'));
  select coalesce(max(v.versao),0)+1 into versao from public.pet_revisoes v where v.organization_id=p_org and v.pet_id=pid;
  insert into public.pet_revisoes(organization_id,pet_id,versao,conteudo,sha256,finalidade) values(p_org,pid,versao,snap,public.pet_sha256(snap),'conferencia') returning id into rid;
  update public.pet_permissoes set revisao_atual_id=rid,estado_documental='aguardando_assinaturas' where id=pid;ret_tipo:='pet';ret_id:=pid;
 elsif cmd='preparar_assinatura' then
  perform public.ag_payload(d,array['pet_id','expected_version','participante_id','finalidade','declaracao','metodo','evento_em']);
  if p.revisao_atual_id is null or p.estado_documental in('rascunho','em_conferencia','cancelada','encerrada') then raise exception 'Congele a conferência antes de preparar assinaturas.' using errcode='23514';end if;
  select * into pt from public.pet_participantes where organization_id=p_org and pet_id=pid and id=(d->>'participante_id')::uuid;
  if not found or not public.operacao_minha_pessoa(p_org,pt.pessoa_id) then raise exception 'Cada signatário deve se identificar em sessão própria; o supervisor não assina pela equipe. Pessoas sem login exigem provedor individual configurado.' using errcode='42501';end if;
  if d->>'finalidade'='emissao' and p.estado_documental<>'aguardando_assinaturas' then raise exception 'Assinatura de emissão fora da conferência.' using errcode='23514';end if;
  if d->>'finalidade' in('entrada','saida') and(p.emitida_em is null or pt.funcao<>'trabalhador') then raise exception 'Ato de presença exige trabalhador relacionado e PET emitida.' using errcode='23514';end if;
  if d->>'finalidade'='encerramento' and not exists(select 1 from public.pet_revisoes v where v.id=p.revisao_atual_id and v.finalidade='encerramento') then raise exception 'Prepare e confira o snapshot final antes das assinaturas de encerramento.' using errcode='23514';end if;
  if d->>'metodo'='certificada_icp_brasil' and not exists(select 1 from public.pet_assinatura_integracoes where organization_id=p_org and configurada and icp_brasil) then raise exception 'Integração não configurada: assinatura certificada ICP-Brasil.' using errcode='23514';end if;
  if d->>'metodo' not in('certificada_icp_brasil','aceite_autenticado') then raise exception 'Coleta na tela exige transporte próprio; não equivale a certificação.' using errcode='23514';end if;
  momento:=coalesce(nullif(d->>'evento_em','')::timestamptz,atual);
  snap:=jsonb_build_object('pet_id',pid,'revisao_id',p.revisao_atual_id,'revisao_sha256',(select v.sha256 from public.pet_revisoes v where v.id=p.revisao_atual_id),'pessoa_id',pt.pessoa_id,'participante_id',pt.id,'funcao',pt.funcao,'finalidade',d->>'finalidade','declaracao',public.ag_texto(d,'declaracao',10,4000),'evento_em',momento);
  insert into public.pet_assinaturas(organization_id,pet_id,revisao_id,pessoa_id,participante_id,finalidade,declaracao,conteudo_sha256,conteudo_assinado,metodo,estado,evento_em,assinada_em)
  values(p_org,pid,p.revisao_atual_id,pt.pessoa_id,pt.id,d->>'finalidade',d->>'declaracao',public.pet_sha256(snap),snap,d->>'metodo',case d->>'metodo' when 'aceite_autenticado' then 'aceite_registrado' else 'pendente' end,momento,case when d->>'metodo'='aceite_autenticado' then atual end);
  ret_tipo:='pet';ret_id:=pid;
 elsif cmd='emitir' then
  perform public.ag_payload(d,array['pet_id','expected_version']);
  if p.estado_documental<>'aguardando_assinaturas' then raise exception 'Conclua a conferência e as assinaturas antes da emissão.' using errcode='23514';end if;
  pend:=public.pet_pendencias(p_org,pid);if jsonb_array_length(pend)>0 then raise exception '%',pend using errcode='23514';end if;
  for papel in select unnest(array['supervisor','vigia']) loop
   if not exists(select 1 from public.pet_assinaturas a join public.pet_participantes pt on pt.organization_id=a.organization_id and pt.id=a.participante_id join public.pet_revisoes v on v.organization_id=a.organization_id and v.id=a.revisao_id where a.organization_id=p_org and a.pet_id=pid and a.revisao_id=p.revisao_atual_id and a.finalidade='emissao' and a.estado='validada' and a.metodo='certificada_icp_brasil' and (a.conteudo_assinado->>'revisao_sha256')=v.sha256 and a.conteudo_sha256=public.pet_sha256(a.conteudo_assinado) and pt.pessoa_id=a.pessoa_id and pt.fim is null and pt.funcao=papel) then raise exception 'Assinatura certificada validada de % pendente para o conteúdo atual.',papel using errcode='23514';end if;
  end loop;
  if not exists(select 1 from public.pet_documentos where organization_id=p_org and pet_id=pid and revisao_id=p.revisao_atual_id and tipo in('emissao','original_assinado') and estado='disponivel') then raise exception 'Disponibilize o documento original de emissão ao vigia antes de liberar a operação.' using errcode='23514';end if;
  update public.pet_permissoes set estado_documental='emitida',condicao_operacional='liberada',emitida_em=atual,retencao_ate=atual+interval '5 years' where id=pid;
  insert into public.pet_eventos_operacionais(organization_id,pet_id,tipo,motivo,dados) values(p_org,pid,'emissao','PET emitida com documento e assinaturas certificadas validadas',jsonb_build_object('revisao_id',p.revisao_atual_id));ret_tipo:='pet';ret_id:=pid;
 elsif cmd in('registrar_entrada','registrar_saida') then
  perform public.ag_payload(d,array['pet_id','expected_version','pessoa_id','momento','origem','declaracao','assinatura_id','revisao_id','motivo']);
  momento:=coalesce(nullif(d->>'momento','')::timestamptz,atual);origem:=coalesce(d->>'origem','online');
  if origem not in('online','offline','informado_posteriormente','contingencia_fisica') or momento>atual+interval '30 seconds' then raise exception 'Origem ou horário inválidos.' using errcode='23514';end if;
  select * into pt from public.pet_participantes where organization_id=p_org and pet_id=pid and pessoa_id=(d->>'pessoa_id')::uuid and funcao='trabalhador' and inicio<=momento and(fim is null or fim>=momento) order by inicio desc limit 1;
  if not found then raise exception 'Trabalhador não relacionado para este período.' using errcode='23514';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pet-presenca:'||p_org::text||pt.pessoa_id::text,0));
  select * into iv from public.pet_intervalos where organization_id=p_org and pessoa_id=pt.pessoa_id and saida_em is null for update;
  if cmd='registrar_entrada' then
   if p.estado_documental<>'emitida' or p.condicao_operacional not in('liberada','em_atividade') or p.emitida_em is null or atual>=p.termino_previsto or momento<p.emitida_em or momento>=p.termino_previsto then raise exception 'Entrada bloqueada: confira liberação, validade e condição operacional da PET.' using errcode='23514';end if;
   if origem<>'online' or momento<atual-interval '5 minutes' then raise exception 'Entrada offline/tardia requer conferência formal da contingência; não há liberação digital retroativa.' using errcode='23514';end if;
   if iv.id is not null then raise exception 'A pessoa já possui uma entrada sem saída. Confira a presença antes de repetir.' using errcode='23505';end if;
   if nullif(d->>'revisao_id','') is not null and(d->>'revisao_id')::uuid<>p.revisao_atual_id then raise exception 'Versão divergente da PET emitida.' using errcode='40001';end if;
   select * into m from public.pet_modelo_versoes where organization_id=p_org and id=p.modelo_versao_id;
   if m.estado is distinct from 'aprovado' then raise exception 'Procedimento retirado ou não aprovado; novas entradas bloqueadas.' using errcode='23514';end if;
   select * into s from public.pet_assinaturas where organization_id=p_org and pet_id=pid and id=nullif(d->>'assinatura_id','')::uuid;
   if s.id is null or s.pessoa_id<>pt.pessoa_id or s.participante_id<>pt.id or s.revisao_id<>p.revisao_atual_id or s.finalidade<>'entrada' or s.estado<>'validada' or s.metodo<>'certificada_icp_brasil' or s.evento_em<momento-interval '10 minutes' or s.evento_em>momento+interval '30 seconds' or exists(select 1 from public.pet_eventos_presenca e where e.organization_id=p_org and e.assinatura_id=s.id) then raise exception 'Identificação e assinatura individual de entrada pendentes ou inconsistentes.' using errcode='23514';end if;
   -- A reavaliação imediatamente anterior é registrada pelo supervisor, fora do espaço.
   select av.id into eid from public.pet_avaliacoes av join public.pet_participantes pp on pp.organization_id=av.organization_id and pp.pet_id=av.pet_id and pp.pessoa_id=av.responsavel_id where av.organization_id=p_org and av.pet_id=pid and av.momento<=momento and av.momento>=momento-make_interval(mins=>least(10,greatest(1,coalesce((m.procedimento->>'avaliacao_max_minutos')::integer,5)))) and pp.funcao='supervisor' and pp.fim is null order by av.momento desc,av.id desc limit 1;
   if eid is null then raise exception 'Registre a avaliação atmosférica imediatamente antes da entrada, pelo supervisor fora do espaço.' using errcode='23514';end if;
   for x in select value from jsonb_array_elements(m.procedimento->'agentes') loop
    select to_jsonb(l) into y from public.pet_leituras l where l.organization_id=p_org and l.avaliacao_id=eid and l.agente=x->>'agente';
    if y is null or y->>'unidade' is distinct from x->>'unidade' or(nullif(x->>'minimo','') is not null and(y->>'valor')::numeric<(x->>'minimo')::numeric) or(nullif(x->>'maximo','') is not null and(y->>'valor')::numeric>(x->>'maximo')::numeric) then raise exception 'A avaliação imediatamente anterior está incompleta ou incompatível com o procedimento.' using errcode='23514';end if;
   end loop;
   pend:=public.pet_pendencias(p_org,pid);if jsonb_array_length(pend)>0 then raise exception '%',pend using errcode='23514';end if;
   insert into public.pet_eventos_presenca(organization_id,pet_id,pessoa_id,participante_id,revisao_id,tipo,momento_declarado,origem,exige_conferencia,assinatura_id,assinatura_pendente)
   values(p_org,pid,pt.pessoa_id,pt.id,p.revisao_atual_id,'entrada',momento,origem,false,s.id,false) returning id into eid;
   insert into public.pet_intervalos(organization_id,pet_id,pessoa_id,entrada_id,entrada_em) values(p_org,pid,pt.pessoa_id,eid,momento);
   update public.pet_permissoes set condicao_operacional='em_atividade' where id=pid;
  else
   -- Saída é um fato: expiração, interrupção, assinatura/provedor indisponível e versão UI antiga não o bloqueiam.
   if iv.id is null then
    select id into eid from public.pet_eventos_presenca where organization_id=p_org and pet_id=pid and pessoa_id=pt.pessoa_id and tipo='saida' order by recebido_em desc limit 1;
    if eid is null then raise exception 'Não há entrada aberta para esta pessoa nesta PET.' using errcode='23514';end if;
   else
    if iv.pet_id<>pid then raise exception 'A entrada aberta pertence a outra PET; registre a saída na permissão correta.' using errcode='23514';end if;
    if momento<iv.entrada_em then raise exception 'Saída não pode ser anterior à entrada. Preserve o registro e solicite correção justificada.' using errcode='23514';end if;
    select * into s from public.pet_assinaturas where organization_id=p_org and pet_id=pid and id=nullif(d->>'assinatura_id','')::uuid;
    if s.id is not null and(s.pessoa_id<>pt.pessoa_id or s.finalidade<>'saida' or s.revisao_id<>p.revisao_atual_id or exists(select 1 from public.pet_eventos_presenca e where e.organization_id=p_org and e.assinatura_id=s.id)) then s.id:=null;end if;
    insert into public.pet_eventos_presenca(organization_id,pet_id,pessoa_id,participante_id,revisao_id,tipo,momento_declarado,origem,exige_conferencia,assinatura_id,assinatura_pendente,motivo)
    values(p_org,pid,pt.pessoa_id,pt.id,p.revisao_atual_id,'saida',momento,origem,origem<>'online' or momento<atual-interval '5 minutes',s.id,not coalesce(s.estado='validada',false),d->>'motivo') returning id into eid;
    update public.pet_intervalos set saida_id=eid,saida_em=momento where id=iv.id;
    if not exists(select 1 from public.pet_intervalos where organization_id=p_org and pet_id=pid and saida_em is null) then
     update public.pet_permissoes set estado_documental='encerramento_pendente',condicao_operacional='terminada',termino_operacional_em=momento where id=pid;
     insert into public.pet_eventos_operacionais(organization_id,pet_id,tipo,motivo,momento) values(p_org,pid,'saida_toda_equipe','Saída da última pessoa: conferir encerramento ou condições formais de continuidade (NR-33 33.5.11/12).',momento);
    else update public.pet_permissoes set version=version where id=pid;end if;
   end if;
  end if;ret_tipo:='pet';ret_id:=pid;
 elsif cmd='interromper' then
  perform public.ag_payload(d,array['pet_id','expected_version','motivo','tipo','momento','origem']);
  if p.emitida_em is null or p.estado_documental in('encerrada','cancelada') then raise exception 'PET não possui operação aberta.' using errcode='23514';end if;
  momento:=coalesce(nullif(d->>'momento','')::timestamptz,atual);
  if momento>atual+interval '30 seconds' or momento<p.emitida_em then raise exception 'Confira o horário da ocorrência.' using errcode='23514';end if;
  func:=coalesce(d->>'tipo','interrupcao');if func not in('interrupcao','emergencia','condicao_imprevista') then raise exception 'Tipo inválido.' using errcode='23514';end if;
  insert into public.pet_eventos_operacionais(organization_id,pet_id,tipo,motivo,momento,dados) values(p_org,pid,func,public.ag_texto(d,'motivo',5,4000),momento,jsonb_build_object('origem',coalesce(d->>'origem','online'),'resgate_acionado',false));
  update public.pet_permissoes set estado_documental='encerramento_pendente',condicao_operacional=case when func='emergencia' then 'emergencia' else 'interrompida' end,termino_operacional_em=coalesce(termino_operacional_em,momento) where id=pid;
  ret_tipo:='pet';ret_id:=pid;
 elsif cmd='avaliar_prorrogacao' then
  perform public.ag_payload(d,array['pet_id','expected_version','supervisor_id','termino_novo','condicoes','motivo']);
  if p.emitida_em is null or p.estado_documental not in('emitida','encerramento_pendente') or atual>=p.termino_previsto or p.condicao_operacional in('emergencia','interrompida') then raise exception 'PET sem condições de continuidade; prepare nova permissão.' using errcode='23514';end if;
  if not exists(select 1 from public.pet_participantes where organization_id=p_org and pet_id=pid and pessoa_id=(d->>'supervisor_id')::uuid and funcao='supervisor' and fim is null and public.operacao_minha_pessoa(p_org,pessoa_id)) then raise exception 'A decisão cabe ao supervisor relacionado, identificado em sua sessão.' using errcode='42501';end if;
  select * into m from public.pet_modelo_versoes where organization_id=p_org and id=p.modelo_versao_id;
  if coalesce((m.procedimento->>'permite_prorrogacao')::boolean,false)<>true then raise exception 'Procedimento aprovado não autoriza continuidade.' using errcode='23514';end if;
  if(d->>'termino_novo')::timestamptz<p.termino_previsto or(d->>'termino_novo')::timestamptz>p.emitida_em+interval '24 hours' then raise exception 'A prorrogação não pode reduzir a validade nem ultrapassar 24 horas totais desde a emissão.' using errcode='23514';end if;
  -- Condições cumulativas NR-33 33.5.12.1 a-g. Não há renovação automática de 24h.
  foreach func in array array['mesmas_atividades_riscos','intervalos_parada_retomada_registrados','trabalhadores_vigias_supervisores_relacionados','continuidade_e_substituicao_registradas','atmosfera_condicoes_mantidas_ou_nova_avaliacao_cada_entrada','vigia_presenca_continua_inclusive_pausas','medidas_prevencao_reavaliadas_cada_entrada','monitoramento_continuo'] loop
   if coalesce(d->'condicoes'->>func,'false')<>'true' then raise exception 'Prorrogação recusada: condição % não comprovada.',func using errcode='23514';end if;
  end loop;
  if exists(select 1 from public.pet_eventos_operacionais where organization_id=p_org and pet_id=pid and tipo in('emergencia','condicao_imprevista')) then raise exception 'Ocorrência incompatível com a prorrogação; emita nova PET.' using errcode='23514';end if;
  pend:=public.pet_pendencias(p_org,pid);if jsonb_array_length(pend)>0 then raise exception '%',pend using errcode='23514';end if;
  -- O adaptador de aditamento ainda não vincula decisão/condições a um original certificado.
  -- Falha fechada: documento disponível e booleanos de checklist não bastam para renovar a PET.
  raise exception 'Prorrogação bloqueada: integração de aditamento certificado com hash da decisão e evidências não configurada. Prepare nova PET ou siga a contingência física aprovada.' using errcode='23514';
 elsif cmd='trocar_vigia' then
  perform public.ag_payload(d,array['pet_id','expected_version','pessoa_id','motivo']);
  if p.emitida_em is null or p.estado_documental<>'emitida' or p.termino_previsto<=atual then raise exception 'Troca de vigia exige PET emitida e vigente.' using errcode='23514';end if;
  select * into pt from public.pet_participantes where organization_id=p_org and pet_id=pid and pessoa_id=(d->>'pessoa_id')::uuid and funcao='substituto_vigia' and fim is null;
  if not found then raise exception 'Vigia não relacionado: encerre a PET (NR-33 33.5.11 d). Não substitua sem previsão formal.' using errcode='23514';end if;
  if not exists(select 1 from public.pet_assinaturas where organization_id=p_org and pet_id=pid and participante_id=pt.id and revisao_id=p.revisao_atual_id and finalidade='emissao' and estado='validada') then raise exception 'Assinatura certificada do substituto relacionada à emissão pendente.' using errcode='23514';end if;
  update public.pet_participantes set fim=atual where organization_id=p_org and pet_id=pid and funcao='vigia' and fim is null;
  insert into public.pet_participantes(organization_id,pet_id,pessoa_id,nome_snapshot,funcao,classificacao,empresa,contato,inicio) values(p_org,pid,pt.pessoa_id,pt.nome_snapshot,'vigia',pt.classificacao,pt.empresa,pt.contato,atual);
  insert into public.pet_eventos_operacionais(organization_id,pet_id,tipo,motivo,dados) values(p_org,pid,'passagem_vigia',public.ag_texto(d,'motivo',5,4000),jsonb_build_object('substituto_participante_id',pt.id,'pessoa_id',pt.pessoa_id));
  update public.pet_permissoes set version=version where id=pid;ret_tipo:='pet';ret_id:=pid;
 elsif cmd='encerrar' then
  perform public.ag_payload(d,array['pet_id','expected_version','motivo','condicao_final','conferencia_presenca']);
  if p.emitida_em is null or p.estado_documental in('encerrada','cancelada') then raise exception 'PET indisponível para encerramento.' using errcode='23514';end if;
  if exists(select 1 from public.pet_intervalos where organization_id=p_org and pet_id=pid and saida_em is null) then raise exception 'Há pessoas com entrada sem saída. A pendência de presença deve ser resolvida primeiro.' using errcode='23514';end if;
  if coalesce(d->>'conferencia_presenca','false')<>'true' or length(trim(coalesce(d->>'condicao_final','')))<10 then raise exception 'Confira presença e descreva a condição final do trabalho.' using errcode='23514';end if;
  select * into m from public.pet_modelo_versoes where organization_id=p_org and id=p.modelo_versao_id;
  if not exists(select 1 from public.pet_revisoes v where v.id=p.revisao_atual_id and v.finalidade='encerramento' and v.conteudo->>'condicao_final'=d->>'condicao_final' and v.conteudo->>'motivo'=d->>'motivo') then
   insert into public.pet_eventos_operacionais(organization_id,pet_id,tipo,motivo,dados) values(p_org,pid,'conferencia_encerramento',public.ag_texto(d,'motivo',5,4000),jsonb_build_object('condicao_final',d->>'condicao_final','conferencia_presenca',true));
   snap:=jsonb_build_object('pet_id',pid,'numero',p.numero,'identificacao',p.snapshot_identificacao,'atividade',p.atividade,'condicao_final',d->>'condicao_final','motivo',d->>'motivo','termino_operacional_em',coalesce(p.termino_operacional_em,atual),
    'emissao',(select v.conteudo from public.pet_revisoes v where v.organization_id=p_org and v.pet_id=pid and v.finalidade='conferencia' order by v.versao desc limit 1),
    'presencas',coalesce((select jsonb_agg(to_jsonb(e) order by e.recebido_em,e.id) from public.pet_eventos_presenca e where e.organization_id=p_org and e.pet_id=pid),'[]'),
    'intervalos',coalesce((select jsonb_agg(to_jsonb(i) order by i.entrada_em,i.id) from public.pet_intervalos i where i.organization_id=p_org and i.pet_id=pid),'[]'),
    'eventos',coalesce((select jsonb_agg(to_jsonb(ev) order by ev.created_at,ev.id) from public.pet_eventos_operacionais ev where ev.organization_id=p_org and ev.pet_id=pid),'[]'));
   select coalesce(max(v.versao),0)+1 into versao from public.pet_revisoes v where v.organization_id=p_org and v.pet_id=pid;
   insert into public.pet_revisoes(organization_id,pet_id,versao,conteudo,sha256,finalidade) values(p_org,pid,versao,snap,public.pet_sha256(snap),'encerramento') returning id into rid;
   update public.pet_permissoes set revisao_atual_id=rid,condicao_operacional='terminada',termino_operacional_em=coalesce(termino_operacional_em,atual),estado_documental='encerramento_pendente' where id=pid;
  else rid:=p.revisao_atual_id;end if;
  if exists(select 1 from public.pet_eventos_presenca e where e.organization_id=p_org and e.pet_id=pid and e.tipo='saida' and not exists(select 1 from public.pet_assinaturas a where a.organization_id=p_org and a.pet_id=pid and a.pessoa_id=e.pessoa_id and a.finalidade='saida' and a.estado='validada' and a.evento_em=e.momento_declarado)) then
   insert into public.pet_eventos_operacionais(organization_id,pet_id,tipo,motivo) values(p_org,pid,'pendencia_documental','Término operacional registrado; assinaturas individuais de saída pendentes.');
  elsif exists(select 1 from unnest(array['supervisor','vigia']) papel_final where not exists(select 1 from public.pet_assinaturas a join public.pet_participantes pp on pp.organization_id=a.organization_id and pp.id=a.participante_id join public.pet_revisoes rv on rv.organization_id=a.organization_id and rv.id=a.revisao_id where a.organization_id=p_org and a.pet_id=pid and a.revisao_id=rid and a.finalidade='encerramento' and a.estado='validada' and pp.funcao=papel_final and(a.conteudo_assinado->>'revisao_sha256')=rv.sha256)) then
   insert into public.pet_eventos_operacionais(organization_id,pet_id,tipo,motivo) values(p_org,pid,'pendencia_documental','Término operacional registrado; assinaturas certificadas da revisão final pendentes.');
  elsif not exists(select 1 from public.pet_documentos doc where doc.organization_id=p_org and doc.pet_id=pid and doc.revisao_id=rid and doc.tipo in('encerramento','original_assinado') and doc.estado='disponivel') then
   insert into public.pet_eventos_operacionais(organization_id,pet_id,tipo,motivo) values(p_org,pid,'pendencia_documental','Documento original certificado do encerramento pendente.');
  else update public.pet_permissoes set estado_documental='encerrada',encerrada_em=atual where id=pid;
  end if;ret_tipo:='pet';ret_id:=pid;
 elsif cmd='cancelar' then
  perform public.ag_payload(d,array['pet_id','expected_version','motivo']);
  if not public.operacao_pode(p_org,'gerir_operacao') then raise exception 'Acesso negado.' using errcode='42501';end if;
  if p.emitida_em is not null then raise exception 'PET emitida exige encerramento preservando presenças e assinaturas.' using errcode='23514';end if;
  insert into public.pet_eventos_operacionais(organization_id,pet_id,tipo,motivo) values(p_org,pid,'cancelamento',public.ag_texto(d,'motivo',5,4000));
  update public.pet_permissoes set estado_documental='cancelada',condicao_operacional='terminada',encerrada_em=atual where id=pid;ret_tipo:='pet';ret_id:=pid;
 elsif cmd='solicitar_documento' then
  perform public.ag_payload(d,array['pet_id','expected_version','tipo']);
  if p.revisao_atual_id is null then raise exception 'Congele uma revisão antes da emissão de documentos.' using errcode='23514';end if;
  if d->>'tipo' not in('emissao','aditamento','encerramento','relatorio_derivado') then raise exception 'Tipo de documento inválido.' using errcode='23514';end if;
  insert into public.pet_documentos(organization_id,pet_id,revisao_id,tipo) values(p_org,pid,p.revisao_atual_id,d->>'tipo');ret_tipo:='pet';ret_id:=pid;
 elsif cmd='retificar' then
  perform public.ag_payload(d,array['pet_id','expected_version','evento_id','momento_corrigido','motivo']);
  -- Guarda a proposta e a evidência anterior. Não altera silenciosamente os intervalos oficiais.
  if not exists(select 1 from public.pet_eventos_presenca where organization_id=p_org and pet_id=pid and id=(d->>'evento_id')::uuid) then raise exception 'Evento indisponível.' using errcode='23514';end if;
  insert into public.pet_eventos_operacionais(organization_id,pet_id,tipo,motivo,dados) values(p_org,pid,'retificacao_solicitada',public.ag_texto(d,'motivo',10,4000),jsonb_build_object('evento_id',d->>'evento_id','momento_corrigido',d->>'momento_corrigido','situacao','aguardando_procedimento_aprovado'));
  update public.pet_permissoes set version=version where id=pid;ret_tipo:='pet';ret_id:=pid;
 else raise exception 'Comando PET não reconhecido.' using errcode='23514';end if;
 insert into public.operacao_historico(organization_id,entidade,entidade_id,operacao,motivo) values(p_org,case ret_tipo when 'pet' then 'pet_permissoes' when 'os' then 'ordens_servico' when 'espaco' then 'pet_espacos' else 'pet_modelo_versoes' end,ret_id,cmd,d->>'motivo');
 r:=jsonb_build_object('tipo',ret_tipo,'id',ret_id,'pet_id',case when ret_tipo='pet' then ret_id end);
 perform public.operacao_concluir(p_org,chave,'pet:'||cmd,d,r);
 if ret_tipo='pet' then return r||jsonb_build_object('detalhe',public.pet_obter(p_org,ret_id));end if;return r;
end$$;

-- Adaptador de validação exclusiva do servidor. HTTP precisa validar assinatura criptográfica
-- do callback antes de invocar; booleano enviado pelo navegador nunca chega a esta função.
create function public.pet_validar_assinatura(p_org uuid,p_assinatura uuid,p_provedor text,p_evento text,p_validacao jsonb) returns void language plpgsql security definer set search_path='' as $$
declare s public.pet_assinaturas;h text:=public.pet_sha256(p_validacao);old_hash text;old_sign uuid;begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('pet-callback:'||p_org::text||p_provedor||p_evento,0));
 select * into s from public.pet_assinaturas where organization_id=p_org and id=p_assinatura for update;
 if not found or s.metodo<>'certificada_icp_brasil' or not exists(select 1 from public.pet_assinatura_integracoes where organization_id=p_org and provedor=p_provedor and configurada and icp_brasil) then raise exception 'Integração ou assinatura indisponível.' using errcode='23514';end if;
 perform 1 from public.pet_permissoes where organization_id=p_org and id=s.pet_id and revisao_atual_id=s.revisao_id and estado_documental not in('cancelada','encerrada') for update;
 if not found then raise exception 'Conteúdo ou estado divergente.' using errcode='23514';end if;
 if p_validacao->>'conteudo_sha256' is distinct from s.conteudo_sha256 or p_validacao->>'pessoa_id' is distinct from s.pessoa_id::text or p_validacao->>'revisao_id' is distinct from s.revisao_id::text or p_validacao->>'icp_brasil' is distinct from 'true' or p_validacao->>'cadeia_valida' is distinct from 'true' or p_validacao->>'identidade_verificada' is distinct from 'true' or length(coalesce(p_validacao->>'provedor_id',''))<3 or jsonb_typeof(p_validacao->'identidade') is distinct from 'object' or coalesce(p_validacao->>'artefato_original_sha256','')!~'^[0-9a-f]{64}$' or nullif(p_validacao->>'assinada_em','') is null then raise exception 'Falha na validação da identidade, certificado ou conteúdo.' using errcode='23514';end if;
 select payload_sha256,assinatura_id into old_hash,old_sign from public.pet_assinatura_callbacks where organization_id=p_org and provedor=p_provedor and evento_id=p_evento;
 if found then if old_hash<>h or old_sign<>p_assinatura then raise exception 'Callback repetido com conteúdo divergente.' using errcode='23505';end if;return;end if;
 if s.estado<>'pendente' then raise exception 'Assinatura já finalizada ou inconsistente.' using errcode='23514';end if;
 insert into public.pet_assinatura_callbacks(organization_id,provedor,evento_id,assinatura_id,payload_sha256) values(p_org,p_provedor,p_evento,p_assinatura,h);
 update public.pet_assinaturas set estado='validada',provedor=p_provedor,provedor_id=p_validacao->>'provedor_id',identidade_verificada=p_validacao->'identidade',validacao=p_validacao,assinada_em=(p_validacao->>'assinada_em')::timestamptz where id=p_assinatura;
end$$;
create function public.pet_assinatura_guard() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' or old.estado in('validada','falha','coletada','aceite_registrado') or(to_jsonb(new)-array['estado','provedor','provedor_id','identidade_verificada','validacao','assinada_em']) is distinct from(to_jsonb(old)-array['estado','provedor','provedor_id','identidade_verificada','validacao','assinada_em']) then raise exception 'Identidade, finalidade e conteúdo de assinatura são imutáveis.' using errcode='23514';end if;return new;
end$$;
create trigger pet_assinatura_guard before update or delete on public.pet_assinaturas for each row execute function public.pet_assinatura_guard();
create function public.pet_modelo_guard() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' or old.estado<>'rascunho' or (to_jsonb(new)-array['estado','aprovado_por','aprovado_em','declaracao_aprovacao']) is distinct from(to_jsonb(old)-array['estado','aprovado_por','aprovado_em','declaracao_aprovacao']) then raise exception 'Procedimento versionado é imutável. Publique uma nova versão.' using errcode='23514';end if;return new;
end$$;
create trigger pet_modelo_guard before update or delete on public.pet_modelo_versoes for each row execute function public.pet_modelo_guard();
-- Sessões comuns só dispõem dos quatro contratos públicos. Helpers permanecem internos.
do $$declare f record;begin
 for f in select oid::regprocedure as assinatura from pg_catalog.pg_proc where pronamespace='public'::regnamespace and(proname like 'pet_%' or proname='os_ler') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.assinatura);
 end loop;
end$$;
grant execute on function public.pet_listar(uuid,jsonb),public.pet_obter(uuid,uuid),public.pet_opcoes(uuid),public.pet_executar(uuid,jsonb),public.pet_ler(uuid,uuid),public.os_ler(uuid,uuid) to authenticated;
grant execute on function public.pet_validar_assinatura(uuid,uuid,text,text,jsonb) to service_role;
notify pgrst,'reload schema';
