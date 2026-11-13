-- Três originais históricos excedem 50 MiB. O envio operacional continua limitado a 20 MiB.
alter table public.inspecoes_arquivos drop constraint inspecoes_arquivos_bytes_check;
alter table public.inspecoes_arquivos add constraint inspecoes_arquivos_bytes_check check (
  bytes between 1 and 52428800
  or (bytes between 52428801 and 157286400 and mime='application/pdf' and papel='original'
    and registro_id is not null and levantamento_id is null and contrato_id is null
    and estado='original_verificado' and created_by is null)
);

alter table nexus_inspecoes_transferencia.objetos drop constraint objetos_bytes_check;
alter table nexus_inspecoes_transferencia.objetos add constraint objetos_bytes_check check (
  bytes between 1 and 52428800
  or (bytes between 52428801 and 157286400 and mime='application/pdf' and caminho like '%/original.pdf')
);

-- A política continua restrita ao bucket privado e ao caminho opaco reservado.
update storage.buckets set file_size_limit=157286400 where id='inspecoes-acervo' and not public;
