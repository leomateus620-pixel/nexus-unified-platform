import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listarCadastrosCliente, obterCliente } from "./clientes.functions";
import type {
  Cadastro,
  Cliente,
  Contato,
  HistoricoCliente,
  Lista,
  ListGrupo,
  SituacaoFiltro,
  Unidade,
} from "./schemas";

type Rows = {
  clientes: Cliente;
  unidades: Unidade;
  contatos: Contato;
  historico: HistoricoCliente;
};
export function useCadastroList<K extends ListGrupo>(
  org: string,
  grupo: K,
  cliente: string | null,
  busca: string,
  situacao: SituacaoFiltro,
  pagina: number,
  limite = 25,
  enabled = true,
) {
  const load = useServerFn(listarCadastrosCliente);
  return useQuery({
    queryKey: ["clientes", org, "operacional", grupo, cliente, busca, situacao, pagina, limite],
    enabled: !!org && enabled && (grupo === "clientes" || !!cliente),
    queryFn: ({ signal }) =>
      load({
        signal,
        data: { organization_id: org, grupo, cliente_id: cliente, busca, situacao, pagina, limite },
      }) as Promise<Lista<Rows[K]>>,
  });
}
export function useClienteDetail(org: string, id: string | null) {
  const load = useServerFn(obterCliente);
  return useQuery({
    queryKey: ["clientes", org, "ficha", id],
    enabled: !!org && !!id,
    queryFn: ({ signal }) => load({ data: { organization_id: org, id: id! }, signal }),
  });
}
export function useDebouncedSearch(text: string, delay = 250) {
  const [value, setValue] = useState(text);
  useEffect(() => {
    const timer = setTimeout(() => setValue(text), delay);
    return () => clearTimeout(timer);
  }, [text, delay]);
  return value;
}
export function cadastroNome(row: Cadastro) {
  return "razao_social" in row ? row.nome_exibicao || row.razao_social : row.nome;
}
